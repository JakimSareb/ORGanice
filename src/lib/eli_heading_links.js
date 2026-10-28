// ORG Mode para Eli (4.31): enlazar mientras se escribe.
//   - «[[» (título o notas, en Documentos y en el editor de tarea de GTD) y «Añadir › Enlace a
//     cabecera…»: buscador de todas las cabeceras de los ficheros cargados; al elegir se inserta
//     [[id:X][Título]] (si el destino no tiene :ID: se le pone). Última opción: «➕ Crear "texto"»,
//     cabecera nueva de nivel 1 al final del fichero de páginas (Ajustes › Documentos).
//   - «#» al escribir el TÍTULO en Documentos: buscador de etiquetas; la elegida se quita del
//     texto y se añade al final como «:etiqueta:» (al guardar pasa a las etiquetas).
import { List } from 'immutable';
import {
  headingIndex,
  searchHeadings,
  allTags,
  pagesFilePath,
  newPageFileText,
  fileNameOf,
  appendTagToTitle,
  orderHierarchical,
} from './eli_heading_index';
import { idHeadingLink, withOrgIdProperty } from './eli_id_links';
import { buildTransclusionLine, lineInsertion } from './eli_transclude';
import { newOrgId } from './gtd/gtd_model';
import { getGtdFiles } from './gtd/gtd_sections';
import { gtdAddTask } from './gtd/gtd_actions';
import { createContact } from './gtd/gtd_persons_actions';
import generateId from './id_generator';
import { askPick, showMessage } from './eli_prompt';
import { fileNodes, freeNotePath, newNoteFileText } from './eli_roam';
import { diaryDir } from './eli_diary';
import { defaultTags } from './eli_todo_defaults';
import {
  sync,
  setDirty,
  updatePropertyListItems,
  loadFileQuietly,
  createNewFile,
} from '../actions/org';

const inFile = (path, inner) => ({ type: 'ELI_IN_FILE', path, inner, dirtying: true });

const syncFile = (dispatch, path) => {
  dispatch(setDirty(true, path));
  dispatch(sync({ path, shouldSuppressMessages: true }));
};

// :ID: de una cabecera de cualquier fichero cargado (se le pone si no lo tiene)
export const ensureHeadingOrgId = (path, headerId) => (dispatch, getState) => {
  const headers = getState().org.present.getIn(['files', path, 'headers']) || List();
  const header = headers.find((h) => h.get('id') === headerId);
  if (!header) return null;
  const item = (header.get('propertyListItems') || List()).find(
    (p) => (p.get('property') || '').toUpperCase() === 'ID'
  );
  const text = item
    ? (item.get('value') || List())
        .map((x) => x.get('contents') || '')
        .join('')
        .trim()
    : '';
  if (text) return text;
  const orgId = newOrgId();
  dispatch(
    inFile(
      path,
      updatePropertyListItems(
        headerId,
        withOrgIdProperty(header.get('propertyListItems'), orgId, generateId())
      )
    )
  );
  syncFile(dispatch, path);
  return orgId;
};

// Ruta del fichero de páginas (Ajustes › Documentos; si no, paginas.org junto al de entrada)
export const pagesPathFor = (state) => {
  const chosen = state.base.get('eliPagesFile') || '';
  const files = state.org.present.get('files');
  const loaded = files ? files.keySeq().filter((p) => p && p.startsWith('/')) : null;
  const inbox =
    getGtdFiles().inbox ||
    (loaded && loaded.find((p) => /(^|\/)inbox\.org$/i.test(p))) ||
    (loaded && loaded.first()) ||
    '/inbox.org';
  return pagesFilePath(chosen, inbox);
};

// Cabecera nueva (nivel 1, con :ID:) al final del fichero de páginas → { orgId, path } o null
export const createPageHeading = (title) => async (dispatch, getState) => {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const path = pagesPathFor(getState());
  const orgId = newOrgId();
  const loaded = () => !!getState().org.present.getIn(['files', path, 'headers']);
  if (!loaded()) await dispatch(loadFileQuietly(path));
  if (loaded()) {
    const id = dispatch(
      gtdAddTask({ path }, { title: clean, keyword: null, props: { ID: orgId } })
    );
    return id ? { orgId, path } : null;
  }
  const ok = await dispatch(createNewFile(path, newPageFileText(clean, orgId)));
  return ok ? { orgId, path } : null;
};

// (4.41) Carpeta de las notas nuevas (como org-roam, un fichero por nota): `pages/` junto al
// fichero de entrada
export const notesDirFor = (state) =>
  diaryDir('pages/', pagesPathFor({ ...state, base: state.base.set('eliPagesFile', '') }));

