// ORG Mode para Eli (4.36): estado y funciones del bloque «Backlinks» (al pie de una cabecera en
// narrow y en la página «Quién enlaza aquí»):
//   - orden elegido («Por fichero» / «Por fecha» ↑↓): preferencia, viaja entre dispositivos
//     (localStorage eliBacklinksOrder);
//   - «Ocultar archivadas» / «Ocultar tareas»: compartidos con la vista por etiqueta (estado
//     pasajero, en memoria, apagados al abrir la app);
//   - captura de lo que se ve (para imprimir / PDF «tal cual está en pantalla»).
import { useEffect, useState } from 'react';
import { filterBacklinks, sortByDate, linkingParagraph, childrenOf } from './eli_heading_index';

// --- Orden (preferencia) ---
const ORDER_KEY = 'eliBacklinksOrder';
const orderListeners = new Set();

export const normalizeOrder = (v) => {
  const order = v && v.order === 'date' ? 'date' : 'file';
  const dir = v && v.dir === 'asc' ? 'asc' : 'desc';
  return { order, dir };
};
const readOrder = () => {
  try {
    return normalizeOrder(JSON.parse(window.localStorage.getItem(ORDER_KEY) || 'null'));
  } catch (e) {
    return normalizeOrder(null);
  }
};
let orderPref = readOrder();
try {
  window.addEventListener('eli:prefs-applied', () => {
    orderPref = readOrder();
    orderListeners.forEach((l) => l(orderPref));
  });
} catch (e) {}

export const getBacklinksOrder = () => orderPref;
export const setBacklinksOrder = (v) => {
  orderPref = normalizeOrder(v);
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(orderPref));
  } catch (e) {}
  orderListeners.forEach((l) => l(orderPref));
};
export const useBacklinksOrder = () => {
  const [v, setV] = useState(orderPref);
  useEffect(() => {
    orderListeners.add(setV);
    return () => orderListeners.delete(setV);
  }, []);
  return v;
};

// --- Filtros compartidos con la vista por etiqueta (en memoria) ---
let hv = { hideArchived: false, hideTasks: false };
const hvListeners = new Set();
export const getHvFilters = () => hv;
export const setHvFilters = (patch) => {
  hv = { ...hv, ...patch };
  hvListeners.forEach((l) => l(hv));
};
export const useHvFilters = () => {
  const [v, setV] = useState(hv);
  useEffect(() => {
    hvListeners.add(setV);
    return () => hvListeners.delete(setV);
  }, []);
  return v;
};

// --- Lo que se ve, para imprimir ---
const snapshots = new Map();
export const backlinksKey = (path, headerId) => `${path}\u0000${headerId}`;
export const publishBacklinksSnapshot = (key, snap) => {
  if (snap) snapshots.set(key, snap);
  else snapshots.delete(key);
};
export const getBacklinksSnapshot = (key) => snapshots.get(key) || null;

// --- Aplicar la vista (filtros + orden) a los backlinks ---
export const entryKey = (e) => `${e.path}\u0000${e.pos}`;

/**
 * view: { hideArchived, hideTasks, inherited, tags, order: 'file'|'date', dir: 'asc'|'desc' }
 * → { mode: 'file', entries } | { mode: 'date', dated, undated }
 */
export const applyBacklinksView = (refs, view) => {
  const filtered = filterBacklinks(refs, {
    hideArchived: view.hideArchived,
    hideTasks: view.hideTasks,
    inherited: view.inherited !== false,
    tags: view.tags || [],
  });
  if (view.order === 'date') {
    const { dated, undated } = sortByDate(filtered, view.dir);
    return { mode: 'date', dated, undated, count: filtered.length };
  }
  return { mode: 'file', entries: filtered, count: filtered.length };
};

/**
 * Lo que se ve, serializado (para PDF / imprimir): bloque plegado o no, orden, filtros activos y,
 * de cada resultado, sus párrafos que enlazan y —si «Ver el resto» está abierto— sus notas y
 * subcabeceras. Todo con las mismas funciones puras que usa la pantalla.
 */
export const serializeBacklinks = ({
  refs,
  index,
  orgId,
  view,
  openKeys = [],
  collapsed = false,
}) => {
  const applied = applyBacklinksView(refs, view);
  const open = new Set(openKeys);
  const flat =
    applied.mode === 'date' ? [...applied.dated, ...applied.undated] : applied.entries.slice();
  const items = flat.map((e) => ({
    entry: e,
    paragraphs: linkingParagraph(e, orgId),
    open: open.has(entryKey(e)),
    subs: open.has(entryKey(e)) ? childrenOf(index, e) : [],
  }));
  const filters = [];
  if (view.hideArchived) filters.push('sin archivadas');
  if (view.hideTasks) filters.push('sin tareas');
  if (view.inherited === false) filters.push('sin etiquetas heredadas');
  (view.tags || []).forEach((t) => filters.push(`etiqueta ${t}`));
  return {
    collapsed: !!collapsed,
    order: view.order,
    dir: view.dir,
    mode: applied.mode,
    count: items.length,
    total: refs.length,
    filters,
    items,
    undatedFrom: applied.mode === 'date' ? applied.dated.length : items.length,
  };
};
