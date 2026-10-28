// ORG Mode para Eli (4.46): acciones del Zettelkasten (usan el store; el modelo puro está en
// eli_zk.js). Se lanzan con el evento `eli:zk` ({ action: 'note' | 'fugaz' | 'point' | 'aliases',
// … }) que escucha components/EliZk, para poder llamarlas desde menús, atajos y botones.
import { List, fromJS } from 'immutable';
import generateId from './id_generator';
import { exportOrg } from './export_org';
import { askChoice, askForm, askPick, askText, showMessage } from './eli_prompt';
import { diaryDir, inboxNear } from './eli_diary';
import { getGtdFiles } from './gtd/gtd_sections';
import { setLoadingMessage, hideLoadingMessage } from '../actions/base';
import { pagesPathFor } from './eli_heading_links';
import { newOrgId } from './gtd/gtd_model';
import { createdStamp, gtdAddTask } from './gtd/gtd_actions';
import { parseAliases } from './eli_roam';
import {
  KIND_LABEL,
  SOURCE_TYPES,
  POINT_TYPES,
  ZK_KINDS,
  normalizeZkFolder,
  zkNotePath,
  zkInboxPath,
  permanentText,
  indexText,
  sourceText,
  addPointToText,
  fugazEntry,
  appendFugaz,
  formatAliases,
  oneLine,
} from './eli_zk';
import {
  CREATED_HEADING,
  parseFugaces,
  removeFugaz,
  fugazText,
  zkNoteInfo,
  pointFullText,
  setPointNote,
  appendToSection,
  appendParagraph,
  permanentNoteText,
  sourceLine,
  idLink,
} from './eli_zk_process';
import {
  createNewFile,
  loadFileQuietly,
  parseFile,
  setDirty,
  sync,
  updatePropertyListItems,
} from '../actions/org';

export const zkCommand = (detail) => window.dispatchEvent(new CustomEvent('eli:zk', { detail }));

// Carpeta ZK resuelta: la del ajuste (relativa a la del fichero de entrada o absoluta)
export const zkDirFor = (state) =>
  diaryDir(
    normalizeZkFolder(state.base.get('eliZkFolder')),
    pagesPathFor({ ...state, base: state.base.set('eliPagesFile', '') })
  );

// Texto actual de un fichero: cargado (se serializa) o leído del servicio → { text, loaded, exists }
// (4.47) `known`: la ruta sale del listado de la carpeta (no hace falta preguntar si existe)
export const readText = async (state, path, { known = false } = {}) => {
  const file = state.org.present.getIn(['files', path]);
  if (file && file.get('headers')) {
    return {
      loaded: true,
      exists: true,
      text: exportOrg({
        headers: file.get('headers'),
        linesBeforeHeadings: file.get('linesBeforeHeadings') || List(),
        dontIndent: state.base.get('eliIndentOnExport') !== true,
      }),
    };
  }
  const client = state.syncBackend && state.syncBackend.get('client');
  if (!client) return { loaded: false, exists: false, text: '' };
  // (4.47) sin `pathExists` (WebDAV): se intenta leer; si falla, no existe
  if (!known && !client.pathExists) {
    try {
      const t = await client.getFileContents(path);
      return { loaded: false, exists: true, text: t || '' };
    } catch (e) {
      return { loaded: false, exists: false, text: '' };
    }
  }
  const exists = known ? true : !!(await client.pathExists(path));
  const text = exists ? (await client.getFileContents(path)) || '' : '';
  return { loaded: false, exists, text };
};

// Escribe el texto entero de un fichero (cargado: se vuelve a analizar y se sincroniza)
export const writeText = async (dispatch, getState, path, info, text) => {
  if (info.loaded) {
    dispatch(parseFile(path, text));
    dispatch(setDirty(true, path));
    dispatch(sync({ path, shouldSuppressMessages: true }));
    return true;
  }
  if (!info.exists) return dispatch(createNewFile(path, text));
  const client = getState().syncBackend.get('client');
  await client.updateFile(path, text);
  return true;
};

