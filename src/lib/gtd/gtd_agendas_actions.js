// ORG Mode para Eli (4.50): «Llevar a reunión…» — mueve puntos de agendas.org (subcabeceras, con
// todo su contenido y subpuntos, conservando su :ID:) a una cabecera de reuniones.org. Vive en un
// fichero aparte porque junta el selector de eli_heading_links y los thunks de personas.
import { List } from 'immutable';
import {
  gtdRefileTo,
  gtdAddTask,
  addTaskAction,
  setProperty,
  gtdDeleteTask,
  gtdSaveTask,
} from './gtd_actions';
import { pickRefileTarget } from '../eli_heading_links';
import { askConfirm, askPick, showMessage } from '../eli_prompt';
import {
  createPlainFile,
  loadFileQuietly,
  selectHeaderAndOpenParents,
  eliCurrentView,
  openHeader,
  setDirty,
  sync,
} from '../../actions/org';
import { activatePopup } from '../../actions/base';
import { markView, pushView, sameView } from '../eli_nav_history';
import { headerSubtreeText, withFreshIds, parseHeadersText } from '../eli_header_clipboard';
import {
  agendasPathFor,
  reunionesPathFor,
  personasPathFor,
  agendasFromState,
  contactsFromState,
  ensurePeopleFile,
} from './gtd_persons_actions';
import { agendaOfProject, agendaNode, isDoneKeyword } from './gtd_agendas';
import {
  newOrgId,
  propertyValue,
  TYPE_PROPERTY,
  PROJECT_LINK_PROPERTY,
  projectLinkFor,
  inboxTag,
  projectsOf,
  PRIORITY_RE,
} from './gtd_model';
import { PERSON_PROPERTY, personLinksValue } from './gtd_persons';
import {
  MEETING_TYPE,
  meetingsIn,
  meetingDateLine,
  templatesIn,
  transcriptBody,
  isOrgSummary,
} from './gtd_meetings';
import { getGtdFiles } from './gtd_sections';
import { loadedTasks, pickProject } from './gtd_assign';

const isLoaded = (getState, path) => !!getState().org.present.getIn(['files', path, 'headers']);
const filesOf = (state) => state.org.present.get('files');
const headerOf = (getState, path, headerId) =>
  (filesOf(getState()).getIn([path, 'headers']) || List()).find((h) => h.get('id') === headerId) ||
  null;
const dontIndent = (getState) => getState().base.get('eliIndentOnExport') !== true;

// reuniones.org cargado (si no existe, se pregunta si crearlo) → true/false
export const ensureReuniones = () => async (dispatch, getState) => {
  const to = reunionesPathFor(getState());
  if (!isLoaded(getState, to))
    await Promise.resolve(dispatch(loadFileQuietly(to))).catch(() => null);
  if (isLoaded(getState, to)) return true;
  const ok = await askConfirm({
    title: 'Reuniones',
    message: `No se encuentra ${to}. ¿Crearlo?`,
    okLabel: 'Crear',
  });
  if (!ok || !(await dispatch(createPlainFile(to, '#+TITLE: Reuniones\n')))) return false;
  await Promise.resolve(dispatch(loadFileQuietly(to))).catch(() => null);
  return isLoaded(getState, to);
};

/**
 * Llevar los puntos `headerIds` (de agendas.org) a reuniones.org: se elige la cabecera de destino
 * (o el nivel superior) y se mueven en un solo paso de Deshacer. Si reuniones.org no existe se
 * pregunta si crearlo. → nº de puntos movidos (0 = nada / cancelado)
 */
