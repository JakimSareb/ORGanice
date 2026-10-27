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

export const getFont = () => {
  try {
    const v = localStorage.getItem(KEY);
    return FONTS.some((f) => f.id === v) ? v : 'normal';
  } catch (e) {
    return 'normal';
  }
};

export const applyFont = (id = getFont()) => {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (!id || id === 'normal') el.removeAttribute('data-eli-font');
  else el.setAttribute('data-eli-font', id);
};

export const setFont = (id) => {
  try {
    localStorage.setItem(KEY, id);
  } catch (e) {}
  applyFont(id);
};