// (4.41) Nota nueva: fichero `pages/<slug>.org` con :ID: y #+title: → { orgId, path } o null
export const createNoteFile = (title, orgId = null) => async (dispatch, getState) => {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const state = getState();
  const known = new Set(
    [
      ...state.org.present.get('files').keySeq().toArray(),
      ...state.org.present
        .get('fileSettings')
        .map((x) => x.get('path'))
        .toArray(),
    ].map((p) => String(p || '').toLowerCase())
  );
  const client = state.syncBackend && state.syncBackend.get('client');
  let path = freeNotePath(notesDirFor(state), clean, (p) => known.has(p.toLowerCase()));
  // (si el servicio lo dice) que no exista ya en la carpeta aunque no esté cargado
  for (let i = 0; i < 20 && client && client.pathExists; i++) {
    let taken = false;
    try {
      taken = await client.pathExists(path);
    } catch (e) {
      taken = false;
    }
    if (!taken) break;
    known.add(path.toLowerCase());
    path = freeNotePath(notesDirFor(state), clean, (p) => known.has(p.toLowerCase()));
  }
  const id = orgId || newOrgId();
  const ok = await dispatch(createNewFile(path, newNoteFileText(clean, id)));
  return ok ? { orgId: id, path } : null;
};

// Buscador de cabeceras → { orgId, title } o null (Cancelar)
// (4.41) Un solo selector «buscar o crear nota»: también las notas-fichero (org-roam), se busca
// por alias, no salen las de :ROAM_EXCLUDE: y al final se ofrece crear una nota nueva (fichero
// en pages/) o, como antes, una cabecera en el fichero de páginas.
export const pickHeadingTarget = ({ title = 'Enlazar a una cabecera' } = {}) => async (
  dispatch,
  getState
) => {
  const state = getState();
  const files = state.org.present.get('files');
  const index = headingIndex(files);
  // (4.35) jerárquico: por fichero, nivel 1 primero y bajo cada una sus hijas (orden del documento)
  const ordered = orderHierarchical(searchHeadings(index, '', 100000), index).filter(
    (o) => !o.entry.exclude
  );
  const nodes = fileNodes(files).filter((n) => !n.exclude);
  const nodeOf = new Map(nodes.map((n) => [n.path, n]));
  const entries = [];
  const done = new Set();
  ordered.forEach((o) => {
    const n = nodeOf.get(o.entry.path);
    if (n && !done.has(n.path)) {
      done.add(n.path);
      entries.push({ entry: n, depth: 0 });
    }
    entries.push(o);
  });
  nodes.forEach((n) => !done.has(n.path) && entries.push({ entry: n, depth: 0 }));
  const pagesName = fileNameOf(pagesPathFor(state));
  const chosen = await askPick({
    title,
    placeholder: 'Buscar o crear nota…',
    emptyText: 'No hay cabeceras en los ficheros abiertos.',
    limit: 80,
    items: entries.map((o, i) => ({
      id: String(i),
      label: o.entry.title,
      // las de nivel 1 llevan el nombre del fichero; las demás, solo su sangría
      hint: o.entry.isFile
        ? `nota · ${fileNameOf(o.entry.path)}`
        : o.depth === 0
        ? fileNameOf(o.entry.path)
        : '',
      keywords: (o.entry.aliases || []).join(' '),
      depth: o.depth,
    })),
    newItem: (raw) => [
      // (4.50) YA NO se ofrece crear un fichero al enlazar (para eso, «Nueva nota ZK»): solo una
      // cabecera nueva en el fichero de páginas o un contacto
      {
        label: `➕ Nueva cabecera «${raw}»`,
        hint: `cabecera nueva en ${pagesName}`,
        kind: 'heading',
      },
      // (4.48) también un contacto nuevo (personas.org)
      { label: `👤 Crear contacto «${raw}»`, hint: 'en personas.org', kind: 'contact' },
    ],
    // (4.48) las opciones de crear salen siempre, aunque haya coincidencias
    newAlways: true,
  });
  if (chosen === null || chosen === undefined) return null;
  if (typeof chosen === 'object' && chosen.new) {
    if (chosen.kind === 'contact') {
      const p = await dispatch(createContact(chosen.new));
      return p ? { orgId: p.id, title: p.title } : null;
    }
    const made = await dispatch(createPageHeading(chosen.new));
    return made ? { orgId: made.orgId, title: chosen.new.trim() } : null;
  }
  const entry = entries[Number(chosen)] && entries[Number(chosen)].entry;
  if (!entry) return null;
  if (entry.isFile) return { orgId: entry.orgId, title: entry.title };
  const orgId = entry.orgId || dispatch(ensureHeadingOrgId(entry.path, entry.headerId));
  return orgId ? { orgId, title: entry.rawTitle } : null;
};

const refocus = (el, at) => {
  try {
    el.focus();
    if (at != null) el.setSelectionRange(at, at);
  } catch (e) {}
};

/**
 * Elegir cabecera e insertar [[id:X][Título]] en `el` (textarea/input). `replace` = { start, end }
 * del texto que se sustituye (p. ej. el «[[» escrito); si no, en el cursor.
 * `insert(el, text, start, end)` inserta respetando React (insertIntoField).
 */