// --- Nota nueva (permanente / ficha de fuente / índice) → { orgId, path } o null ---
export const zkNewNote = (kindArg = null) => async (dispatch, getState) => {
  const kind =
    kindArg ||
    (await askChoice({
      title: 'Nueva nota ZK',
      choices: ZK_KINDS.map((k) => ({ id: k, label: KIND_LABEL[k] })),
    }));
  if (!kind) return null;
  const id = newOrgId();
  let title;
  let text;
  if (kind === 'literatura') {
    const f = await askForm({
      title: 'Ficha de fuente',
      okLabel: 'Crear',
      fields: [
        {
          id: 'type',
          label: 'Tipo',
          type: 'select',
          options: SOURCE_TYPES.map((t) => ({ id: t.id, label: t.label })),
        },
        { id: 'title', label: 'Título', required: true },
        { id: 'author', label: 'Autor' },
        { id: 'year', label: 'Año' },
        { id: 'source', label: 'Fuente (editorial, medio o canal)' },
        { id: 'ref', label: 'URL o ISBN', placeholder: 'https://… o 978…' },
      ],
    });
    if (!f) return null;
    title = f.title;
    const isUrl = /^https?:\/\//i.test(f.ref);
    text = sourceText({
      id,
      type: f.type,
      title: f.title,
      author: f.author,
      year: f.year,
      source: f.source,
      url: isUrl ? f.ref : '',
      isbn: !isUrl ? f.ref : '',
    });
  } else {
    title = await askText({
      title: kind === 'indice' ? 'Índice nuevo' : 'Nota permanente nueva',
      message: kind === 'permanente' ? 'El título, como una afirmación.' : '',
      okLabel: 'Crear',
    });
    if (!title) return null;
    text = (kind === 'indice' ? indexText : permanentText)({ title, id });
  }
  const path = zkNotePath(zkDirFor(getState()), kind, title);
  const ok = await dispatch(createNewFile(path, text));
  return ok ? { orgId: id, path } : null;
};

// --- Fugaz: añade `* texto` a ZK/inbox.org ---
export const zkAppendFugaz = (text, { origin = '' } = {}) => async (dispatch, getState) => {
  if (!String(text || '').trim()) return false;
  const path = zkInboxPath(zkDirFor(getState()));
  try {
    const info = await readText(getState(), path);
    const entry = fugazEntry(text, { id: newOrgId(), created: createdStamp(), origin });
    return await writeText(dispatch, getState, path, info, appendFugaz(info.text, entry));
  } catch (e) {
    showMessage('No se pudo guardar la fugaz', String((e && e.message) || e));
    return false;
  }
};

// Caja rápida → true si se guardó
export const zkFugazPrompt = () => async (dispatch) => {
  const f = await askForm({
    title: 'Fugaz ZK',
    okLabel: 'Guardar',
    fields: [{ id: 'text', label: 'Idea fugaz (la primera línea es el título)', type: 'textarea' }],
  });
  if (!f || !f.text) return false;
  return dispatch(zkAppendFugaz(f.text));
};

// --- «+ Punto» en una ficha de fuente ---
// (4.47) `prefill` ({ text, where… }): desde «Procesar fugaces» (la ficha puede no estar abierta)
export const zkAddPoint = (path, prefill = null) => async (dispatch, getState) => {
  const state = getState();
  if (!path || (!prefill && !state.org.present.getIn(['files', path, 'headers']))) return false;
  const pre = prefill || {};
  const f = await askForm({
    title: '+ Punto',
    okLabel: 'Añadir',
    fields: [
      {
        id: 'where',
        label: 'Dónde (página, posición Kindle o minuto)',
        required: false,
        value: pre.where || '',
      },
      { id: 'section', label: 'Sección', value: pre.section || '' },
      {
        id: 'text',
        label: 'Punto o cita',
        type: 'textarea',
        required: true,
        value: pre.text || '',
      },
      {
        id: 'type',
        label: 'Tipo',
        type: 'select',
        options: POINT_TYPES.map((t) => ({ id: t, label: t })),
      },
      { id: 'longQuote', label: 'Cita larga abajo (en «Citas»)', type: 'check', value: false },
    ],
  });
  if (!f) return false;
  const info = await readText(getState(), path);
  if (!info.exists) return false;
  const next = addPointToText(info.text, f, { longQuote: f.longQuote, newId: newOrgId() });
  return writeText(dispatch, getState, path, info, next);
};

