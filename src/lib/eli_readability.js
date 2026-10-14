// ORG Mode para Eli (3.06): legibilidad del texto en Documentos (todos los temas). Se guarda en
// este dispositivo y se aplica como atributo de <html> (data-eli-read); el CSS está en
// src/eli_readability.css. theme-init.js lo pone antes de cargar el CSS (sin parpadeo).
export const READABILITY = [
  { id: 'normal', label: 'Normal' },
  { id: 'contrast', label: 'Más contraste' },
  { id: 'soft', label: 'Combinado suave' },
  { id: 'legible', label: 'Fuente legible' },
];
const KEY = 'eliReadability';

export const getReadability = () => {
  try {
    const v = localStorage.getItem(KEY);
    return READABILITY.some((r) => r.id === v) ? v : 'normal';
  } catch (e) {
    return 'normal';
  }
};

export const applyReadability = (id = getReadability()) => {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (!id || id === 'normal') el.removeAttribute('data-eli-read');
  else el.setAttribute('data-eli-read', id);
};

export const setReadability = (id) => {
  try {
    localStorage.setItem(KEY, id);
  } catch (e) {}
  applyReadability(id);
};
