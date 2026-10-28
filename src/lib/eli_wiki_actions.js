// ORG Mode para Eli (4.51): acciones de la Wiki Divio (usan el store; el modelo puro está en
// eli_wiki.js). Se lanzan con el evento `eli:wiki` ({ action: 'structure' | 'new' | 'processes' })
// que escucha components/EliWiki, para poder llamarlas desde menús y botones.
import { askChoice, askConfirm, askForm, askPick, showMessage } from './eli_prompt';
import { diaryDir } from './eli_diary';
import { pagesPathFor, knownTags } from './eli_heading_links';
import { newOrgId } from './gtd/gtd_model';
import { pickPerson } from './gtd/gtd_persons_actions';
import { readText, writeText } from './eli_zk_actions';
import { eliFollowOrgLink, createNewFile, loadFileQuietly } from '../actions/org';
import {
  WIKI_KINDS,
  KIND_LABEL,
  KIND_GUIDE,
  FRECUENCIAS,
  normalizeWikiFolder,
  wikiPaths,
  wikiPath,
  wikiIndexPath,
  kindFileText,
  indexFileText,
  entryText,
  findEntryByTitle,
  appendEntry,
  addIndexLine,
  parseProcesses,
  setEntryProperty,
  cleanTag,
  isoDate,
} from './eli_wiki';

export const wikiCommand = (detail) =>
  window.dispatchEvent(new CustomEvent('eli:wiki', { detail }));

// Carpeta de la wiki resuelta: la del ajuste (relativa a la del fichero de entrada o absoluta)
export const wikiDirFor = (state) =>
  diaryDir(
    normalizeWikiFolder(state.base.get('eliWikiDir')),
    pagesPathFor({ ...state, base: state.base.set('eliPagesFile', '') })
  );

const baseTextFor = (kind) =>
  kind === 'index' ? indexFileText({ id: newOrgId() }) : kindFileText(kind);

// Qué ficheros de la wiki faltan → [{ kind, path }]
export const wikiMissing = async (state) => {
  const dir = wikiDirFor(state);
  const out = [];
  for (const f of wikiPaths(dir)) {
    const info = await readText(state, f.path);
    if (!info.exists) out.push(f);
  }
  return out;
};

// «Crear estructura de wiki»: solo crea lo que falta (nunca toca lo que ya existe)
export const wikiCreateStructure = ({ silent = false } = {}) => async (dispatch, getState) => {
  const missing = await wikiMissing(getState());
  if (!missing.length) {
    if (!silent)
      showMessage('Wiki', 'La estructura de la wiki ya está completa: no se ha tocado nada.');
    return true;
  }
  for (const f of missing) {
    const ok = await dispatch(createNewFile(f.path, baseTextFor(f.kind)));
    if (!ok) return false;
  }
  if (!silent) {
    const total = wikiPaths(wikiDirFor(getState())).length;
    showMessage(
      'Wiki',
      `Se han creado ${missing.length} de ${total} ficheros${
        missing.length < total ? '; los demás ya existían y no se han tocado' : ''
      }.`
    );
  }
  return true;
};

const openEntry = (path, id) => async (dispatch, getState) => {
  if (!getState().org.present.getIn(['files', path, 'headers']))
    await dispatch(loadFileQuietly(path));
  return dispatch(eliFollowOrgLink(`id:${id}`));
};
export const wikiOpenEntry = openEntry;

const TEMA_NONE = '__sin_tema__';