// --- Alias de una cabecera (:ROAM_ALIASES:) ---
export const zkEditAliases = (path, headerId) => async (dispatch, getState) => {
  const headers = getState().org.present.getIn(['files', path, 'headers']) || List();
  const header = headers.find((h) => h.get('id') === headerId);
  if (!header) return false;
  const items = header.get('propertyListItems') || List();
  const prop = (n) => items.find((p) => (p.get('property') || '').toUpperCase() === n) || null;
  const cur = prop('ROAM_ALIASES');
  const curText = cur
    ? (cur.get('value') || List()).map((x) => x.get('contents') || '').join('')
    : '';
  const f = await askForm({
    title: 'Alias de la nota',
    message:
      'Otros nombres con los que se busca: separados por espacio, con comillas si llevan espacios.',
    okLabel: 'Guardar',
    fields: [{ id: 'aliases', label: 'Alias', value: formatAliases(parseAliases(curText)) }],
  });
  if (!f) return false;
  const v = f.aliases;
  const value = formatAliases(parseAliases(v));
  let next = items.filter((p) => (p.get('property') || '').toUpperCase() !== 'ROAM_ALIASES');
  if (value)
    next = next.push(
      fromJS({
        id: generateId(),
        property: 'ROAM_ALIASES',
        value: [{ type: 'text', contents: value }],
      })
    );
  dispatch({
    type: 'ELI_IN_FILE',
    path,
    inner: updatePropertyListItems(headerId, next),
    dirtying: true,
  });
  dispatch(setDirty(true, path));
  dispatch(sync({ path, shouldSuppressMessages: true }));
  return true;
};

// =========================================================================================
// (4.47) Procesos ZK: procesar fugaces, asistente de nota permanente, Revisión ZK y Biblioteca.
// El modelo puro está en eli_zk_process.js; la pantalla, en components/EliZk/EliZkProcess.
// =========================================================================================

const isOrgPath = (p) => /\.org$/i.test(p || '');

// Ficheros .org de una carpeta y sus subcarpetas (servicios sin `listAllFiles`, p. ej. WebDAV)
const walkDir = async (client, dir, depth) => {
  const out = [];
  let res;
  try {
    res = await client.getDirectoryListing(dir.replace(/\/+$/, '') || '/');
  } catch (e) {
    return out;
  }
  const raw = res && res.listing;
  const list = raw ? (typeof raw.toJS === 'function' ? raw.toJS() : raw) : [];
  for (const e of list) {
    if (e.isDirectory) {
      if (depth > 0)
        out.push(...(await walkDir(client, `${e.path.replace(/\/+$/, '')}/`, depth - 1)));
    } else out.push(e.path);
  }
  return out;
};

