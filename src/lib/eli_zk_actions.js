// ORG Mode para Eli (4.46): acciones del Zettelkasten (usan el store; el modelo puro está en
// eli_zk.js). Se lanzan con el evento `eli:zk` ({ action: 'note' | 'fugaz' | 'point' | 'aliases',
// … }) que escucha components/EliZk, para poder llamarlas desde menús, atajos y botones.
import { List, fromJS } from 'immutable';
import generateId from './id_generator';
import { exportOrg } from './export_org';
import { askChoice, askForm, askText, showMessage } from './eli_prompt';
import { diaryDir } from './eli_diary';
import { pagesPathFor } from './eli_heading_links';
import { newOrgId } from './gtd/gtd_model';
import { createdStamp } from './gtd/gtd_actions';
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
} from './eli_zk';
import { createNewFile, parseFile, setDirty, sync, updatePropertyListItems } from '../actions/org';

export const zkCommand = (detail) => window.dispatchEvent(new CustomEvent('eli:zk', { detail }));

// Carpeta ZK resuelta: la del ajuste (relativa a la del fichero de entrada o absoluta)
export const zkDirFor = (state) =>
  diaryDir(
    normalizeZkFolder(state.base.get('eliZkFolder')),
    pagesPathFor({ ...state, base: state.base.set('eliPagesFile', '') })
  );

// Texto actual de un fichero: cargado (se serializa) o leído del servicio → { text, loaded, exists }
const readText = async (state, path) => {
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
  const exists = client.pathExists ? !!(await client.pathExists(path)) : false;
  const text = exists ? (await client.getFileContents(path)) || '' : '';
  return { loaded: false, exists, text };
};

// Escribe el texto entero de un fichero (cargado: se vuelve a analizar y se sincroniza)
const writeText = async (dispatch, getState, path, info, text) => {
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

// --- «+ Punto» en la ficha de fuente abierta ---
export const zkAddPoint = (path) => async (dispatch, getState) => {
  const state = getState();
  if (!path || !state.org.present.getIn(['files', path, 'headers'])) return false;
  const f = await askForm({
    title: '+ Punto',
    okLabel: 'Añadir',
    fields: [
      { id: 'where', label: 'Dónde (página, posición Kindle o minuto)', required: false },
      { id: 'section', label: 'Sección' },
      { id: 'text', label: 'Punto o cita', type: 'textarea', required: true },
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
  const info = await readText(state, path);
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
