// ORG Mode para Eli (4.30): ajuste «Etiquetas de las cabeceras» (Ajustes › Apariencia).
//   'side'  = a la derecha del título, en la misma línea (como en la 4.28; por defecto)
//   'below' = debajo del título, pequeñas y a la izquierda
// Se guarda en este navegador (localStorage eliTagsPos) y pone la clase `eli-tags-below` en <body>.
import { useEffect, useState } from 'react';

const KEY = 'eliTagsPos';
const listeners = new Set();

export const normalizeTagsPos = (v) => (v === 'below' ? 'below' : 'side');

const read = () => {
  try {
    return normalizeTagsPos(window.localStorage.getItem(KEY));
  } catch (e) {
    return 'side';
  }
};
let pos = read();

const applyBodyClass = () => {
  try {
    document.body.classList.toggle('eli-tags-below', pos === 'below');
  } catch (e) {}
};
applyBodyClass();

export const getTagsPos = () => pos;

export const setTagsPos = (v) => {
  pos = normalizeTagsPos(v);
  try {
    window.localStorage.setItem(KEY, pos);
  } catch (e) {}
  applyBodyClass();
  listeners.forEach((l) => l(pos));
};

export const useTagsPos = () => {
  const [v, setV] = useState(pos);
  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);
  return v;
};