// Rutas de las notas .org de la carpeta ZK (las del servicio y las ya cargadas)
export const zkListPaths = () => async (dispatch, getState) => {
  const dir = zkDirFor(getState());
  const low = dir.toLowerCase();
  const inDir = (p) =>
    String(p || '')
      .toLowerCase()
      .startsWith(low);
  const client = getState().syncBackend && getState().syncBackend.get('client');
  let all = [];
  try {
    if (client && client.listAllFiles) all = ((await client.listAllFiles()) || []).filter(inDir);
    else if (client && client.getDirectoryListing) all = await walkDir(client, dir, 3);
  } catch (e) {
    all = [];
  }
  const loaded = getState()
    .org.present.get('files')
    .keySeq()
    .toArray()
    .filter((p) => inDir(p) && !!getState().org.present.getIn(['files', p, 'headers']));
  return Array.from(new Set([...all, ...loaded]))
    .filter((p) => isOrgPath(p) && !/\/backups?\//i.test(p))
    .sort();
};

/**
 * Todo lo de la carpeta ZK → { dir, inboxPath, inboxText, fugaces, notes }
 * notes: info de zkNoteInfo + `text` (sin el inbox de fugaces).
 */
export const zkCorpus = () => async (dispatch, getState) => {
  const dir = zkDirFor(getState());
  const inboxPath = zkInboxPath(dir);
  const isInbox = (p) => p.toLowerCase() === inboxPath.toLowerCase();
  dispatch(setLoadingMessage('Leyendo notas ZK…'));
  try {
    const paths = await dispatch(zkListPaths());
    const notes = [];
    let inboxText = '';
    for (let i = 0; i < paths.length; i += 6) {
      const chunk = paths.slice(i, i + 6);
      const texts = await Promise.all(
        chunk.map((p) =>
          readText(getState(), p, { known: true })
            .then((r) => r.text)
            .catch(() => null)
        )
      );
      chunk.forEach((p, j) => {
        const t = texts[j];
        if (t == null) return;
        if (isInbox(p)) inboxText = t;
        else notes.push({ ...zkNoteInfo(p, t), text: t });
      });
    }
    if (!paths.some(isInbox)) {
      try {
        inboxText = (await readText(getState(), inboxPath)).text;
      } catch (e) {
        inboxText = '';
      }
    }
    return { dir, inboxPath, inboxText, fugaces: parseFugaces(inboxText), notes };
  } finally {
    dispatch(hideLoadingMessage());
  }
};

// Quita una fugaz de ZK/inbox.org (ya procesada)
export const zkDropFugaz = (entry) => async (dispatch, getState) => {
  const path = zkInboxPath(zkDirFor(getState()));
  const info = await readText(getState(), path);
  const next = removeFugaz(info.text, entry);
  if (next == null) return false;
  return writeText(dispatch, getState, path, info, next);
};

// Fugaz → tarea en el Inbox de GTD (como «Al Inbox» del Diario) y se quita de las fugaces
export const zkFugazToGtd = (entry) => async (dispatch, getState) => {
  const title = oneLine(entry.title) || 'Fugaz';
  const notes = [entry.body, entry.origin ? `Origen: ${entry.origin}` : '']
    .filter((s) => s && s.trim())
    .join('\n');
  const zkInbox = zkInboxPath(zkDirFor(getState())).toLowerCase();
  const loaded = getState()
    .org.present.get('files')
    .keySeq()
    .toArray()
    .filter((p) => p.toLowerCase() !== zkInbox);
  const inbox = inboxNear((getGtdFiles() || {}).inbox, loaded);
  if (getState().org.present.getIn(['files', inbox, 'headers'])) {
    const id = dispatch(
      gtdAddTask({ path: inbox }, { title, list: 'inbox', notes, created: true })
    );
    if (!id) {
      showMessage('Procesar fugaces', 'No se ha podido añadir al Inbox de GTD.');
      return false;
    }
  } else {
    try {
      const info = await readText(getState(), inbox);
      const add = `* ${title}\n:PROPERTIES:\n:CREATED: ${createdStamp()}\n:END:\n${
        notes ? `${notes}\n` : ''
      }`;
      const body = (info.text && !info.text.endsWith('\n') ? `${info.text}\n` : info.text) + add;
      await writeText(dispatch, getState, inbox, info, body);
    } catch (e) {
      showMessage('Procesar fugaces', `No se ha podido añadir al Inbox: ${(e && e.message) || e}`);
      return false;
    }
  }
  return dispatch(zkDropFugaz(entry));
};

const KIND_SHORT = {
  permanente: 'permanente',
  literatura: 'ficha de fuente',
  indice: 'índice',
  otra: 'nota',
};

// Fugaz → punto de una ficha de fuente (existente o nueva)
export const zkFugazToLiterature = (entry, corpus) => async (dispatch) => {
  const cards = (corpus.notes || []).filter((n) => n.kind === 'literatura');
  const pick = await askPick({
    title: '¿De qué fuente?',
    placeholder: 'Buscar ficha…',
    items: [
      { id: '__new', label: '➕ Ficha de fuente nueva…' },
      ...cards.map((c) => ({ id: c.path, label: c.title, hint: c.keywords.AUTOR || '' })),
    ],
  });
  if (!pick) return false;
  let path = pick;
  if (pick === '__new') {
    const made = await dispatch(zkNewNote('literatura'));
    if (!made) return false;
    path = made.path;
  }
  const ok = await dispatch(zkAddPoint(path, { text: fugazText(entry) }));
  if (!ok) return false;
  return dispatch(zkDropFugaz(entry));
};

// Fugaz → párrafo al final de otra nota (en una permanente, al final de «Idea»)
export const zkAppendToNote = (entry, corpus) => async (dispatch, getState) => {
  const items = (corpus.notes || [])
    .filter((n) => n.kind !== 'fugaz')
    .map((n) => ({ id: n.path, label: n.title, hint: KIND_SHORT[n.kind] || '' }));
  const path = await askPick({
    title: 'Añadir a una nota',
    placeholder: 'Buscar nota…',
    emptyText: 'No hay notas en la carpeta ZK.',
    items,
  });
  if (!path) return false;
  const info = await readText(getState(), path);
  if (!info.exists) return false;
  const para = [fugazText(entry), entry.origin ? `Origen: ${entry.origin}` : '']
    .filter(Boolean)
    .join('\n');
  const ok = await writeText(dispatch, getState, path, info, appendParagraph(info.text, para));
  if (!ok) return false;
  return dispatch(zkDropFugaz(entry));
};

// «→ Permanente» de una fila de la ficha → datos para el asistente
export const zkCardPoint = (path, cells) => async (dispatch, getState) => {
  const info = await readText(getState(), path);
  if (!info.exists) return null;
  const node = zkNoteInfo(path, info.text);
  const row = { text: (cells && cells[2]) || '' };
  return {
    card: { path, id: node.id, title: node.title },
    cells,
    where: oneLine(String((cells && cells[0]) || '').replace(/\\vert\{\}/g, '|')),
    idea: pointFullText(info.text, row),
  };
};

/**
 * Crea la permanente del asistente y lo que la acompaña:
 * d: { title, idea, links: [{ id, title }], index: { path } | { create: título } | null,
 *      card: { path, id, title } | null, cells, where, origin, fugaz }
 * → { path, orgId } o null
 */
export const zkCreatePermanent = (d) => async (dispatch, getState) => {
  const dir = zkDirFor(getState());
  const orgId = newOrgId();
  const path = zkNotePath(dir, 'permanente', d.title);
  const text = permanentNoteText({
    id: orgId,
    title: d.title,
    idea: d.idea,
    links: d.links || [],
    source: sourceLine({ card: d.card, where: d.where, origin: d.origin }),
  });
  const ok = await dispatch(createNewFile(path, text));
  if (!ok) return null;
  const link = idLink(orgId, d.title);
  // índice: el índice enlaza a la nota (lista de «* Notas»)
  let idx = d.index || null;
  if (idx && idx.create) {
    const iid = newOrgId();
    const ipath = zkNotePath(dir, 'indice', idx.create);
    const made = await dispatch(createNewFile(ipath, indexText({ title: idx.create, id: iid })));
    idx = made ? { path: ipath } : null;
  }
  if (idx && idx.path) {
    const info = await readText(getState(), idx.path);
    if (info.exists)
      await writeText(
        dispatch,
        getState,
        idx.path,
        info,
        appendToSection(info.text, 'Notas', `- ${link}`)
      );
  }
  // ficha de fuente: «Nota ZK» de la fila y «Notas permanentes creadas»
  if (d.card && d.card.path) {
    const info = await readText(getState(), d.card.path);
    if (info.exists) {
      let t = info.text;
      if (d.cells) t = setPointNote(t, d.cells, link) || t;
      t = appendToSection(t, CREATED_HEADING, `- ${link}`);
      await writeText(dispatch, getState, d.card.path, info, t);
    }
  }
  if (d.fugaz) await dispatch(zkDropFugaz(d.fugaz));
  return { path, orgId };
};

// Carga una ficha (para imprimirla con la impresión de siempre)
export const zkEnsureLoaded = (path) => async (dispatch, getState) => {
  if (getState().org.present.getIn(['files', path, 'headers'])) return true;
  await dispatch(loadFileQuietly(path));
  return !!getState().org.present.getIn(['files', path, 'headers']);
};
