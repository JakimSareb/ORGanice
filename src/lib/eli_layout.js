// ORG Mode para Eli (4.31): anchos de este dispositivo (localStorage; comodidad del dispositivo,
// no ajuste compartido):
//   - ancho de la barra lateral de GTD (tirador arrastrable, solo ordenador; doble clic = por
//     defecto), como variable CSS en <html>;
//   - «Ancho del contenido» de GTD y Documentos: estrecho / medio / completo (data-eli-width).
const LS_PREFIX = 'eliWidth:';
const LS_CONTENT = 'eliContentWidth';

export const PANES = {
  gtdSide: { cssVar: '--eli-gtd-side-w', def: 240, min: 170, max: 520 },
};

export const clampWidth = (pane, px) => {
  const p = PANES[pane];
  if (!p) return px;
  const n = Math.round(Number(px));
  if (!Number.isFinite(n)) return p.def;
  return Math.max(p.min, Math.min(p.max, n));
};

const lsGet = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch (e) {}
};

export const getPaneWidth = (pane) => {
  const v = lsGet(LS_PREFIX + pane);
  return v ? clampWidth(pane, v) : PANES[pane].def;
};

const applyPane = (pane, px) => {
  try {
    const root = document.documentElement;
    if (px == null) root.style.removeProperty(PANES[pane].cssVar);
    else root.style.setProperty(PANES[pane].cssVar, `${px}px`);
  } catch (e) {}
};

// px = null → ancho por defecto
export const setPaneWidth = (pane, px, { save = true } = {}) => {
  const v = px == null ? null : clampWidth(pane, px);
  applyPane(pane, v);
  if (save) lsSet(LS_PREFIX + pane, v == null ? null : String(v));
  return v == null ? PANES[pane].def : v;
};

export const CONTENT_WIDTHS = [
  { id: 'narrow', label: 'Estrecho' },
  { id: 'medium', label: 'Medio' },
  { id: 'full', label: 'Completo' },
];

export const getContentWidth = () => {
  const v = lsGet(LS_CONTENT);
  return CONTENT_WIDTHS.some((w) => w.id === v) ? v : 'full';
};

export const applyContentWidth = (id = getContentWidth()) => {
  try {
    const el = document.documentElement;
    if (!id || id === 'full') el.removeAttribute('data-eli-width');
    else el.setAttribute('data-eli-width', id);
  } catch (e) {}
};

export const setContentWidth = (id) => {
  lsSet(LS_CONTENT, id);
  applyContentWidth(id);
};

// (4.31) Fecha de modificación corta: hoy → hora; este año → «3 oct»; si no → «3 oct 2024»
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const shortDate = (value, now = new Date()) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
};

// Al cargar: lo guardado en este dispositivo
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  Object.keys(PANES).forEach((p) => {
    if (lsGet(LS_PREFIX + p)) applyPane(p, getPaneWidth(p));
  });
  applyContentWidth();
}
