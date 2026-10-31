// ORG Mode para Eli (4.48): Personas y Agendas — lo que toca ficheros (thunks). El modelo puro
// está en lib/gtd/gtd_persons.js y lib/gtd/gtd_agendas.js.
import { List } from 'immutable';
import { getGtdFiles } from './gtd_sections';
import { gtdAddTask, gtdSaveTask } from './gtd_actions';
import { newOrgId, propertyValue, TYPE_PROPERTY } from './gtd_model';
import {
  PERSON_PROPERTY,
  PERSONAS_NAME,
  AGENDAS_NAME,
  REUNIONES_NAME,
  PERSONAS_TEMPLATE,
  pathNear,
  parseContacts,
  parsePersonLinks,
  personLinksValue,
  personLink,
  contactNamed,
} from './gtd_persons';
import {
  toggleBodyCheckbox,
  parseAgendas,
  agendaChoices,
  agendaNode,
  isDoneKeyword,
} from './gtd_agendas';
import { askPick, askConfirm, showMessage } from '../eli_prompt';
import { loadFileQuietly, createPlainFile } from '../../actions/org';
import { setLoadingMessage, hideLoadingMessage } from '../../actions/base';

const filesOf = (state) => state.org.present.get('files');
const userPaths = (state) => {
  const files = filesOf(state);
  return files
    ? files.keySeq().filter((p) => p && p.startsWith('/') && !p.startsWith('/__'))
    : null;
};
const findLoaded = (state, re) => {
  const ps = userPaths(state);
  return ps ? ps.find((p) => re.test(p)) : null;
};
// Carpeta de referencia: la del fichero de tareas (o la del de entrada)
const basePath = (state) => {
  const g = getGtdFiles();
  return (
    g.tasks ||
    findLoaded(state, /(^|\/)tasks\.org$/i) ||
    g.inbox ||
    findLoaded(state, /(^|\/)inbox\.org$/i) ||
    (userPaths(state) && userPaths(state).first()) ||
    '/tasks.org'
  );
};
export const personasPathFor = (state) =>
  getGtdFiles().personas || pathNear(basePath(state), PERSONAS_NAME);
export const agendasPathFor = (state) =>
  getGtdFiles().agendas || pathNear(basePath(state), AGENDAS_NAME);

const isLoaded = (getState, path) => !!filesOf(getState()).getIn([path, 'headers']);

// Cargar (en silencio) un fichero; con `create`, si no existe se pregunta si crearlo
export const ensurePeopleFile = (path, { create = null } = {}) => async (dispatch, getState) => {
  if (isLoaded(getState, path)) return true;
  dispatch(setLoadingMessage(`Cargando ${path.split('/').pop()}…`));
  await Promise.resolve(dispatch(loadFileQuietly(path))).catch(() => null);
  dispatch(hideLoadingMessage());
  if (isLoaded(getState, path) || !create) return isLoaded(getState, path);
  const ok = await askConfirm({
    title: create.title,
    message: `No se encuentra ${path}. ¿Crearlo?`,
    okLabel: 'Crear',
  });
  if (!ok) return false;
  if (!(await dispatch(createPlainFile(path, create.text)))) return false;
  await Promise.resolve(dispatch(loadFileQuietly(path))).catch(() => null);
  return isLoaded(getState, path);
};

export const contactsFromState = (state) => {
  const path = personasPathFor(state);
  return parseContacts(filesOf(state).get(path), path);
};

// Contacto nuevo (cabecera de nivel 1 con :ID: al final de personas.org) → { id, title } o null
export const createContact = (name) => async (dispatch, getState) => {
  const clean = String(name || '')
    .replace(/[[\]]/g, '')
    .trim();
  if (!clean) return null;
  const path = personasPathFor(getState());
  const ok = await dispatch(
    ensurePeopleFile(path, { create: { title: 'Personas', text: PERSONAS_TEMPLATE } })
  );
  if (!ok) return null;
  const already = contactNamed(contactsFromState(getState()), clean);
  if (already && already.orgId) return { id: already.orgId, title: already.name };
  const orgId = newOrgId();
  const id = dispatch(
    gtdAddTask(
      { path },
      { title: clean, keyword: null, props: { ID: orgId, [TYPE_PROPERTY]: 'persona' } }
    )
  );
  return id ? { id: orgId, title: clean } : null;
};

// :ID: de un contacto que no lo tiene (se le pone)
const ensureContactId = (contact) => (dispatch) => {
  if (contact.orgId) return contact.orgId;
  const orgId = newOrgId();
  dispatch(gtdSaveTask({ path: contact.path, id: contact.headerId }, { props: { ID: orgId } }));
  return orgId;
};

/**
 * Buscador de contactos con «👤 Nuevo contacto «texto»» siempre al final (con algo escrito).
 * `linked` = ids ya puestos (salen marcados con ✓). → { id, title } o null (Cancelar)
 */
