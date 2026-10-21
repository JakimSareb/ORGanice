// ORG Mode para Eli (4.12): orden y visibilidad de las entradas principales del Menú ☰
// (Ajustes › Apariencia › Menú ☰). Se guarda en este dispositivo (localStorage `eliMenuLayout`,
// JSON { order: [ids], hidden: [ids] }). «Ajustes» no está aquí: sale siempre, la última.
export const MENU_ENTRIES = [
  { id: 'search', label: 'Buscar' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'clocks', label: 'Tareas con reloj activo' },
  { id: 'files', label: 'Mis ficheros' },
  { id: 'view', label: 'Vista' },
  { id: 'split', label: 'Dos columnas' },
  { id: 'tools', label: 'Herramientas' },
  { id: 'processes', label: 'Procesos' },
  { id: 'help', label: 'Ayuda' },
];
const KEY = 'eliMenuLayout';
const IDS = MENU_ENTRIES.map((e) => e.id);

// Normaliza lo guardado: ids conocidos, sin repetir; los que falten, al final en su orden
export const normalizeLayout = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const order = (Array.isArray(r.order) ? r.order : []).filter(
    (id, i, a) => IDS.includes(id) && a.indexOf(id) === i
  );
  IDS.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter(
    (id, i, a) => IDS.includes(id) && a.indexOf(id) === i
  );
  return { order, hidden };
};

export const getMenuLayout = () => {
  try {
    return normalizeLayout(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch (e) {
    return normalizeLayout(null);
  }
};

export const setMenuLayout = (layout) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeLayout(layout)));
  } catch (e) {}
};

// Mueve una entrada una posición (dir = -1 sube, +1 baja)
export const moveEntry = (layout, id, dir) => {
  const l = normalizeLayout(layout);
  const i = l.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.order.length) return l;
  const order = l.order.slice();
  [order[i], order[j]] = [order[j], order[i]];
  return { ...l, order };
};

export const toggleHidden = (layout, id) => {
  const l = normalizeLayout(layout);
  const hidden = l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id];
  return { ...l, hidden };
};

// items: entradas del Menú con `menuId` (las que no lo tienen se dejan al final, como estaban)
export const applyMenuLayout = (items, layout = getMenuLayout()) => {
  const l = normalizeLayout(layout);
  const rank = (it) => (it && it.menuId ? l.order.indexOf(it.menuId) : l.order.length);
  return items
    .filter((it) => it && !(it.menuId && l.hidden.includes(it.menuId)))
    .map((it, i) => ({ it, i }))
    .sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i)
    .map(({ it }) => it);
};

// (4.12) Margen izquierdo de Documentos con el dedo (antes fijo, 14 px). localStorage
// `eliDocMargin`; se aplica como variable CSS --eli-doc-margin en <html>.
const MARGIN_KEY = 'eliDocMargin';
export const DOC_MARGIN_DEFAULT = 14;
export const DOC_MARGIN_MAX = 60;

export const clampMargin = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DOC_MARGIN_DEFAULT;
  return Math.min(DOC_MARGIN_MAX, Math.max(0, n));
};

export const getDocMargin = () => {
  try {
    const v = localStorage.getItem(MARGIN_KEY);
    return v == null || v === '' ? DOC_MARGIN_DEFAULT : clampMargin(v);
  } catch (e) {
    return DOC_MARGIN_DEFAULT;
  }
};

export const applyDocMargin = (px = getDocMargin()) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--eli-doc-margin', clampMargin(px) + 'px');
};

export const setDocMargin = (px) => {
  try {
    localStorage.setItem(MARGIN_KEY, String(clampMargin(px)));
  } catch (e) {}
  applyDocMargin(px);
};
