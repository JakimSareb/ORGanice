// ORG Mode para Eli (4.54): copiar, cortar y pegar cabeceras (y secciones) en Documentos.
// Funciones puras (se prueban en jest) + el manejador de los eventos copy/cut/paste del navegador.
//  · Copiar: cabecera con TODAS sus subcabeceras como texto Org (también en `text/plain`, para
//    pegar fuera de la app). Los `:ID:` se SUSTITUYEN por otros nuevos (no se duplican: rompería los
//    enlaces por ID). Cortar conserva los `:ID:` (la cabecera no está en dos sitios a la vez).
//  · Sección = elemento de lista seleccionado: copia ese elemento con sus subelementos.
//  · Pegar: si el portapapeles empieza por «*», se pega como SUBCABECERA de la seleccionada con los
//    niveles adaptados (la primera pasa a nivel+1; el resto conserva su diferencia relativa). Si es
//    una lista, se añade a las notas de la cabecera. Si no es Org, pega como texto normal.
import { List } from 'immutable';

import { subheadersOfHeaderWithId, pathAndPartOfListItemWithIdInHeaders } from './org_utils';
import { createRawDescriptionText, attributedStringToRawText } from './export_org';
import { newHeaderWithTitle, _updateHeaderFromDescription } from './parse_org';
import { newOrgId } from './gtd/gtd_model';

const ID_LINE = /^(\s*:ID:\s+)(\S+)(\s*)$/i;

// Cambia el valor de cada propiedad `:ID:` por otro nuevo (el resto del texto, byte a byte igual)
export const withFreshIds = (text, makeId = newOrgId) =>
  String(text || '')
    .split('\n')
    .map((line) => {
      const m = ID_LINE.exec(line);
      return m ? `${m[1]}${makeId()}${m[3]}` : line;
    })
    .join('\n');

// Texto Org de una cabecera con todas sus subcabeceras (cada una acaba en salto de línea)
export const headerSubtreeText = (headers, headerId, { dontIndent = false } = {}) => {
  const header = headers.find((h) => h.get('id') === headerId);
  if (!header) return '';
  return [header, ...subheadersOfHeaderWithId(headers, headerId).toArray()]
    .map((h) => createRawDescriptionText(h, true, dontIndent))
    .join('');
};

// Texto de un elemento de lista (con sus subelementos) a partir de la lista que lo contiene
export const listItemText = (listPart, item) => {
  const single = listPart.set('items', List([item]));
  return attributedStringToRawText(List([single])).replace(/\s+$/, '') + '\n';
};

export const startsWithHeading = (text) => /^\*+ /.test(String(text || '').replace(/^\s*\n/, ''));
export const looksLikeList = (text) => /^\s*([-+]|\d+[.)])\s/.test(String(text || ''));

// ¿Es texto que la app debe tratar como Org al pegar?
export const isOrgClipboard = (text) => startsWithHeading(text) || looksLikeList(text);

// Cabeceras del texto (niveles tal como vienen). Las palabras TODO/DONE… son las del fichero.
export const parseHeadersText = (text, todoKeywordSets) => {
  let headers = List();
  String(text || '')
    .replace(/\r/g, '')
    .replace(/^\s*\n/, '')
    .replace(/\n$/, '')
    .split('\n')
    .forEach((line) => {
      const m = /^(\*+) (.*)$/.exec(line);
      if (m) {
        headers = headers.push(newHeaderWithTitle(m[2], m[1].length, todoKeywordSets));
      } else if (headers.size) {
        headers = headers.updateIn(
          [headers.size - 1, 'rawDescription'],
          (raw) => (raw || '') + line + '\n'
        );
      }
    });
  return headers.map((h) => _updateHeaderFromDescription(h, h.get('rawDescription') || ''));
};

// Niveles adaptados: la primera cabecera pasa a `level` y las demás conservan su diferencia
export const adaptLevels = (headers, level) => {
  if (!headers.size) return headers;
  const shift = level - headers.first().get('nestingLevel');
  return headers.map((h) => h.set('nestingLevel', Math.max(1, h.get('nestingLevel') + shift)));
};

// ---- Manejador de los eventos del navegador --------------------------------------------------
// `api` = { getSelection(): {headerId, listItemId}|null, getHeaders(), isLocked(), canAct(event),
//           removeHeader(id), pasteHeaders(headerId, text), pasteList(headerId, text),
//           notify(message) }
// Devuelve { copy, cut, paste } para registrarlos en `document`.
const userSelectedText = () => {
  try {
    const sel = window.getSelection && window.getSelection();
    return !!sel && !sel.isCollapsed && String(sel).length > 0;
  } catch (e) {
    return false;
  }
};

export const selectionClipboardText = (headers, selection, { fresh }) => {
  if (!selection) return null;
  if (selection.listItemId) {
    const found = pathAndPartOfListItemWithIdInHeaders(headers, selection.listItemId);
    if (!found) return null;
    const listPart = headers.getIn(found.path.slice(0, -2));
    return listPart ? { text: listItemText(listPart, found.listItemPart), kind: 'section' } : null;
  }
  if (!selection.headerId) return null;
  const text = headerSubtreeText(headers, selection.headerId);
  if (!text) return null;
  return { text: fresh ? withFreshIds(text) : text, kind: 'header' };
};

export const createClipboardHandlers = (api) => {
  const blocked = (event) =>
    !api.canAct(event) || userSelectedText() || !(event && event.clipboardData);
  const copyOrCut = (event, isCut) => {
    if (blocked(event)) return;
    const selection = api.getSelection();
    if (!selection) return;
    if (isCut && api.isLocked()) return;
    const found = selectionClipboardText(api.getHeaders(), selection, { fresh: !isCut });
    if (!found) return;
    event.clipboardData.setData('text/plain', found.text);
    event.preventDefault();
    if (isCut) {
      if (found.kind === 'header') api.removeHeader(selection.headerId);
      // Cortar una sección (elemento de lista) no está soportado: solo se copia
      else api.notify('Sección copiada (para quitarla, usa el menú ⋯)');
    }
  };
  return {
    copy: (event) => copyOrCut(event, false),
    cut: (event) => copyOrCut(event, true),
    paste: (event) => {
      if (blocked(event) || api.isLocked()) return;
      const selection = api.getSelection();
      if (!selection) return;
      const text = event.clipboardData.getData('text/plain');
      if (!isOrgClipboard(text)) return; // texto normal: no se toca
      const headerId =
        selection.headerId ||
        (selection.listItemId &&
          api.headerOfListItem &&
          api.headerOfListItem(selection.listItemId));
      if (!headerId) return;
      event.preventDefault();
      if (startsWithHeading(text)) api.pasteHeaders(headerId, text);
      else api.pasteList(headerId, text);
    },
  };
};
