// ORG Mode para Eli (3.02): «candado» de Documentos (modo lectura). Con él puesto se puede
// tocar, moverse entre cabeceras, plegar/desplegar y leer, pero nada entra en edición. Se recuerda
// en este navegador (localStorage eliDocLock).
import { useEffect, useState } from 'react';

const KEY = 'eliDocLock';
let locked = (() => {
  try {
    return window.localStorage.getItem(KEY) === 'true';
  } catch (e) {
    return false;
  }
})();
const listeners = new Set();

const applyBodyClass = () => {
  try {
    document.body.classList.toggle('eli-doc-locked', locked);
  } catch (e) {}
};
applyBodyClass();

export const isDocLocked = () => locked;

// Durante una captura (plantilla), su editor sí funciona aunque el candado esté puesto
let captureActive = false;
export const setCaptureActive = (v) => {
  captureActive = !!v;
};
export const isCaptureActive = () => captureActive;

export const setDocLocked = (v) => {
  locked = !!v;
  try {
    window.localStorage.setItem(KEY, locked ? 'true' : 'false');
  } catch (e) {}
  applyBodyClass();
  listeners.forEach((l) => l(locked));
};

export const toggleDocLock = () => setDocLocked(!locked);

export const subscribeDocLock = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useDocLock = () => {
  const [v, setV] = useState(locked);
  useEffect(() => subscribeDocLock(setV), []);
  return v;
};