export const insertHeadingLink = (el, insert, replace = null) => async (dispatch) => {
  if (!el) return false;
  const start = replace ? replace.start : el.selectionStart;
  const end = replace ? replace.end : el.selectionEnd;
  const target = await dispatch(pickHeadingTarget());
  if (!target) {
    refocus(el, replace ? replace.end : end);
    return false;
  }
  if (!el.isConnected) {
    showMessage('Enlace', 'El campo que se editaba ya no está abierto.');
    return false;
  }
  insert(el, idHeadingLink(target.orgId, target.title), start, end);
  return true;
};

/**
 * (4.42) «Citar»: elegir el origen con el mismo selector de «[[» e insertar, en su propia línea de
 * `el` (las notas), `#+transclude: [[id:X][Título]]`. El fichero solo guarda esa línea.
 */
export const insertTransclusion = (el, insert) => async (dispatch) => {
  if (!el) return false;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const target = await dispatch(pickHeadingTarget({ title: 'Citar' }));
  if (!target) {
    refocus(el, end);
    return false;
  }
  if (!el.isConnected) {
    showMessage('Citar', 'El campo que se editaba ya no está abierto.');
    return false;
  }
  const { text } = lineInsertion(
    el.value,
    start,
    end,
    buildTransclusionLine(target.orgId, target.title)
  );
  insert(el, text, start, end);
  return true;
};

// Etiquetas que se ofrecen: las de los ficheros cargados y las de Ajustes
export const knownTags = (state) => {
  const index = headingIndex(state.org.present.get('files'));
  const out = new Map();
  defaultTags().forEach((t) => t && out.set(t.toLowerCase(), t));
  allTags(index).forEach(
    ({ tag }) => !out.has(tag.toLowerCase()) && out.set(tag.toLowerCase(), tag)
  );
  return Array.from(out.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};

// «#» recién escrito en `pos - 1` del título: elegir etiqueta, quitar el «#» y añadir «:tag:»
export const pickTagForTitle = (el, insert, pos) => async (dispatch, getState) => {
  const tags = knownTags(getState());
  const chosen = await askPick({
    title: 'Añadir etiqueta',
    placeholder: 'Buscar o escribir etiqueta…',
    emptyText: 'Aún no hay etiquetas: escribe una nueva.',
    items: tags.map((t) => ({ id: t, label: t })),
    newItem: (raw) => ({ label: `➕ Nueva: ${raw.replace(/^#+/, '')}` }),
  });
  if (chosen === null || chosen === undefined || !el.isConnected) {
    refocus(el, pos);
    return false;
  }
  const tag = typeof chosen === 'object' ? chosen.new : chosen;
  const value = el.value || '';
  const at = pos - 1;
  const without = value[at] === '#' ? value.slice(0, at) + value.slice(at + 1) : value;
  const next = appendTagToTitle(without, tag);
  insert(el, next, 0, value.length);
  const caret = Math.min(at, next.length);
  refocus(el, caret);
  return true;
};

// (4.35) «Enviar a…»: elegir un fichero (nivel superior) o una cabecera de los ficheros cargados,
// en orden jerárquico → { path, headerId (null = nivel superior), title } o null (Cancelar)
// (4.50) onlyPath: solo ese fichero (p. ej. reuniones.org al llevar un punto de una agenda)
export const pickRefileTarget = ({ title = 'Enviar a', onlyPath = null } = {}) => async (
  dispatch,
  getState
) => {
  const index = headingIndex(getState().org.present.get('files'), { skipDiary: true });
  const ordered = orderHierarchical(searchHeadings(index, '', 100000), index).filter(
    (o) => !onlyPath || o.entry.path === onlyPath
  );
  const rows = [];
  const items = [];
  let lastPath = null;
  ordered.forEach((o) => {
    if (o.entry.path !== lastPath) {
      lastPath = o.entry.path;
      rows.push({ path: lastPath, headerId: null, title: fileNameOf(lastPath) });
      items.push({
        id: String(rows.length - 1),
        label: fileNameOf(lastPath),
        hint: 'fichero · nivel superior',
        depth: 0,
      });
    }
    rows.push({ path: o.entry.path, headerId: o.entry.headerId, title: o.entry.title });
    items.push({ id: String(rows.length - 1), label: o.entry.title, hint: '', depth: o.depth + 1 });
  });
  if (onlyPath && !rows.length) {
    rows.push({ path: onlyPath, headerId: null, title: fileNameOf(onlyPath) });
    items.push({
      id: '0',
      label: fileNameOf(onlyPath),
      hint: 'fichero · nivel superior',
      depth: 0,
    });
  }
  const chosen = await askPick({
    title,
    placeholder: 'Buscar fichero o cabecera…',
    emptyText: 'No hay ficheros cargados.',
    limit: 200,
    items,
  });
  if (chosen === null || chosen === undefined) return null;
  return rows[Number(chosen)] || null;
};
