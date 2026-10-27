// ORG Mode para Eli (4.12): orden y visibilidad de las entradas principales del Menú ☰
// (Ajustes › Apariencia › Menú ☰). Se guarda en este dispositivo (localStorage `eliMenuLayout`,
// JSON { order: [ids], hidden: [ids] }). «Ajustes» no está aquí: sale siempre, la última.
// (4.17) «Buscar (B)» (la búsqueda de la tecla B) y «Capturar con plantilla», nuevas; la de
// antes (paleta de comandos) pasa a llamarse «Paleta de comandos» (su id sigue siendo 'search')
// (4.23) «Bloc de notas rápido» (scratch.org junto al de entrada), ocultable como el resto
// (4.26) «Diario de hoy» (pages/diari-AAAA.org junto al de entrada)
export const MENU_ENTRIES = [
  { id: 'find', label: 'Buscar (B)' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'capture', label: 'Capturar con plantilla' },
  { id: 'search', label: 'Paleta de comandos' },
  { id: 'clocks', label: 'Tareas con reloj activo' },
  { id: 'scratch', label: 'Bloc de notas rápido' },
  { id: 'diary', label: 'Diario de hoy' },
  // (4.46) Zettelkasten: nota nueva y captura fugaz
  { id: 'zk', label: 'Nueva nota ZK' },
  { id: 'fugaz', label: 'Fugaz ZK' },
  // (4.37) orden por defecto = el del usuario (lib/eli_defaults.js › MENU_ORDER)
  { id: 'split', label: 'Dos columnas' },
  { id: 'processes', label: 'Procesos' },
  { id: 'files', label: 'Mis ficheros' },
  { id: 'view', label: 'Vista' },
  { id: 'tools', label: 'Herramientas' },
  { id: 'help', label: 'Ayuda' },
];
const KEY = 'eliMenuLayout';
const IDS = MENU_ENTRIES.map((e) => e.id);

// Normaliza lo guardado: ids conocidos, sin repetir; (4.17) los que falten (entradas nuevas), en
// su sitio por defecto: detrás de la anterior que ya esté (o los primeros)
export const normalizeLayout = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const order = (Array.isArray(r.order) ? r.order : []).filter(
    (id, i, a) => IDS.includes(id) && a.indexOf(id) === i
  );
  IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const prev = IDS.slice(0, i)
      .reverse()
      .find((x) => order.includes(x));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
  });
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter(
    (id, i, a) => IDS.includes(id) && a.indexOf(id) === i
  );
  // (4.45) `bar`: cuántas de las primeras entradas (de `order`) salen como icono en la barra de
  // arriba (la línea «Barra superior» de Ajustes); 0 = ninguna (como antes)
  const bar = Math.min(order.length, Math.max(0, Math.round(Number(r.bar)) || 0));
  return { order, hidden, bar };
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

// (4.45) La lista de Ajustes lleva una fila fija «Barra superior» entre las entradas: id especial
export const TOPBAR_LINE = '__topbar__';
export const layoutRows = (layout) => {
  const l = normalizeLayout(layout);
  const rows = l.order.slice();
  rows.splice(l.bar, 0, TOPBAR_LINE);
  return rows;
};
// Mueve una fila (una entrada o la línea) una posición; cruzar la línea la sube/baja de sitio
export const moveRow = (layout, id, dir) => {
  const l = normalizeLayout(layout);
  const rows = layoutRows(l);
  const i = rows.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return l;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  const bar = rows.indexOf(TOPBAR_LINE);
  return { ...l, order: rows.filter((x) => x !== TOPBAR_LINE), bar };
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

// (4.39) Margen DERECHO al editar y previsualizar (como el izquierdo, pero en todos los
// dispositivos). localStorage `eliEdgePad` (propio de cada dispositivo); se aplica como variable
// CSS --eli-edge-pad en <html> (la 4.37 la fijaba en 14 px).
const EDGE_KEY = 'eliEdgePad';
export const EDGE_PAD_DEFAULT = 14;
export const EDGE_PAD_MAX = 60;

export const clampEdgePad = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return EDGE_PAD_DEFAULT;
  return Math.min(EDGE_PAD_MAX, Math.max(0, n));
};

export const getEdgePad = () => {
  try {
    const v = localStorage.getItem(EDGE_KEY);
    return v == null || v === '' ? EDGE_PAD_DEFAULT : clampEdgePad(v);
  } catch (e) {
    return EDGE_PAD_DEFAULT;
  }
};

export const applyEdgePad = (px = getEdgePad()) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--eli-edge-pad', clampEdgePad(px) + 'px');
};

export const setEdgePad = (px) => {
  try {
    localStorage.setItem(EDGE_KEY, String(clampEdgePad(px)));
  } catch (e) {}
  applyEdgePad(px);
};

// (4.45) Reparte las entradas del Menú: las de ARRIBA de la línea «Barra superior» salen como
// icono en la barra (en ese orden; `maxBar` = cuántas caben, el resto se queda en el ☰), las
// demás (y las que no tienen menuId, como «Ajustes») se quedan en el ☰.
export const splitMenuLayout = (items, layout = getMenuLayout(), maxBar = Infinity) => {
  const l = normalizeLayout(layout);
  const sorted = applyMenuLayout(items, l);
  const top = new Set(l.order.slice(0, l.bar));
  const bar = [];
  const menu = [];
  sorted.forEach((it) => {
    if (it.menuId && top.has(it.menuId) && bar.length < maxBar) bar.push(it);
    else menu.push(it);
  });
  return { bar, menu };
};