// «Nueva entrada wiki»: tipo → título (+ frecuencia) → tema → (responsable) → la crea y la abre
export const wikiNewEntry = () => async (dispatch, getState) => {
  const missing = await wikiMissing(getState());
  if (missing.length) {
    const ok = await askConfirm({
      title: 'Wiki',
      message: `Falta${missing.length > 1 ? 'n' : ''} ${missing
        .map((m) => m.path.split('/').pop())
        .join(', ')} en la carpeta de la wiki. ¿Crear la estructura ahora?`,
      okLabel: 'Crear estructura',
    });
    if (!ok) return false;
    if (!(await dispatch(wikiCreateStructure({ silent: true })))) return false;
  }
  const kind = await askChoice({
    title: 'Nueva entrada wiki',
    choices: WIKI_KINDS.map((k) => ({ id: k, label: `${KIND_LABEL[k]} — ${KIND_GUIDE[k]}` })),
  });
  if (!kind) return false;
  const fields = [{ id: 'title', label: 'Título', required: true }];
  if (kind === 'proceso')
    fields.push({
      id: 'frecuencia',
      label: 'Frecuencia',
      type: 'select',
      options: FRECUENCIAS.map((f) => ({ id: f, label: f })),
      value: 'a demanda',
    });
  const f = await askForm({ title: `${KIND_LABEL[kind]} nuevo`, okLabel: 'Seguir', fields });
  if (!f || !String(f.title || '').trim()) return false;
  const dir = wikiDirFor(getState());
  const path = wikiPath(dir, kind);
  const idxPath = wikiIndexPath(dir);
  const info = await readText(getState(), path);
  // no duplicar: si ya existe una con ese título, se abre
  const dup = findEntryByTitle(info.text, f.title);
  if (dup && dup.id) {
    showMessage('Wiki', `Ya existe «${dup.title}» en ${path.split('/').pop()}: se abre.`);
    await dispatch(openEntry(path, dup.id));
    return true;
  }
  const chosen = await askPick({
    title: 'Tema',
    message: 'Se guarda como etiqueta de la cabecera.',
    placeholder: 'Buscar o escribir tema…',
    items: [
      { id: TEMA_NONE, label: '(sin tema)' },
      ...knownTags(getState()).map((t) => ({ id: t, label: t })),
    ],
    newItem: (raw) => ({ label: `➕ Nuevo tema: ${cleanTag(raw)}` }),
  });
  if (chosen === null || chosen === undefined) return false;
  let tag = '';
  if (typeof chosen === 'object') tag = cleanTag(chosen.new);
  else if (chosen !== TEMA_NONE) tag = cleanTag(chosen);
  let responsable = null;
  if (kind === 'proceso')
    responsable = await dispatch(pickPerson({ title: 'Responsable (Cancelar = sin responsable)' }));
  const id = newOrgId();
  const entry = entryText(kind, {
    title: f.title,
    id,
    tag,
    frecuencia: f.frecuencia,
    responsable,
    date: isoDate(),
  });
  try {
    await writeText(dispatch, getState, path, info, appendEntry(info.text, entry));
    const idx = await readText(getState(), idxPath);
    await writeText(dispatch, getState, idxPath, idx, addIndexLine(idx.text, kind, id, f.title));
  } catch (e) {
    showMessage('No se pudo guardar la entrada', String((e && e.message) || e));
    return false;
  }
  await dispatch(openEntry(path, id));
  return true;
};

// Tabla de Procesos → { path, list, exists }
export const wikiProcessList = async (state) => {
  const path = wikiPath(wikiDirFor(state), 'proceso');
  const info = await readText(state, path);
  return { path, exists: info.exists, list: info.exists ? parseProcesses(info.text) : [] };
};

// «Revisado hoy»: pone :ULTIMA_REVISION: de hoy en el proceso con ese id
export const wikiMarkReviewed = (id) => async (dispatch, getState) => {
  const path = wikiPath(wikiDirFor(getState()), 'proceso');
  const info = await readText(getState(), path);
  const next = setEntryProperty(info.text, id, 'ULTIMA_REVISION', isoDate());
  if (next === null) return false;
  await writeText(dispatch, getState, path, info, next);
  return true;
};

// (4.52) Atajos de la wiki para el selector de destino de Procesar Inbox → «Wiki › Referencia» y
// «Wiki › Explicación» (nivel superior de esos ficheros; el selector los quita si no existen)
export const wikiShortcuts = (state) => {
  try {
    return wikiPaths(wikiDirFor(state))
      .filter((w) => w.kind === 'referencia' || w.kind === 'explicacion')
      .map((w) => ({
        label: `Wiki › ${KIND_LABEL[w.kind]}`,
        hint: 'fichero de la wiki · al final',
        path: w.path,
        headerId: null,
        title: `Wiki › ${KIND_LABEL[w.kind]}`,
      }));
  } catch (e) {
    return [];
  }
};
