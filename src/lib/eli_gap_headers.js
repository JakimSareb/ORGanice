// ORG Mode para Eli (4.36): ajuste «Espacio tras cada cabecera» (Ajustes › Documentos).
// Encendido por defecto: al final de cada cabecera (después de su nota/lista y de sus
// subcabeceras) queda un hueco de una línea, solo VISUAL (margen CSS; el fichero .org no cambia).
// Se guarda en localStorage `eliGapHeaders` ('off' = apagado), viaja entre dispositivos, y pone la
// clase `eli-gap-headers` en <body>.
import { useEffect, useState } from 'react';

const KEY = 'eliGapHeaders';
const listeners = new Set();

const read = () => {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch (e) {
    return true;
  }
};
let on = read();

const applyBodyClass = () => {
  try {
    document.body.classList.toggle('eli-gap-headers', on);
  } catch (e) {}
};
applyBodyClass();

// Ajustes llegados de otro dispositivo (Ajustes sincronizados): se vuelven a leer
try {
  window.addEventListener('eli:prefs-applied', () => {
    on = read();
    applyBodyClass();
    listeners.forEach((l) => l(on));
  });
} catch (e) {}

export const getGapHeaders = () => on;

export const setGapHeaders = (v) => {
  on = !!v;
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch (e) {}
  applyBodyClass();
  listeners.forEach((l) => l(on));
};

export const useGapHeaders = () => {
  const [v, setV] = useState(on);
  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);
  return v;
};
