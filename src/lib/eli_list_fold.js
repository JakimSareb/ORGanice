// ORG Mode para Eli (4.40): elementos de lista (`-`, `+`, `- [ ]`, numerados) con teclado y plegado.
//   · Plegar es SOLO visual (no se escribe en el fichero): un conjunto de ids fuera de Redux.
//   · Navegación con ↑/↓ entre los elementos que se ven (los hijos de uno plegado no cuentan);
//     ←/→ pliegan y despliegan (← sin nada que plegar sube al padre); en el borde de la lista
//     el movimiento pasa a la cabecera, como al subir y bajar entre cabeceras.
// Aquí: el estado y el modelo puro (se prueba con jest, eli440).
import { List } from 'immutable';

// ---------- estado del plegado ----------

const folded = new Set();
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const isListFolded = (id) => folded.has(String(id));
export const setListFolded = (id, value) => {
  const had = folded.has(String(id));
  if (value && !had) folded.add(String(id));
  else if (!value && had) folded.delete(String(id));
  else return;
  emit();
};
export const toggleListFold = (id) => setListFolded(id, !isListFolded(id));
export const clearListFold = () => {
  if (!folded.size) return;
  folded.clear();
  emit();
};
export const subscribeListFold = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const foldedIds = () => Array.from(folded);

// ---------- modelo puro ----------

const listPartsOf = (contents) =>
  (contents || List()).filter((p) => p && p.get && p.get('type') === 'list');

// ¿El elemento tiene sub-elementos?
export const itemHasChildren = (item) =>
  !!item && listPartsOf(item.get('contents')).some((lp) => (lp.get('items') || List()).size > 0);

// Elementos de las notas de una cabecera, en el orden en que se ven: [{ id, parentId,
// hasChildren, folded }]. Con `foldedSet`, los hijos de un elemento plegado no salen.
export const visibleListItems = (description, foldedSet = new Set(foldedIds())) => {
  const out = [];
  const walk = (parts, parentId) => {
    listPartsOf(parts).forEach((lp) => {
      (lp.get('items') || List()).forEach((item) => {
        const id = String(item.get('id'));
        const has = itemHasChildren(item);
        const isFolded = has && foldedSet.has(id);
        out.push({ id, parentId, hasChildren: has, folded: isFolded });
        if (has && !isFolded) walk(item.get('contents'), id);
      });
    });
  };
  walk(description, null);
  return out;
};

// Cabecera (y su lista) que contiene el elemento
const headerOfItem = (headers, itemId) => {
  const want = String(itemId);
  const hasItem = (parts) =>
    listPartsOf(parts).some((lp) =>
      (lp.get('items') || List()).some(
        (it) => String(it.get('id')) === want || hasItem(it.get('contents'))
      )
    );
  return (headers || List()).find((h) => hasItem(h.get('description')));
};
export const headerIdOfListItem = (headers, itemId) => {
  const h = headerOfItem(headers, itemId);
  return h ? h.get('id') : null;
};

/**
 * Qué hacer con una tecla (up / down / left / right) con el elemento `itemId` seleccionado:
 *   { type: 'select', id } · { type: 'fold' | 'unfold', id } ·
 *   { type: 'header', headerId, next } (al borde: la cabecera; next = pasar a la siguiente)
 * o null si no hay nada que hacer. `foldedSet` = ids plegados (por defecto, el estado de la app).
 */
export const listKeyAction = (headers, itemId, key, foldedSet = new Set(foldedIds())) => {
  const header = headerOfItem(headers, itemId);
  if (!header) return null;
  const items = visibleListItems(header.get('description'), foldedSet);
  const at = items.findIndex((x) => x.id === String(itemId));
  if (at < 0) return null;
  const cur = items[at];
  switch (key) {
    case 'down':
      return at + 1 < items.length
        ? { type: 'select', id: items[at + 1].id }
        : { type: 'header', headerId: header.get('id'), next: true };
    case 'up':
      return at > 0
        ? { type: 'select', id: items[at - 1].id }
        : { type: 'header', headerId: header.get('id'), next: false };
    case 'right':
      return cur.hasChildren && cur.folded ? { type: 'unfold', id: cur.id } : null;
    case 'left':
      if (cur.hasChildren && !cur.folded) return { type: 'fold', id: cur.id };
      return cur.parentId ? { type: 'select', id: cur.parentId } : null;
    default:
      return null;
  }
};
