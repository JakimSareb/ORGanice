// ORG Mode para Eli: acciones de la vista GTD. Cada cambio se aplica al fichero de la tarea
// (aunque no sea el abierto) con ELI_IN_FILE y después se sincroniza ese fichero.
import { fromJS, List } from 'immutable';
import formatDate from 'date-fns/format';
import { ActionTypes } from 'redux-undo';
import { createRawDescriptionText, generateTitleLine } from '../export_org';
import { timestampForDate } from '../timestamps';
import generateId from '../id_generator';
import { sync, setDirty, archiveSubtree } from '../../actions/org';
import {
  keywordForList,
  PRIORITY_RE,
  parseRepeat,
  doneInLists,
  doneInValueFor,
  doneWaitingCleanup,
  tagsForList,
  TRASH_TAG,
  propertyValue,
  PROJECT_LINK_PROPERTY,
  projectLinkFor,
  newOrgId,
} from './gtd_model';
import { showMessage } from '../eli_prompt';
import { defaultKeywords, ENERGY_PROPERTY, EFFORT_PROPERTY } from '../eli_todo_defaults';
import { fileDisplayName } from '../eli_app_name';
import { getGtdFiles } from './gtd_sections';

// Estados que el fichero reconoce (#+TODO:). Si falta uno, Org lo leería como parte del título,
// así que no se escribe y se avisa.
const fileKeywords = (getState, path) => {
  const sets = getState().org.present.getIn(['files', path, 'todoKeywordSets']);
  const out = new Set();
  (sets || List()).forEach((set) => (set.get('keywords') || List()).forEach((k) => out.add(k)));
  if (!out.size) defaultKeywords().forEach((k) => out.add(k));
  return out;
};
const missingKeyword = (getState, path, keywords) => {
  const known = fileKeywords(getState, path);
  const missing = keywords.filter((k) => k && !known.has(k));
  if (!missing.length) return false;
  showMessage(
    'Falta un estado en el fichero',
    `El fichero «${fileDisplayName(path)}» no tiene el estado ${missing.join(', ')} en su línea ` +
      `#+TODO, así que no se ha hecho el cambio (si no, se estropearía el título).\n\n` +
      `Añade al principio del fichero, por ejemplo:\n` +
      `#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED`
  );
  return true;
};

const inFile = (path, inner) => ({ type: 'ELI_IN_FILE', path, inner, dirtying: true });

const headerOf = (getState, path, headerId) => {
  const headers = getState().org.present.getIn(['files', path, 'headers']) || List();
  return headers.find((h) => h.get('id') === headerId) || null;
};

const syncFile = (dispatch, path) => {
  dispatch(setDirty(true, path));
  dispatch(sync({ path, shouldSuppressMessages: true }));
};

// (2.17) Fichero de tareas al que pasan las tareas del de entrada: el elegido en Ajustes o, si no,
// tasks.org (el de ruta más corta); solo si está cargado
export const tasksFileForRefile = (state) => {
  const files = state.org.present.get('files');
  const loaded = (p) => !!p && !!files.getIn([p, 'headers']);
  const chosen = getGtdFiles().tasks;
  if (chosen) return loaded(chosen) ? chosen : null;
  const named = files
    .keySeq()
    .toArray()
    .filter((p) => loaded(p) && /(^|\/)tasks\.org$/i.test(p))
    .sort((a, b) => a.length - b.length)[0];
  return named || null;
};

// Una tarea del fichero de entrada, sin estado y de primer nivel, que va a recibir uno: pasa
// al fichero de tareas (los encabezados sin estado se quedan en la entrada)
const refileTargetFor = (getState, task, newKeyword) => {
  if (!task.isInboxFile || task.keyword || !newKeyword || task.level !== 1) return null;
  if (!getGtdFiles().moveFromInbox) return null;
  const target = tasksFileForRefile(getState());
  return target && target !== task.path ? target : null;
};

