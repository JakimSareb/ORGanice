// ORG Mode para Eli (4.10): tipo de letra de toda la app (Ajustes › Apariencia). Se guarda en este
// dispositivo (localStorage `eliFont`) y se aplica como atributo de <html> (data-eli-font); el CSS
// está en src/eli_font.css. «Normal» = como siempre (Verdana).
export const FONTS = [
  { id: 'normal', label: 'Normal' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Monoespaciada' },
  { id: 'rounded', label: 'Redondeada' },
  { id: 'iosevka', label: 'Iosevka' }, // (4.39)
  { id: 'system', label: 'Del sistema' }, // (4.54) cualquier fuente instalada, por su nombre
];
const KEY = 'eliFont';
// (4.43) «Aplicar también a GTD»: por defecto apagado (GTD usa su propia letra del sistema). Se
// guarda en este dispositivo (localStorage `eliFontGtd`) y se aplica como atributo de <html>
// (data-eli-font-gtd); el CSS está en src/eli_font.css.
const KEY_GTD = 'eliFontGtd';

// (4.54) «Del sistema»: nombre de cualquier fuente instalada en este dispositivo (localStorage
// `eliFontCustom`, solo de este dispositivo). Se limpia para que no pueda romper el CSS.
const KEY_CUSTOM = 'eliFontCustom';
export const cleanFontName = (name) =>
  String(name || '')
    .replace(/[^\p{L}\p{N} ._()+-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
export const fontFamilyCss = (name) => {
  const n = cleanFontName(name);
  return n ? `"${n}", -apple-system, 'Helvetica Neue', Arial, sans-serif` : '';
};
export const getCustomFont = () => {
  try {
    return cleanFontName(localStorage.getItem(KEY_CUSTOM) || '');
  } catch (e) {
    return '';
  }
};
// Fuentes instaladas (Chrome/Edge de escritorio, con permiso). null = el navegador no lo permite
// (Safari/iPhone): ahí solo vale escribir el nombre.
export const listLocalFonts = async () => {
  try {
    if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') return null;
    const fonts = await window.queryLocalFonts();
    const families = Array.from(new Set(fonts.map((f) => f.family))).filter(Boolean);
    return families.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  } catch (e) {
    return null; // permiso denegado
  }
};

export const getFontGtd = () => {
  try {
    return localStorage.getItem(KEY_GTD) === 'true';
  } catch (e) {
    return false;
  }
};

export const getFont = () => {
  try {
    const v = localStorage.getItem(KEY);
    return FONTS.some((f) => f.id === v) ? v : 'normal';
  } catch (e) {
    return 'normal';
  }
};

export const applyFont = (id = getFont(), gtd = getFontGtd()) => {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  // «Del sistema» sin nombre = como «Normal»
  const custom = id === 'system' ? fontFamilyCss(getCustomFont()) : '';
  if (!id || id === 'normal' || (id === 'system' && !custom)) el.removeAttribute('data-eli-font');
  else el.setAttribute('data-eli-font', id);
  if (custom) el.style.setProperty('--eli-font', custom);
  else el.style.removeProperty('--eli-font');
  if (gtd) el.setAttribute('data-eli-font-gtd', 'true');
  else el.removeAttribute('data-eli-font-gtd');
};

export const setFont = (id) => {
  try {
    localStorage.setItem(KEY, id);
  } catch (e) {}
  applyFont(id);
};

export const setFontGtd = (on) => {
  try {
    localStorage.setItem(KEY_GTD, on ? 'true' : 'false');
  } catch (e) {}
  applyFont(getFont(), !!on);
};

export const setCustomFont = (name) => {
  try {
    localStorage.setItem(KEY_CUSTOM, cleanFontName(name));
  } catch (e) {}
  applyFont();
};