export const agendaToMeeting = (headerIds) => async (dispatch, getState) => {
  const ids = (headerIds || []).filter(Boolean);
  if (!ids.length) return 0;
  const from = agendasPathFor(getState());
  const to = reunionesPathFor(getState());
  if (!(await dispatch(ensureReuniones()))) return 0;
  const target = await dispatch(
    pickRefileTarget({
      title:
        ids.length === 1 ? 'Llevar a la reunión…' : `Llevar ${ids.length} puntos a la reunión…`,
      onlyPath: to,
      allowNew: true,
    })
  );
  if (!target) return 0;
  // (4.57) «＋ Nueva subcabecera aquí…»: se crea dentro de la elegida y los puntos van a ella
  let targetId = target.headerId;
  if (target.newTitle) {
    // (4.60) si hay plantillas (:TYPE: plantilla), se puede insertar una en la cabecera nueva
    const tpl = templatesIn(filesOf(getState())).length
      ? templateContent(getState, await dispatch(pickTemplate({ optional: true })), target.path)
      : null;
    const add = addTaskAction(
      getState,
      target.headerId ? { path: target.path, parentId: target.headerId } : { path: target.path },
      { title: target.newTitle, keyword: null, notes: tpl ? tpl.notes : '' }
    );
    targetId = add ? add.headerId : null;
    if (add) {
      dispatch(
        tpl && tpl.headers.size
          ? inFileAction(target.path, [
              add.action.inner,
              { type: 'ELI_PASTE_HEADERS', headerId: add.headerId, headers: tpl.headers },
            ])
          : add.action
      );
    }
    if (!targetId) {
      showMessage('Reunión', 'No se ha podido crear la subcabecera.');
      return 0;
    }
  }
  const n = dispatch(
    gtdRefileTo(
      ids.map((id) => ({ path: from, id, key: `${from}::${id}` })),
      target.path,
      targetId
    )
  );
  if (!n) showMessage('Reunión', 'No se ha podido llevar el punto.');
  return n;
};

// ---------------- (4.60) Agendas de proyecto y «Nueva reunión» ----------------

const inFileAction = (path, inner) => ({ type: 'ELI_IN_FILE', path, inner, dirtying: true });
const syncPaths = (dispatch, paths) =>
  Array.from(new Set(paths)).forEach((p) => {
    dispatch(setDirty(true, p));
    dispatch(sync({ path: p, shouldSuppressMessages: true }));
  });

// :ID: de un proyecto (tarea del modelo); si no lo tiene, la acción que se lo pone
const projectIdAction = (getState, project) => {
  if (!project) return { orgId: null, action: null };
  const h = headerOf(getState, project.path, project.id);
  const orgId = project.orgId || (h && propertyValue(h, 'ID')) || null;
  if (orgId || !h) return { orgId, action: null };
  const fresh = newOrgId();
  return {
    orgId: fresh,
    action: inFileAction(project.path, {
      type: 'UPDATE_PROPERTY_LIST_ITEMS',
      headerId: project.id,
      newPropertyListItems: setProperty(h.get('propertyListItems'), 'ID', fresh),
      dirtying: true,
    }),
  };
};

// Proyectos de los ficheros cargados (para elegir)
export const loadedProjects = (state) => projectsOf(loadedTasks(state));

/**
 * Agenda de un proyecto (tarea del modelo con path/id/title): si no existe, se crea al final de
 * agendas.org («* Título» con :PROYECTO: y :TYPE: agenda); si el proyecto no tiene :ID:, se le
 * pone (único cambio en su fichero). → id de la cabecera de la agenda o null
 */
export const createProjectAgenda = (project) => async (dispatch, getState) => {
  if (!project) return null;
  const path = agendasPathFor(getState());
  const ok = await dispatch(
    ensurePeopleFile(path, { create: { title: 'Agendas', text: '#+TITLE: Agendas\n' } })
  );
  if (!ok) return null;
  const { orgId, action } = projectIdAction(getState, project);
  if (!orgId) return null;
  const existing = agendaOfProject(agendasFromState(getState()), orgId);
  if (existing) return existing.headerId;
  const add = addTaskAction(
    getState,
    { path },
    {
      title: project.title,
      keyword: null,
      props: {
        [PROJECT_LINK_PROPERTY]: projectLinkFor(orgId, project.title),
        [TYPE_PROPERTY]: 'agenda',
      },
    }
  );
  if (!add) return null;
  dispatch(
    action ? { type: 'ELI_BATCH', actions: [action, add.action], dirtying: true } : add.action
  );
  syncPaths(dispatch, action ? [project.path, path] : [path]);
  return add.headerId;
};