export const pickPerson = ({ title = 'Persona', linked = [] } = {}) => async (
  dispatch,
  getState
) => {
  const path = personasPathFor(getState());
  await dispatch(ensurePeopleFile(path));
  const contacts = contactsFromState(getState());
  const on = new Set(linked.map((x) => String(x).toLowerCase()));
  const chosen = await askPick({
    title,
    placeholder: 'Buscar o crear contacto…',
    emptyText: 'Aún no hay contactos: escribe un nombre para crearlo.',
    newAlways: true,
    items: contacts.map((c, i) => ({
      id: String(i),
      label: `${c.orgId && on.has(c.orgId.toLowerCase()) ? '✓ ' : ''}${c.name}`,
      hint: [c.empresa, c.email].filter(Boolean).join(' · '),
      keywords: (c.aliases || []).join(' '),
    })),
    newItem: (raw) => ({ label: `👤 Nuevo contacto «${raw}»`, hint: path.split('/').pop() }),
  });
  if (chosen === null || chosen === undefined) return null;
  if (typeof chosen === 'object' && chosen.new) return dispatch(createContact(chosen.new));
  const c = contacts[Number(chosen)];
  if (!c) return null;
  const orgId = dispatch(ensureContactId(c));
  return orgId ? { id: orgId, title: c.name } : null;
};

// Personas de una cabecera de cualquier fichero cargado → [{ id, title }]
const headerOf = (getState, path, headerId) =>
  (filesOf(getState()).getIn([path, 'headers']) || List()).find((h) => h.get('id') === headerId);
export const headingPersonLinks = (getState, path, headerId) => {
  const h = headerOf(getState, path, headerId);
  return h ? parsePersonLinks(propertyValue(h, PERSON_PROPERTY)) : [];
};

// Poner las personas de una cabecera (lista vacía = quitar :PERSONA:)
export const setHeadingPersons = (path, headerId, links) => (dispatch) =>
  dispatch(
    gtdSaveTask(
      { path, id: headerId },
      { props: { [PERSON_PROPERTY]: personLinksValue(links) || null } }
    )
  );

// Menú ⋯ de Documentos › «Persona…»: elegir una persona; si ya estaba, se quita
export const pickPersonForHeading = (path, headerId) => async (dispatch, getState) => {
  const now = headingPersonLinks(getState, path, headerId);
  const p = await dispatch(pickPerson({ title: 'Persona', linked: now.map((x) => x.id) }));
  if (!p) return null;
  const fresh = headingPersonLinks(getState, path, headerId);
  const has = fresh.some((x) => x.id.toLowerCase() === p.id.toLowerCase());
  dispatch(
    setHeadingPersons(
      path,
      headerId,
      has ? fresh.filter((x) => x.id.toLowerCase() !== p.id.toLowerCase()) : [...fresh, p]
    )
  );
  return { ...p, removed: has };
};

// Abrir la ficha de una persona (componente de EliHeadingViews)
export const openPersonCard = (orgId) =>
  window.dispatchEvent(new CustomEvent('eli:person', { detail: { orgId } }));

// ---------------- Agendas (4.50: árbol de cabeceras) ----------------

export const agendasFromState = (state) => {
  const path = agendasPathFor(state);
  return parseAgendas(filesOf(state).get(path), contactsFromState(state), path);
};

export const reunionesPathFor = (state) =>
  getGtdFiles().reuniones || pathNear(basePath(state), REUNIONES_NAME);

