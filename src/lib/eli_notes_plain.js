// ORG Mode para Eli (4.44): ajuste «Notas en texto plano / Secciones editables» (Ajustes ›
// Documentos › Toques y edición).
//   - Secciones editables (por defecto, lo de siempre): los elementos con guion de las notas se
//     seleccionan y se editan uno a uno, con su barra (✎, contenido, ＋, subir, bajar…).
//   - Notas en texto plano: las notas se editan siempre como un único cuadro de texto; tocar un
//     elemento de la lista es como tocar el resto de las notas.
// Viaja entre dispositivos (localStorage eliNotesPlain).
import { useEffect, useState } from 'react';

const KEY = 'eliNotesPlain';
const listeners = new Set();

const read = () => {
  try {
    return window.localStorage.getItem(KEY) === 'true';
  } catch (e) {
    return false;
  }
};
// se lee cada vez: así vale también cuando el ajuste llega de otro dispositivo
export const isNotesPlain = () => read();

export const setNotesPlain = (v) => {
  const on = !!v;
  try {
    window.localStorage.setItem(KEY, on ? 'true' : 'false');
  } catch (e) {}
  listeners.forEach((l) => l(on));
};

export const useNotesPlain = () => {
  const [v, setV] = useState(read);
  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);
  return v;
};

export const subscribeNotesPlain = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