// Elegir un proyecto y devolver su agenda (creándola si hace falta) → { headerId } o null
export const pickProjectAgenda = () => async (dispatch, getState) => {
  const projects = loadedProjects(getState());
  const p = await pickProject(projects, { title: 'Agenda del proyecto' });
  if (!p) return null;
  const headerId = await dispatch(createProjectAgenda(p));
  return headerId ? { headerId } : null;
};

// Plantillas (:TYPE: plantilla) de los ficheros cargados para elegir → { path, headerId, title }
export const pickTemplate = ({ optional = false } = {}) => async (dispatch, getState) => {
  const list = templatesIn(filesOf(getState()));
  const chosen = await askPick({
    title: optional ? 'Insertar plantilla (Cancelar = sin plantilla)' : 'Insertar plantilla…',
    placeholder: 'Buscar plantilla…',
    emptyText:
      'No hay plantillas. Una plantilla es cualquier cabecera con la propiedad «:TYPE: plantilla» ' +
      '(en cualquier fichero cargado): sus notas y subcabeceras se copian en la nueva.',
    items: list.map((t, i) => ({
      id: String(i),
      label: t.title,
      hint: t.path.split('/').pop(),
    })),
  });
  if (chosen === null || chosen === undefined || typeof chosen === 'object') return null;
  return list[Number(chosen)] || null;
};

// Contenido de una plantilla para copiarlo bajo una cabecera nueva: sus notas y sus subcabeceras
// (ya analizadas, con :ID: NUEVOS; regla 4.54) → { notes, headers (List) } o null
export const templateContent = (getState, template, targetPath) => {
  if (!template) return null;
  const headers = filesOf(getState()).getIn([template.path, 'headers']);
  const root = headerOf(getState, template.path, template.headerId);
  if (!headers || !root) return null;
  const notes = String(root.get('rawDescription') || '').replace(/\s+$/, '');
  const text = withFreshIds(
    headerSubtreeText(headers, template.headerId, { dontIndent: dontIndent(getState) })
  );
  const parsed = parseHeadersText(
    text,
    filesOf(getState()).getIn([targetPath, 'todoKeywordSets']) || List()
  );
  return { notes, headers: parsed.rest() };
};

/**
 * Nueva reunión en reuniones.org (al FINAL): «* título» con :TYPE: meeting, :ID:, :CREATED:,
 * :PERSONA: (asistentes) y :PROYECTO: (si se eligió); en las notas la fecha como timestamp
 * INACTIVO (+ las notas de la plantilla). Debajo: los puntos ABIERTOS de la agenda de origen (si
 * `bringPoints`; movidos con todo su contenido y su :ID:), las subcabeceras de la plantilla y la
 * transcripción («** Transcripción», o «** Acta» si ya viene en formato Org). Todo en UN paso de
 * Deshacer. → { path, headerId, orgId } o null
 *   opts = { title, persons: [{ id, title }], project (tarea del modelo) | null, agendaId,
 *            bringPoints, template ({ path, headerId }) | null, transcript, date }
 */
