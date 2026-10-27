// ORG Mode para Eli (4.10): tipo de letra de toda la app (Ajustes › Apariencia). Se guarda en este
// dispositivo (localStorage `eliFont`) y se aplica como atributo de <html> (data-eli-font); el CSS
// está en src/eli_font.css. «Normal» = como siempre (Verdana).
export const FONTS = [
  { id: 'normal', label: 'Normal' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Monoespaciada' },
  { id: 'rounded', label: 'Redondeada' },
  { id: 'iosevka', label: 'Iosevka' }, // (4.39)
];
const KEY = 'eliFont';
// (4.43) «Aplicar también a GTD»: por defecto apagado (GTD usa su propia letra del sistema). Se
// guarda en este dispositivo (localStorage `eliFontGtd`) y se aplica como atributo de <html>
// (data-eli-font-gtd); el CSS está en src/eli_font.css.
const KEY_GTD = 'eliFontGtd';

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
  if (!id || id === 'normal') el.removeAttribute('data-eli-font');
  else el.setAttribute('data-eli-font', id);
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
