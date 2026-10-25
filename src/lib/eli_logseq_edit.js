// ORG Mode para Eli (4.28): ajuste «Edición estilo Logseq» (Ajustes › Apariencia). Encendido:
//   - el título y las notas se editan donde están, sin ninguna marca (ni subrayado);
//   - las notas se ven como un bloque hijo, con sangría, bajo el título;
//   - Intro en el título = guarda y crea una cabecera hermana debajo (en edición);
//     Mayús+Intro = pasa a las notas.
// Apagado: como siempre (Intro guarda y sale; el cuadro lleva un subrayado fino).
// Se guarda en este navegador (localStorage eliLogseqEdit).
import { useEffect, useState } from 'react';

const KEY = 'eliLogseqEdit';
const listeners = new Set();

const read = () => {
  try {
    return window.localStorage.getItem(KEY) === 'true';
  } catch (e) {
    return false;
  }
};
let on = read();

const applyBodyClass = () => {
  try {
    document.body.classList.toggle('eli-logseq-edit', on);
  } catch (e) {}
};
applyBodyClass();

export const isLogseqEdit = () => on;

export const setLogseqEdit = (v) => {
  on = !!v;
  try {
    window.localStorage.setItem(KEY, on ? 'true' : 'false');
  } catch (e) {}
  applyBodyClass();
  listeners.forEach((l) => l(on));
};

export const useLogseqEdit = () => {
  const [v, setV] = useState(on);
  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);
  return v;
};