const oneLine = (text) =>
  String(text || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

/**
 * Punto nuevo en una agenda = SUBCABECERA (nivel de la elegida + 1) al FINAL de sus hijos, sin
 * estado. target = { headerId } (cualquier cabecera de agendas.org: persona, lugar o punto) o
 * { person: { id, title } } (persona sin cabecera: «* Nombre» con :PERSONA: al final del fichero y
 * debajo el punto). `notes` pasa a las notas del punto. → id de la cabecera nueva o false.
 */
export const agendaAddPoint = (target, text, notes = '') => async (dispatch, getState) => {
  const clean = oneLine(text);
  if (!clean || !target) return false;
  const path = agendasPathFor(getState());
  const fields = { title: clean, keyword: null, notes: String(notes || '').replace(/\s+$/, '') };
  if (target.headerId) {
    if (!headerOf(getState, path, target.headerId)) return false;
    return dispatch(gtdAddTask({ path, parentId: target.headerId }, fields)) || false;
  }
  if (!target.person) return false;
  const ok = await dispatch(
    ensurePeopleFile(path, { create: { title: 'Agendas', text: '#+TITLE: Agendas\n' } })
  );
  if (!ok) return false;
  // ¿ya tiene agenda (por nombre o por :PERSONA:)?
  const existing = agendasFromState(getState()).persons.find(
    (a) => a.person.id.toLowerCase() === target.person.id.toLowerCase()
  );
  if (existing) return dispatch(agendaAddPoint({ headerId: existing.headerId }, clean, notes));
  const root = dispatch(
    gtdAddTask(
      { path },
      {
        title: target.person.title,
        keyword: null,
        props: {
          [PERSON_PROPERTY]: personLink(target.person.id, target.person.title),
          [TYPE_PROPERTY]: 'agenda',
        },
      }
    )
  );
  if (!root) return false;
  return dispatch(gtdAddTask({ path, parentId: root }, fields)) || false;
};

// Marcar / desmarcar la casilla de una línea del cuerpo de una agenda (casillas viejas)
export const agendaToggle = (headerId, lineIndex) => (dispatch, getState) => {
  const path = agendasPathFor(getState());
  const h = headerOf(getState, path, headerId);
  if (!h) return false;
  const body = h.get('rawDescription') || '';
  const next = toggleBodyCheckbox(body, lineIndex);
  if (next === body) return false;
  dispatch(gtdSaveTask({ path, id: headerId }, { notes: next }));
  return true;
};

// Punto tratado: pone DONE (o lo quita si ya lo tenía). Solo cambia la palabra de estado.
export const agendaToggleDone = (headerId) => (dispatch, getState) => {
  const path = agendasPathFor(getState());
  const h = headerOf(getState, path, headerId);
  if (!h) return false;
  const keyword = h.getIn(['titleLine', 'todoKeyword']) || null;
  const next = isDoneKeyword(keyword) ? null : 'DONE';
  dispatch(gtdSaveTask({ path, id: headerId, keyword }, { keyword: next }));
  return true;
};

/**
 * Elegir dónde colgar un punto: personas primero y luego lugares, cada uno con sus puntos debajo
 * (a cualquier nivel), y los contactos sin agenda («agenda nueva»). → { headerId } | { person } o
 * null (Cancelar)
 */
export const pickAgenda = ({ title = 'Hablar con… (Agenda)' } = {}) => async (
  dispatch,
  getState
) => {
  await dispatch(ensurePeopleFile(agendasPathFor(getState())));
  await dispatch(ensurePeopleFile(personasPathFor(getState())));
  const ag = agendasFromState(getState());
  const contacts = contactsFromState(getState());
  const rows = [];
  agendaChoices(ag).forEach(({ node, depth, root }) =>
    rows.push({
      target: { headerId: node.headerId },
      label: depth ? node.title : root.person ? root.person.name : node.title,
      hint: depth ? '' : root.person ? 'persona' : 'lugar / ocasión',
      depth,
    })
  );
  const withAgenda = new Set(ag.persons.map((a) => a.person.id.toLowerCase()));
  contacts
    .filter((c) => !c.orgId || !withAgenda.has(c.orgId.toLowerCase()))
    .forEach((c) =>
      rows.push({ contact: c, label: c.name, hint: 'contacto (agenda nueva)', depth: 0 })
    );
  const chosen = await askPick({
    title,
    placeholder: 'Persona, lugar o punto…',
    emptyText: 'No hay agendas ni contactos: escribe un nombre para crear el contacto.',
    items: rows.map((r, i) => ({ id: String(i), label: r.label, hint: r.hint, depth: r.depth })),
    newItem: (raw) => ({ label: `👤 Nuevo contacto «${raw}»`, hint: 'y su agenda' }),
  });
  if (chosen === null || chosen === undefined) return null;
  if (typeof chosen === 'object' && chosen.new) {
    const p = await dispatch(createContact(chosen.new));
    return p ? { person: p } : null;
  }
  const r = rows[Number(chosen)];
  if (!r) return null;
  if (r.target) return r.target;
  const orgId = dispatch(ensureContactId(r.contact));
  return orgId ? { person: { id: orgId, title: r.contact.name } } : null;
};

// Pasar un texto (y sus notas) a una agenda elegida como SUBCABECERA → nombre de la agenda o null
export const sendToAgenda = (text, notes = '') => async (dispatch, getState) => {
  const target = await dispatch(pickAgenda());
  if (!target) return null;
  if (!(await dispatch(agendaAddPoint(target, text, notes)))) {
    showMessage('Agenda', 'No se ha podido añadir el punto.');
    return null;
  }
  if (target.person) return target.person.title;
  const ag = agendasFromState(getState());
  let n = agendaNode(ag, target.headerId);
  while (n && n.parentId) n = agendaNode(ag, n.parentId);
  return n ? (n.person && n.person.name) || n.title : 'Agenda';
};

// «Convertir en contacto» un ítem de agenda cuyo texto es un nombre («- [ ] Xus»): crea el
// contacto y cambia el texto por [[id:…][Xus]] (solo esa línea)
export const agendaItemToContact = (headerId, lineIndex) => async (dispatch, getState) => {
  const path = agendasPathFor(getState());
  const h = headerOf(getState, path, headerId);
  if (!h) return false;
  const lines = (h.get('rawDescription') || '').split('\n');
  const line = lines[lineIndex] || '';
  const m = /^(\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?)(.+?)\s*$/.exec(line);
  if (!m || /\[\[/.test(m[2])) return false;
  const p = await dispatch(createContact(m[2]));
  if (!p) return false;
  const h2 = headerOf(getState, path, headerId);
  if (!h2) return false;
  const lines2 = (h2.get('rawDescription') || '').split('\n');
  if (lines2[lineIndex] !== line) return false;
  lines2[lineIndex] = `${m[1]}${personLink(p.id, m[2])}`;
  dispatch(gtdSaveTask({ path, id: headerId }, { notes: lines2.join('\n') }));
  return true;
};
