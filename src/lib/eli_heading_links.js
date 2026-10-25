// ORG Mode para Eli (4.29): enlazar mientras se escribe.
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
  contextLabel,
  allTags,
  pagesFilePath,
  newPageFileText,
  fileNameOf,
  appendTagToTitle,
} from './eli_heading_index';
import { idHeadingLink, withOrgIdProperty } from './eli_id_links';
import { newOrgId } from './gtd/gtd_model';
import { getGtdFiles } from './gtd/gtd_sections';
import { gtdAddTask } from './gtd/gtd_actions';
import generateId from './id_generator';
import { askPick, showMessage } from './eli_prompt';
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

// Buscador de cabeceras → { orgId, title } o null (Cancelar)
export const pickHeadingTarget = ({ title = 'Enlazar a una cabecera' } = {}) => async (
  dispatch,
  getState
) => {
  const state = getState();
  const index = headingIndex(state.org.present.get('files'));
  const entries = searchHeadings(index, '', 100000);
  const pagesName = fileNameOf(pagesPathFor(state));
  const chosen = await askPick({
    title,
    placeholder: 'Buscar cabecera…',
    emptyText: 'No hay cabeceras en los ficheros abiertos.',
    limit: 80,
    items: entries.map((e, i) => ({ id: String(i), label: e.title, hint: contextLabel(e) })),
    newItem: (raw) => ({ label: `➕ Crear «${raw}»`, hint: `cabecera nueva en ${pagesName}` }),
  });
  if (chosen === null || chosen === undefined) return null;
  if (typeof chosen === 'object' && chosen.new) {
    const made = await dispatch(createPageHeading(chosen.new));
    return made ? { orgId: made.orgId, title: chosen.new.trim() } : null;
  }
  const entry = entries[Number(chosen)];
  if (!entry) return null;
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