// Línea de título (sin asteriscos) a partir de sus partes
export const titleLineFrom = ({ keyword, priority, rawTitle, tags }) => {
  const title = (rawTitle || '').replace(PRIORITY_RE, '').trim();
  return generateTitleLine(
    {
      nestingLevel: 1,
      titleLine: {
        todoKeyword: keyword || null,
        rawTitle: `${priority ? `[#${priority}] ` : ''}${title}`,
        tags: (tags || []).filter(Boolean),
      },
    },
    false
  );
};

const setProperty = (items, name, value) => {
  const all = items || List();
  const same = (p) => (p.get('property') || '').toUpperCase() === name.toUpperCase();
  const empty = value === null || value === undefined || String(value).trim() === '';
  if (empty) return all.filter((p) => !same(p));
  const contents = fromJS([{ type: 'text', contents: String(value) }]);
  const index = all.findIndex(same);
  // Si ya existe, se cambia en su sitio (y con su nombre tal cual); si no, se añade
  if (index >= 0) {
    const kept = all.filter((p, i) => i === index || !same(p));
    return kept.setIn([kept.findIndex(same), 'value'], contents);
  }
  return all.push(fromJS({ id: generateId(), property: name, value: [] }).set('value', contents));
};

// ORG Mode para Eli: pone la fecha conservando la hora y la repetición que tuviera. `repeat`:
// undefined = dejar la que haya; '' o null = quitarla; «+1w», «.+2d»… = ponerla.
const KEEP_FIELDS = [
  'startHour',
  'startMinute',
  'endHour',
  'endMinute',
  'delayType',
  'delayValue',
  'delayUnit',
];
const REPEAT_FIELDS = ['repeaterType', 'repeaterValue', 'repeaterUnit'];
const setPlanning = (items, type, date, repeat) => {
  const all = items || List();
  const old = all.find((p) => p.get('type') === type);
  const list = all.filter((p) => p.get('type') !== type);
  if (!date) return list;
  let ts = fromJS(timestampForDate(date, { isActive: true }));
  const oldTs = old && old.get('timestamp');
  if (oldTs) {
    KEEP_FIELDS.forEach((f) => (ts = ts.set(f, oldTs.get(f) === undefined ? null : oldTs.get(f))));
    if (repeat === undefined) {
      REPEAT_FIELDS.forEach(
        (f) => (ts = ts.set(f, oldTs.get(f) === undefined ? null : oldTs.get(f)))
      );
    }
  }
  if (repeat !== undefined) {
    const r = parseRepeat(repeat);
    ts = ts
      .set('repeaterType', r ? r.type : null)
      .set('repeaterValue', r ? r.value : null)
      .set('repeaterUnit', r ? r.unit : null);
  }
  const item = fromJS({ id: old ? old.get('id') : generateId(), type }).set('timestamp', ts);
  // en su sitio (SCHEDULED antes que DEADLINE, como estuviera)
  const index = all.findIndex((p) => p.get('type') === type);
  return index >= 0
    ? all.filter((p, i) => i === index || p.get('type') !== type).set(index, item)
    : list.push(item);
};

const sameDay = (a, b) =>
  (!a && !b) ||
  (a && b && a.toDateString && b.toDateString && a.toDateString() === b.toDateString());

// ¿Colocarla junto a esa otra no cambia nada? (ya está ahí, o sería meterla dentro de sí misma)
const subtreeSize = (headers, index) => {
  const level = headers.getIn([index, 'nestingLevel']);
  let n = 1;
  while (index + n < headers.size && headers.getIn([index + n, 'nestingLevel']) > level) n++;
  return n;
};
export const isNoopMove = (getState, path, headerId, targetId, position) => {
  const headers = getState().org.present.getIn(['files', path, 'headers']) || List();
  const i = headers.findIndex((h) => h.get('id') === headerId);
  const j = headers.findIndex((h) => h.get('id') === targetId);
  if (i < 0 || j < 0) return true;
  const size = subtreeSize(headers, i);
  if (j >= i && j < i + size) return true;
  const sameLevel = headers.getIn([i, 'nestingLevel']) === headers.getIn([j, 'nestingLevel']);
  if (!sameLevel) return false;
  if (position === 'after') return j + subtreeSize(headers, j) === i;
  return j === i + size;
};

/**
 * Guardar los cambios de una tarea.
 * changes: { rawTitle, notes, list, priority, tags, area, energy, effort, scheduled, deadline,
 *            moveNextTo: { targetId, position: 'before' | 'after' } }
 */
// (3.0) Las acciones de guardar una tarea, sin despacharlas (para poder juntar varias tareas en
// un solo paso de Deshacer). Devuelve { path, inner, refileTo } o null.
const buildSaveTask = (getState, task, changes) => {
  const header = headerOf(getState, task.path, task.id);
  if (!header) return null;
  const dontIndent = getState().base.get('eliIndentOnExport') !== true;
  const logIntoDrawer = getState().base.get('shouldLogIntoDrawer');
  const inner = [];

  // 1) Cuerpo: notas, planificación y propiedades
  let h = header;
  if (changes.notes !== undefined) h = h.set('rawDescription', changes.notes);
  const repeatChanged = (next, now) => next !== undefined && (next || '') !== (now || '');
  if (
    (changes.scheduled !== undefined && !sameDay(changes.scheduled, task.scheduled)) ||
    repeatChanged(changes.scheduledRepeat, task.scheduledRepeat)
  ) {
    const date = changes.scheduled !== undefined ? changes.scheduled : task.scheduled;
    h = h.set(
      'planningItems',
      setPlanning(h.get('planningItems'), 'SCHEDULED', date, changes.scheduledRepeat)
    );
  }
  if (
    (changes.deadline !== undefined && !sameDay(changes.deadline, task.deadline)) ||
    repeatChanged(changes.deadlineRepeat, task.deadlineRepeat)
  ) {
    const date = changes.deadline !== undefined ? changes.deadline : task.deadline;
    h = h.set(
      'planningItems',
      setPlanning(h.get('planningItems'), 'DEADLINE', date, changes.deadlineRepeat)
    );
  }
  if (changes.area !== undefined && (changes.area || null) !== (task.ownArea || null)) {
    h = h.set('propertyListItems', setProperty(h.get('propertyListItems'), 'AREA', changes.area));
  }
  if (changes.energy !== undefined && (changes.energy || null) !== (task.energy || null)) {
    h = h.set(
      'propertyListItems',
      setProperty(h.get('propertyListItems'), ENERGY_PROPERTY, changes.energy)
    );
  }
  if (changes.effort !== undefined && (changes.effort || null) !== (task.effort || null)) {
    h = h.set(
      'propertyListItems',
      setProperty(h.get('propertyListItems'), EFFORT_PROPERTY, changes.effort)
    );
  }
  // (3.01) propiedades sueltas: { NOMBRE: valor } (null o '' la quita)
  if (changes.props) {
    Object.keys(changes.props).forEach((name) => {
      const v = changes.props[name];
      if ((v || null) === (propertyValue(h, name) || null)) return;
      h = h.set('propertyListItems', setProperty(h.get('propertyListItems'), name, v));
    });
  }
  // (3.0) DONE_IN (grupo «Hecho» de su lista): se pone al terminarla desde GTD y se quita al
  // reabrirla, al llevarla a otra lista o con la «Limpieza»
  let doneIn = changes.doneIn;
  if (
    doneIn === undefined &&
    task.doneIn &&
    changes.list !== undefined &&
    !['done', 'cancelled'].includes(changes.list)
  ) {
    doneIn = null;
  }
  if (doneIn !== undefined && (doneIn || null) !== (task.doneIn || null)) {
    h = h.set('propertyListItems', setProperty(h.get('propertyListItems'), 'DONE_IN', doneIn));
  }
  if (h !== header) {
    inner.push({
      type: 'UPDATE_HEADER_DESCRIPTION',
      headerId: task.id,
      newRawDescription: createRawDescriptionText(h, false, dontIndent),
      dirtying: true,
    });
  }

  // 2) Título: texto, prioridad y etiquetas (con el estado actual)
  const newTitle = changes.rawTitle !== undefined ? changes.rawTitle : task.rawTitle;
  const newPriority = changes.priority !== undefined ? changes.priority : task.priority;
  const newTags = changes.tags !== undefined ? changes.tags : task.ownTags;
  const titleLine = titleLineFrom({
    keyword: task.keyword,
    priority: newPriority,
    rawTitle: newTitle,
    tags: newTags,
  });
  const oldLine = titleLineFrom({
    keyword: task.keyword,
    priority: task.priority,
    rawTitle: task.rawTitle,
    tags: task.ownTags,
  });
  if (titleLine !== oldLine) {
    inner.push({
      type: 'UPDATE_HEADER_TITLE',
      headerId: task.id,
      newRawTitle: titleLine,
      dirtying: true,
    });
  }

  // 3) Estado (lista): con SET_TODO_STATE para que se añada/quite CLOSED como siempre
  if (changes.list !== undefined || changes.keyword !== undefined) {
    // (2.16) changes.keyword: estado exacto (p. ej. el primero de una sección propia)
    const keyword =
      changes.keyword !== undefined
        ? changes.keyword || null
        : changes.list === 'done'
        ? 'DONE'
        : changes.list === 'cancelled'
        ? 'CANCELLED'
        : changes.list === 'project'
        ? 'PROJECT'
        : keywordForList(changes.list).has
        ? keywordForList(changes.list).keyword
        : task.keyword;
    if ((keyword || null) !== (task.keyword || null)) {
      inner.push({
        type: 'SET_TODO_STATE',
        headerId: task.id,
        newTodoState: keyword || '',
        logIntoDrawer,
        timestamp: new Date(),
        dirtying: true,
        eliEnsureCookie: true,
      });
    }
  }

  // 4) ORG Mode para Eli (2.15): colocarla junto a otra tarea del mismo fichero (reordenar
  // arrastrando); va en el mismo paso, así un solo «Deshacer» lo deshace todo
  const move = changes.moveNextTo;
  if (
    move &&
    move.targetId &&
    move.targetId !== task.id &&
    !isNoopMove(getState, task.path, task.id, move.targetId, move.position)
  ) {
    inner.push({
      type: 'ELI_MOVE_SUBTREE_NEXT_TO',
      headerId: task.id,
      targetId: move.targetId,
      position: move.position === 'after' ? 'after' : 'before',
      dirtying: true,
    });
  }

  // 5) ORG Mode para Eli (2.18): hacerla subtarea de otra tarea del mismo fichero, o sacarla
  if (changes.parentTaskId !== undefined) inner.push(parentAction(task, changes.parentTaskId));

  if (!inner.length) return null;
  const newKeyword = inner.find((a) => a.type === 'SET_TODO_STATE');
  // (2.17) al darle estado a una tarea de inbox.org, pasa a tasks.org en el mismo paso
  const refileTo =
    move || changes.parentTaskId !== undefined
      ? null
      : refileTargetFor(getState, task, newKeyword && newKeyword.newTodoState);
  if (refileTo && !missingKeyword(getState, refileTo, [newKeyword.newTodoState])) {
    inner.push({
      type: 'REFILE_SUBTREE',
      sourcePath: task.path,
      sourceHeaderId: task.id,
      targetPath: refileTo,
      targetHeaderId: null,
      dirtying: true,
    });
  }
  const needed = [
    inner.some((a) => a.type === 'UPDATE_HEADER_TITLE') ? task.keyword : null,
    newKeyword ? newKeyword.newTodoState : null,
  ];
  if (missingKeyword(getState, task.path, needed)) return null;
  return {
    path: task.path,
    inner,
    refileTo: inner.some((a) => a.type === 'REFILE_SUBTREE') ? refileTo : null,
  };
};

export const gtdSaveTask = (task, changes) => (dispatch, getState) => {
  const r = buildSaveTask(getState, task, changes);
  if (!r) return;
  dispatch(inFile(r.path, r.inner));
  syncFile(dispatch, r.path);
  if (r.refileTo) syncFile(dispatch, r.refileTo);
};

// (3.0) Varias tareas a la vez (selección múltiple, Limpieza, Papelera…): un solo paso de
// Deshacer. entries: [[task, changes], …]. Las de un mismo fichero van juntas.
export const gtdSaveMany = (entries) => (dispatch, getState) => {
  const actions = [];
  const paths = new Set();
  entries.forEach(([task, changes]) => {
    // cada una se calcula sobre el estado ya cambiado por las anteriores
    const r = buildSaveTask(getState, task, changes);
    if (!r) return;
    const a = inFile(r.path, r.inner);
    actions.push(a);
    paths.add(r.path);
    if (r.refileTo) paths.add(r.refileTo);
  });
  if (!actions.length) return 0;
  dispatch({ type: 'ELI_BATCH', actions, dirtying: true });
  paths.forEach((p) => syncFile(dispatch, p));
  return actions.length;
};

// (3.0) Acciones sueltas (borrar, copiar…) sobre varios ficheros en un solo paso de Deshacer
const batchInFiles = (dispatch, byPath) => {
  const paths = Object.keys(byPath).filter((p) => byPath[p].length);
  if (!paths.length) return 0;
  dispatch({
    type: 'ELI_BATCH',
    actions: paths.map((p) => inFile(p, byPath[p])),
    dirtying: true,
  });
  paths.forEach((p) => syncFile(dispatch, p));
  return paths.reduce((n, p) => n + byPath[p].length, 0);
};

// (2.17) Botón «Refile»: pasa al fichero de tareas todas las tareas con estado que siguen en el
// de entrada (de primer nivel). Devuelve cuántas se han movido.
export const gtdRefileInbox = (tasks) => (dispatch, getState) => {
  const target = tasksFileForRefile(getState());
  if (!target) return 0;
  const todo = tasks.filter(
    (t) => t.isInboxFile && t.keyword && t.level === 1 && t.path !== target
  );
  if (!todo.length) return 0;
  const sources = Array.from(new Set(todo.map((t) => t.path)));
  const files = getState().org.present.get('files');
  const needed = Array.from(new Set(todo.map((t) => t.keyword)));
  if (missingKeyword(getState, target, needed)) return 0;
  todo.forEach((t) => {
    if (!files.getIn([t.path, 'headers'])) return;
    dispatch({
      type: 'REFILE_SUBTREE',
      sourcePath: t.path,
      sourceHeaderId: t.id,
      targetPath: target,
      targetHeaderId: null,
      dirtying: true,
    });
  });
  sources.concat(target).forEach((p) => syncFile(dispatch, p));
  return todo.length;
};

// (3.02) Reordenar arrastrando: colocar la tarea antes o después de otra, aunque esté en otro
// fichero o bajo otro encabezado (en otro fichero: se pasa allí y se coloca junto a ella, todo en
// un solo paso de Deshacer). Devuelve false si no se puede (el fichero destino no conoce su estado).
export const gtdPlaceNextTo = (task, target, position) => (dispatch, getState) => {
  if (!task || !target || task.key === target.key) return false;
  const pos = position === 'after' ? 'after' : 'before';
  if (task.path === target.path) {
    dispatch(gtdSaveTask(task, { moveNextTo: { targetId: target.id, position: pos } }));
    return true;
  }
  const files = getState().org.present.get('files');
  if (!files.getIn([task.path, 'headers']) || !files.getIn([target.path, 'headers'])) return false;
  // el estado de la tarea y el de sus subtareas tienen que existir en el fichero de destino
  const srcHeaders = files.getIn([task.path, 'headers']);
  const at = srcHeaders.findIndex((h) => h.get('id') === task.id);
  if (at < 0) return false;
  const lvl = srcHeaders.getIn([at, 'nestingLevel']);
  const kws = [];
  for (let i = at; i < srcHeaders.size; i++) {
    if (i > at && srcHeaders.getIn([i, 'nestingLevel']) <= lvl) break;
    const k = srcHeaders.getIn([i, 'titleLine', 'todoKeyword']);
    if (k && !kws.includes(k)) kws.push(k);
  }
  if (kws.length && missingKeyword(getState, target.path, kws)) return false;
  dispatch({
    type: 'ELI_BATCH',
    actions: [
      {
        type: 'REFILE_SUBTREE',
        sourcePath: task.path,
        sourceHeaderId: task.id,
        targetPath: target.path,
        targetHeaderId: null,
        dirtying: true,
      },
      inFile(target.path, [
        {
          type: 'ELI_MOVE_SUBTREE_NEXT_TO',
          headerId: task.id,
          targetId: target.id,
          position: pos,
          dirtying: true,
        },
      ]),
    ],
    dirtying: true,
  });
  syncFile(dispatch, task.path);
  syncFile(dispatch, target.path);
  return true;
};

// ORG Mode para Eli (2.15): reordenar: poner la tarea antes o después de otra del mismo fichero
export const gtdMoveNextTo = (task, targetId, position) => (dispatch) =>
  dispatch(gtdSaveTask(task, { moveNextTo: { targetId, position } }));

// (3.0) Terminar: va al grupo «Hecho» de su lista (DONE_IN) hasta la «Limpieza» (salvo que en
// Ajustes se pida pasarlas al Logbook al momento). Reabrir: vuelve a la lista en la que estaba.
export const LS_AUTO_COLLECT = 'eliGtdAutoCollect';
export const autoCollect = () => {
  try {
    return window.localStorage.getItem(LS_AUTO_COLLECT) === 'true';
  } catch (e) {
    return false;
  }
};
export const doneChangesFor = (task, opts = {}) => {
  if (task.isDone) {
    const back = doneInLists(task).find((l) => l !== 'focus') || 'later';
    const list = ['inbox', 'next', 'later', 'waiting', 'someday', 'reference'].includes(back)
      ? back
      : keywordForList(back).has
      ? back
      : 'later';
    const changes = { list, doneIn: null, tags: tagsForList(task, list) };
    if (doneInLists(task).includes('focus')) changes.priority = 'A';
    return changes;
  }
  return {
    list: opts.cancel ? 'cancelled' : 'done',
    doneIn: autoCollect() ? null : doneInValueFor(task, new Date()),
  };
};
export const gtdToggleDone = (task, opts) => (dispatch) =>
  dispatch(gtdSaveTask(task, doneChangesFor(task, opts)));

// (3.0) Limpieza (tecla c): las terminadas de los grupos «Hecho» pasan al Logbook
export const gtdCleanup = (tasks) => (dispatch) =>
  dispatch(gtdSaveMany(doneWaitingCleanup(tasks).map((t) => [t, { doneIn: null }])));

// (3.0) Papelera: tirar (etiqueta :trash:), sacar (se le quita) y vaciar (se borran de verdad)
const withoutTrash = (tags) => (tags || []).filter((t) => t.toLowerCase() !== TRASH_TAG);
export const gtdTrash = (tasks) => (dispatch) =>
  dispatch(
    gtdSaveMany(
      tasks
        .filter((t) => !t.isTrashed)
        .map((t) => [t, { tags: [...withoutTrash(t.ownTags), TRASH_TAG] }])
    )
  );
export const untrashChanges = (task) => ({ tags: withoutTrash(task.ownTags) });
export const gtdEmptyTrash = (tasks) => (dispatch) => {
  const byPath = {};
  tasks
    .filter((t) => t.ownTrash && !t.parentTrashed)
    .forEach((t) =>
      (byPath[t.path] = byPath[t.path] || []).push({
        type: 'REMOVE_HEADER',
        headerId: t.id,
        dirtying: true,
      })
    );
  return batchInFiles(dispatch, byPath);
};

// (3.0) «Hacer una copia…»: una copia exacta justo debajo (con sus subencabezados)
export const gtdDuplicate = (tasks) => (dispatch) => {
  const byPath = {};
  tasks.forEach((t) =>
    (byPath[t.path] = byPath[t.path] || []).push({
      type: 'DUPLICATE_HEADER',
      headerId: t.id,
      dirtying: true,
    })
  );
  return batchInFiles(dispatch, byPath);
};

// (3.0) Gestor de etiquetas (tecla g): renombrar o quitar una etiqueta en todas las tareas, y
// renombrar un área (propiedad AREA)
export const gtdRenameTag = (tasks, from, to) => (dispatch) => {
  const name = String(to || '')
    .trim()
    .replace(/[\s:]+/g, '');
  return dispatch(
    gtdSaveMany(
      tasks
        .filter((t) => (t.ownTags || []).includes(from))
        .map((t) => [
          t,
          {
            tags: Array.from(
              new Set((t.ownTags || []).map((x) => (x === from ? name : x)).filter(Boolean))
            ),
          },
        ])
    )
  );
};
export const gtdRenameArea = (tasks, from, to) => (dispatch) =>
  dispatch(
    gtdSaveMany(
      tasks
        .filter((t) => t.ownArea === from)
        .map((t) => [t, { area: String(to || '').trim() || null }])
    )
  );

export const gtdToggleStar = (task) => (dispatch) =>
  dispatch(gtdSaveTask(task, { priority: task.priority === 'A' ? null : 'A' }));

/**
 * Nueva tarea. target: { path, parentId? } · fields: { title, list, area, tags }
 */
// (2.17) Línea con la fecha de creación de una tarea nueva: «:Created: [2026-10-03 Sat 19:55]»
export const createdLine = (date = new Date()) =>
  `:Created: [${formatDate(date, 'yyyy-MM-dd eee HH:mm')}]`;

export const gtdAddTask = (target, fields) => (dispatch, getState) => {
  if (!target || !target.path || !getState().org.present.getIn(['files', target.path, 'headers']))
    return null;
  const dontIndent = getState().base.get('eliIndentOnExport') !== true;
  // (2.15) fields.keyword: estado exacto (p. ej. el de una plantilla de captura)
  const keyword =
    fields.keyword !== undefined
      ? fields.keyword || null
      : fields.list === 'project'
      ? 'PROJECT'
      : fields.list && keywordForList(fields.list).has
      ? keywordForList(fields.list).keyword
      : null;
  if (missingKeyword(getState, target.path, [keyword])) return null;
  const headerId = generateId();
  const titleLine = titleLineFrom({
    keyword,
    priority: fields.priority || null,
    rawTitle: fields.title,
    tags: fields.tags || [],
  });
  // Cuerpo mínimo con las propiedades/planificación
  let props = List();
  if (fields.area) props = setProperty(props, 'AREA', fields.area);
  if (fields.energy) props = setProperty(props, ENERGY_PROPERTY, fields.energy);
  if (fields.effort) props = setProperty(props, EFFORT_PROPERTY, fields.effort);
  let planning = List();
  if (fields.scheduled)
    planning = setPlanning(planning, 'SCHEDULED', fields.scheduled, fields.scheduledRepeat);
  if (fields.deadline)
    planning = setPlanning(planning, 'DEADLINE', fields.deadline, fields.deadlineRepeat);
  const fake = fromJS({
    nestingLevel: 1,
    titleLine: { rawTitle: '', tags: [] },
    rawDescription: '',
    planningItems: [],
    propertyListItems: [],
    logBookEntries: [],
    logNotes: [],
    description: [],
  })
    .set('propertyListItems', props)
    .set('planningItems', planning)
    .set(
      'rawDescription',
      [fields.created ? createdLine() : '', fields.notes || ''].filter(Boolean).join('\n')
    );
  // (2.15) fields.rawDescription: el cuerpo tal cual (p. ej. el de una plantilla de captura)
  const description =
    fields.rawDescription !== undefined
      ? fields.rawDescription
      : props.size || planning.size || fields.notes || fields.created
      ? createRawDescriptionText(fake, false, dontIndent)
      : '';
  dispatch(
    inFile(target.path, {
      type: 'ELI_ADD_HEADER_AT',
      titleLine,
      description,
      parentId: target.parentId || null,
      headerId,
      dirtying: true,
    })
  );
  syncFile(dispatch, target.path);
  return headerId;
};

// ORG Mode para Eli: cerrar un proyecto (DONE o CANCELLED), y si se pide, cancelar también sus
// tareas abiertas. Todo en un solo paso (un solo Deshacer).
export const gtdCloseProject = (project, state, openTasks = []) => (dispatch, getState) => {
  const keyword = state === 'cancelled' ? 'CANCELLED' : 'DONE';
  const logIntoDrawer = getState().base.get('shouldLogIntoDrawer');
  const byPath = {};
  const add = (path, action) => (byPath[path] = byPath[path] || []).push(action);
  const needed = { [project.path]: [keyword] };
  openTasks.forEach((t) => {
    add(t.path, {
      type: 'SET_TODO_STATE',
      headerId: t.id,
      newTodoState: 'CANCELLED',
      logIntoDrawer,
      timestamp: new Date(),
      dirtying: true,
    });
    needed[t.path] = [...(needed[t.path] || []), 'CANCELLED'];
  });
  // Un proyecto cerrado ya no está dormido
  if ((project.ownTags || []).some((t) => t.toLowerCase() === 'sleep')) {
    add(project.path, {
      type: 'UPDATE_HEADER_TITLE',
      headerId: project.id,
      newRawTitle: titleLineFrom({
        keyword: project.keyword,
        priority: project.priority,
        rawTitle: project.rawTitle,
        tags: project.ownTags.filter((t) => t.toLowerCase() !== 'sleep'),
      }),
      dirtying: true,
    });
  }
  add(project.path, {
    type: 'SET_TODO_STATE',
    headerId: project.id,
    newTodoState: keyword,
    logIntoDrawer,
    timestamp: new Date(),
    dirtying: true,
  });
  if (Object.keys(needed).some((p) => missingKeyword(getState, p, needed[p]))) return;
  const paths = Object.keys(byPath);
  paths.forEach((p) => dispatch(inFile(p, byPath[p])));
  paths.forEach((p) => syncFile(dispatch, p));
};

export const gtdDeleteTask = (task) => (dispatch) => {
  dispatch(inFile(task.path, { type: 'REMOVE_HEADER', headerId: task.id, dirtying: true }));
  syncFile(dispatch, task.path);
};

// (2.18) Tarea ⇄ subtarea (en el mismo fichero): parentId = id de la nueva madre; null = sacarla
// un nivel (queda justo debajo de su antigua madre). Se lleva sus subtareas.
const parentAction = (task, parentId) =>
  parentId
    ? { type: 'ELI_MAKE_SUBTASK_OF', headerId: task.id, parentId, dirtying: true }
    : { type: 'ELI_PROMOTE_SUBTASK', headerId: task.id, dirtying: true };

export const gtdSetParent = (task, parentId) => (dispatch, getState) => {
  if (!getState().org.present.getIn(['files', task.path, 'headers'])) return;
  dispatch(inFile(task.path, [parentAction(task, parentId)]));
  syncFile(dispatch, task.path);
};

// ¿Puede `parent` ser la madre de `task`? Tarea con estado (no proyecto ni terminada), del mismo
// fichero y del mismo proyecto, y que no sea ella misma ni una de sus subtareas.
export const canBeParentOf = (parent, task, allTasks = [], byKey = null) => {
  if (!parent || !task || parent.key === task.key) return false;
  if (parent.path !== task.path || !parent.keyword || parent.isProject || parent.isDone) {
    return false;
  }
  const projId = (t) => (t.project ? t.project.id : null);
  if (projId(parent) !== projId(task)) return false;
  // ¿Es descendiente de task? (subiendo por parentId)
  // (byKey: Map «fichero::id» → tarea ya hecho, para no rehacerlo con cada candidata)
  const index =
    byKey ||
    new Map(allTasks.filter((t) => t.path === task.path).map((t) => [`${t.path}::${t.id}`, t]));
  let cur = parent;
  while (cur && cur.parentId) {
    if (cur.parentId === task.id) return false;
    cur = index.get(`${cur.path}::${cur.parentId}`);
  }
  return true;
};

// Mover (refile) a un proyecto, o fuera de él (al nivel superior del mismo fichero)
export const gtdMoveToProject = (task, project) => (dispatch, getState) => {
  const targetPath = project ? project.path : task.path;
  if (!getState().org.present.getIn(['files', targetPath, 'headers'])) return;
  dispatch({
    type: 'REFILE_SUBTREE',
    sourcePath: task.path,
    sourceHeaderId: task.id,
    targetPath,
    targetHeaderId: project ? project.id : null,
    dirtying: true,
  });
  syncFile(dispatch, task.path);
  if (targetPath !== task.path) syncFile(dispatch, targetPath);
};

// Deshacer/rehacer en la vista GTD: los cambios pueden estar en varios ficheros, así que se
// sincronizan (forzando la subida) todos los que cambian.
const undoRedo = (type) => (dispatch, getState) => {
  const org = getState().org;
  if (type === ActionTypes.UNDO ? !org.past.length : !org.future.length) return;
  const before = org.present.get('files');
  dispatch({ type });
  const after = getState().org.present.get('files');
  after.forEach((file, path) => {
    if (!path || !file || !file.get('headers')) return;
    // (2.16) Los *.org_archive leídos para verlos no se suben al deshacer (podría subirse una
    // versión antigua encima de lo archivado después)
    if (/\.org_archive$/i.test(path)) return;
    if (before.getIn([path, 'headers']) !== file.get('headers')) {
      dispatch(setDirty(true, path));
      dispatch(sync({ path, forceAction: 'push', shouldSuppressMessages: true }));
    }
  });
};
export const gtdUndo = () => undoRedo(ActionTypes.UNDO);
export const gtdRedo = () => undoRedo(ActionTypes.REDO);

// Archivar la tarea (como en la hoja: a su fichero _archive), aunque esté en otro fichero
export const gtdArchiveTask = (task) => (dispatch) => dispatch(archiveSubtree(task.id, task.path));

// (3.01) Asignar tareas o referencias (de cualquier fichero) a un proyecto: «:PROYECTO:
// [[id:UUID][Título]]»; si el proyecto aún no tiene «:ID:», se le pone (como org-id). Las que ya
// son del proyecto por estar dentro de él no se tocan (salvo quitarles otra asignación). Todo en
// un solo Deshacer. Devuelve cuántas se han cambiado.
export const assignProjectEntries = (tasks, project) => {
  if (!project) return [];
  const entries = [];
  let orgId = project.orgId;
  if (!orgId) {
    orgId = newOrgId();
    entries.push([project, { props: { ID: orgId } }]);
  }
  const link = projectLinkFor(orgId, project.title);
  tasks.forEach((t) => {
    if (!t || t.isProject || t.key === project.key) return;
    const structural =
      !t.projectExternal &&
      !!t.project &&
      t.project.path === project.path &&
      t.project.id === project.id &&
      !t.projRefOwn;
    if (structural) return;
    const inside =
      t.path === project.path && t.project && t.project.id === project.id && !t.projectExternal;
    entries.push([t, { props: { [PROJECT_LINK_PROPERTY]: inside ? null : link } }]);
  });
  return entries;
};
export const gtdAssignProject = (tasks, project) => (dispatch) => {
  const entries = assignProjectEntries(tasks, project);
  if (!entries.length) return 0;
  return dispatch(gtdSaveMany(entries));
};
// Quitar la asignación (la tarea sigue donde está, como suelta o en su proyecto de siempre)
export const gtdUnassignProject = (tasks) => (dispatch) =>
  dispatch(
    gtdSaveMany(
      tasks
        .filter((t) => t && t.projRefOwn)
        .map((t) => [t, { props: { [PROJECT_LINK_PROPERTY]: null } }])
    )
  );