export const createMeeting = ({
  title,
  persons = [],
  project = null,
  agendaId = null,
  bringPoints = true,
  template = null,
  transcript = '',
  date = new Date(),
} = {}) => async (dispatch, getState) => {
  const clean = String(title || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  if (!clean) return null;
  if (!(await dispatch(ensureReuniones()))) return null;
  const path = reunionesPathFor(getState());
  const actions = [];
  const touched = [path];
  const pid = projectIdAction(getState, project);
  if (pid.action) {
    actions.push(pid.action);
    touched.push(project.path);
  }
  const tpl = templateContent(getState, template, path);
  const orgId = newOrgId();
  const notes = [meetingDateLine(date), tpl && tpl.notes ? tpl.notes : '']
    .filter(Boolean)
    .join('\n');
  const add = addTaskAction(
    getState,
    { path },
    {
      title: clean,
      keyword: null,
      created: true,
      notes,
      props: {
        [TYPE_PROPERTY]: MEETING_TYPE,
        ID: orgId,
        [PERSON_PROPERTY]: personLinksValue(persons) || null,
        [PROJECT_LINK_PROPERTY]: pid.orgId ? projectLinkFor(pid.orgId, project.title) : null,
      },
    }
  );
  if (!add) return null;
  const inner = [add.action.inner];
  const keywordSets = filesOf(getState()).getIn([path, 'todoKeywordSets']) || List();
  if (tpl && tpl.headers.size)
    inner.push({ type: 'ELI_PASTE_HEADERS', headerId: add.headerId, headers: tpl.headers });
  const tr = String(transcript || '').trim();
  if (tr) {
    const head = isOrgSummary(tr) ? 'Acta' : 'Transcripción';
    const text = `* ${head}\n${transcriptBody(tr, 1)}\n`;
    const parsed = parseHeadersText(text, keywordSets);
    if (parsed.size)
      inner.push({ type: 'ELI_PASTE_HEADERS', headerId: add.headerId, headers: parsed });
  }
  actions.push(inFileAction(path, inner));
  // los puntos abiertos de la agenda de origen (los tratados se quedan)
  let moved = 0;
  if (bringPoints && agendaId) {
    const from = agendasPathFor(getState());
    const node = agendaNode(agendasFromState(getState()), agendaId);
    const open = node ? node.children.filter((c) => !c.done) : [];
    // bajo una cabecera, cada uno va justo detrás de ella: al revés para conservar el orden
    [...open].reverse().forEach((c) =>
      actions.push({
        type: 'REFILE_SUBTREE',
        sourcePath: from,
        sourceHeaderId: c.headerId,
        targetPath: path,
        targetHeaderId: add.headerId,
        dirtying: true,
      })
    );
    moved = open.length;
    if (moved) touched.push(from);
  }
  dispatch({ type: 'ELI_BATCH', actions, dirtying: true });
  syncPaths(dispatch, touched);
  return { path, headerId: add.headerId, orgId, moved };
};

// Puntos abiertos (sin DONE) de una agenda, para el cuadro «Nueva reunión»
export const openPointsOf = (state, agendaId) => {
  const node = agendaId ? agendaNode(agendasFromState(state), agendaId) : null;
  return node ? node.children.filter((c) => !isDoneKeyword(c.keyword)).length : 0;
};

/**
 * Abrir una cabecera en Documentos (con su vista en el historial atrás/adelante); con
 * `editNotes`, además se abren sus notas para escribir (el acta).
 */
export const openHeadingInDocs = ({ path, headerId, editNotes = false }) => async (
  dispatch,
  getState
) => {
  if (!isLoaded(getState, path))
    await Promise.resolve(dispatch(loadFileQuietly(path))).catch(() => null);
  const origin = eliCurrentView(getState());
  const target = { path, narrowId: null };
  if (!sameView(origin, target)) markView(origin);
  if (!pushView(`/file${path}`, target))
    window.dispatchEvent(new CustomEvent('eli:navigate', { detail: `/file${path}` }));
  dispatch(selectHeaderAndOpenParents(path, headerId, { widen: true }));
  if (editNotes)
    setTimeout(() => {
      dispatch(openHeader(headerId));
      dispatch(activatePopup('description-editor'));
    }, 150);
};

/**
 * Tareas del acta al Inbox (procesado Allen después): cada una con :PERSONA: (si se reconoció) y
 * un enlace por ID a la reunión en sus notas. items = [{ text, person }] → nº creadas
 */
export const meetingTasksToInbox = (items, meeting) => (dispatch, getState) => {
  const g = getGtdFiles();
  const files = filesOf(getState());
  const loaded = (p) => p && files.getIn([p, 'headers']);
  const findLoaded = (re) =>
    files.keySeq().find((p) => p && p.startsWith('/') && re.test(p) && loaded(p)) || null;
  const inbox = (loaded(g.inbox) && g.inbox) || findLoaded(/(^|\/)inbox\.org$/i);
  const path = inbox || (loaded(g.tasks) && g.tasks) || findLoaded(/(^|\/)tasks\.org$/i);
  if (!path) {
    showMessage('Tareas del acta', 'No se encuentra el fichero de entrada (Inbox).');
    return 0;
  }
  let n = 0;
  (items || []).forEach((it) => {
    const id = dispatch(
      gtdAddTask(
        { path },
        {
          title: it.text,
          list: 'inbox',
          tags: inbox ? [] : [inboxTag()],
          created: true,
          notes:
            meeting && meeting.orgId ? `Reunión: [[id:${meeting.orgId}][${meeting.title}]]` : '',
          props: it.person ? { [PERSON_PROPERTY]: personLinksValue([it.person]) } : {},
        }
      )
    );
    if (id) n++;
  });
  return n;
};

// ---------------- (4.60) Eliminar personas, reuniones y agendas ----------------

/**
 * Borrar una cabecera entera (contacto, reunión o agenda) tras confirmar; se puede deshacer. Los
 * enlaces que apuntan a ella (p. ej. :PERSONA: de otras tareas) NO se tocan (quedan atenuados).
 * → true si se borró
 */
export const deleteHeading = ({ path, headerId, what, title, extra = '' }) => async (
  dispatch,
  getState
) => {
  if (!headerOf(getState, path, headerId)) return false;
  const ok = await askConfirm({
    title: `Eliminar ${what}`,
    message: `¿Eliminar «${title}»?${extra ? ` ${extra}` : ''} (se puede deshacer)`,
    okLabel: 'Eliminar',
  });
  if (!ok) return false;
  dispatch(gtdDeleteTask({ path, id: headerId }));
  return true;
};

// Claves «fichero::id» de las reuniones de reuniones.org (para no repetirlas en otras listas)
export const reunionesMeetingIds = (state) => {
  const path = reunionesPathFor(state);
  return new Set(meetingsIn(filesOf(state).get(path), path).map((m) => `${path}::${m.headerId}`));
};

// Contacto de personas.org (por su :ID:) → { path, headerId, name } o null
export const contactRef = (state, orgId) => {
  const path = personasPathFor(state);
  const c = contactsFromState(state).find(
    (x) => x.orgId && x.orgId.toLowerCase() === String(orgId).toLowerCase()
  );
  return c ? { path, headerId: c.headerId, name: c.name, contact: c } : null;
};

// Renombrar una cabecera (solo el texto del título; estado, prioridad y etiquetas se conservan)
export const renameHeading = (path, headerId, title) => (dispatch, getState) => {
  const h = headerOf(getState, path, headerId);
  const clean = String(title || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  if (!h || !clean) return false;
  const rawTitle = h.getIn(['titleLine', 'rawTitle']) || '';
  const pm = PRIORITY_RE.exec(rawTitle);
  dispatch(
    gtdSaveTask(
      {
        path,
        id: headerId,
        keyword: h.getIn(['titleLine', 'todoKeyword']) || null,
        priority: pm ? pm[1] : null,
        rawTitle,
        ownTags: (h.getIn(['titleLine', 'tags']) || List()).toArray().filter(Boolean),
      },
      { rawTitle: clean }
    )
  );
  return true;
};
