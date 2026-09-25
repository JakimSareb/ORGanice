// ORG Mode para Eli: acciones de la vista GTD. Cada cambio se aplica al fichero de la tarea
// (aunque no sea el abierto) con ELI_IN_FILE y después se sincroniza ese fichero.
import { fromJS, List } from 'immutable';
import { ActionTypes } from 'redux-undo';
import { createRawDescriptionText, generateTitleLine } from '../export_org';
import { timestampForDate } from '../timestamps';
import generateId from '../id_generator';
import { sync, setDirty } from '../../actions/org';
import { KEYWORD_FOR_LIST, PRIORITY_RE } from './gtd_model';
import { showMessage } from '../eli_prompt';
import { fileDisplayName } from '../eli_app_name';

// Estados que el fichero reconoce (#+TODO:). Si falta uno, Org lo leería como parte del título,
// así que no se escribe y se avisa.
const fileKeywords = (getState, path) => {
  const sets = getState().org.present.getIn(['files', path, 'todoKeywordSets']);
  const out = new Set();
  (sets || List()).forEach((set) => (set.get('keywords') || List()).forEach((k) => out.add(k)));
  if (!out.size) ['TODO', 'DONE'].forEach((k) => out.add(k));
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
  const list = (items || List()).filter(
    (p) => (p.get('property') || '').toUpperCase() !== name.toUpperCase()
  );
  if (value === null || value === undefined || String(value).trim() === '') return list;
  return list.push(
    fromJS({ id: generateId(), property: name, value: [{ type: 'text', contents: String(value) }] })
  );
};

const setPlanning = (items, type, date) => {
  const list = (items || List()).filter((p) => p.get('type') !== type);
  if (!date) return list;
  return list.push(
    fromJS({ id: generateId(), type, timestamp: timestampForDate(date, { isActive: true }) })
  );
};

const sameDay = (a, b) =>
  (!a && !b) ||
  (a && b && a.toDateString && b.toDateString && a.toDateString() === b.toDateString());

/**
 * Guardar los cambios de una tarea.
 * changes: { rawTitle, notes, list, priority, tags, area, energy, effort, scheduled, deadline }
 */
export const gtdSaveTask = (task, changes) => (dispatch, getState) => {
  const header = headerOf(getState, task.path, task.id);
  if (!header) return;
  const dontIndent = getState().base.get('eliIndentOnExport') !== true;
  const logIntoDrawer = getState().base.get('shouldLogIntoDrawer');
  const inner = [];

  // 1) Cuerpo: notas, planificación y propiedades
  let h = header;
  if (changes.notes !== undefined) h = h.set('rawDescription', changes.notes);
  if (changes.scheduled !== undefined && !sameDay(changes.scheduled, task.scheduled)) {
    h = h.set('planningItems', setPlanning(h.get('planningItems'), 'SCHEDULED', changes.scheduled));
  }
  if (changes.deadline !== undefined && !sameDay(changes.deadline, task.deadline)) {
    h = h.set('planningItems', setPlanning(h.get('planningItems'), 'DEADLINE', changes.deadline));
  }
  if (changes.area !== undefined && (changes.area || null) !== (task.ownArea || null)) {
    h = h.set('propertyListItems', setProperty(h.get('propertyListItems'), 'AREA', changes.area));
  }
  if (changes.energy !== undefined && (changes.energy || null) !== (task.energy || null)) {
    h = h.set(
      'propertyListItems',
      setProperty(h.get('propertyListItems'), 'ENERGY', changes.energy)
    );
  }
  if (changes.effort !== undefined && (changes.effort || null) !== (task.effort || null)) {
    h = h.set(
      'propertyListItems',
      setProperty(h.get('propertyListItems'), 'EFFORT', changes.effort)
    );
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
  if (changes.list !== undefined) {
    const keyword =
      changes.list === 'done'
        ? 'DONE'
        : Object.prototype.hasOwnProperty.call(KEYWORD_FOR_LIST, changes.list)
        ? KEYWORD_FOR_LIST[changes.list]
        : task.keyword;
    if ((keyword || null) !== (task.keyword || null)) {
      inner.push({
        type: 'SET_TODO_STATE',
        headerId: task.id,
        newTodoState: keyword || '',
        logIntoDrawer,
        timestamp: new Date(),
        dirtying: true,
      });
    }
  }

  if (!inner.length) return;
  const newKeyword = inner.find((a) => a.type === 'SET_TODO_STATE');
  const needed = [
    inner.some((a) => a.type === 'UPDATE_HEADER_TITLE') ? task.keyword : null,
    newKeyword ? newKeyword.newTodoState : null,
  ];
  if (missingKeyword(getState, task.path, needed)) return;
  dispatch(inFile(task.path, inner));
  syncFile(dispatch, task.path);
};

export const gtdToggleDone = (task) => (dispatch) =>
  dispatch(gtdSaveTask(task, { list: task.isDone ? 'later' : 'done' }));

export const gtdToggleStar = (task) => (dispatch) =>
  dispatch(gtdSaveTask(task, { priority: task.priority === 'A' ? null : 'A' }));

/**
 * Nueva tarea. target: { path, parentId? } · fields: { title, list, area, tags }
 */
export const gtdAddTask = (target, fields) => (dispatch, getState) => {
  if (!target || !target.path || !getState().org.present.getIn(['files', target.path, 'headers']))
    return null;
  const dontIndent = getState().base.get('eliIndentOnExport') !== true;
  const keyword =
    fields.list === 'project'
      ? 'PROJECT'
      : fields.list && Object.prototype.hasOwnProperty.call(KEYWORD_FOR_LIST, fields.list)
      ? KEYWORD_FOR_LIST[fields.list]
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
  let planning = List();
  if (fields.scheduled) planning = setPlanning(planning, 'SCHEDULED', fields.scheduled);
  if (fields.deadline) planning = setPlanning(planning, 'DEADLINE', fields.deadline);
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
    .set('planningItems', planning);
  const description =
    props.size || planning.size ? createRawDescriptionText(fake, false, dontIndent) : '';
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

export const gtdDeleteTask = (task) => (dispatch) => {
  dispatch(inFile(task.path, { type: 'REMOVE_HEADER', headerId: task.id, dirtying: true }));
  syncFile(dispatch, task.path);
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
    if (before.getIn([path, 'headers']) !== file.get('headers')) {
      dispatch(setDirty(true, path));
      dispatch(sync({ path, forceAction: 'push', shouldSuppressMessages: true }));
    }
  });
};
export const gtdUndo = () => undoRedo(ActionTypes.UNDO);
export const gtdRedo = () => undoRedo(ActionTypes.REDO);
