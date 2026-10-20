// ORG Mode para Eli (4.0): «Modo Notas». Oculta todo lo de GTD y lo de tareas en Documentos (no
// hay otra rama de código: solo se esconden cosas). Se recuerda en este navegador
// (localStorage eliNotesMode). Las herramientas opcionales (Calculadora, Fases de la luna,
// Acomodadores, Calendario) tienen cada una su interruptor (localStorage eliTools); sin tocar,
// están encendidas en el modo completo y apagadas en el Modo Notas.
import { useEffect, useState } from 'react';

const KEY = 'eliNotesMode';
const TOOLS_KEY = 'eliTools';

export const TOOLS = [
  { id: 'calc', label: 'Calculadora' },
  { id: 'moon', label: 'Fases de la luna' },
  { id: 'acom', label: 'Acomodadores' },
  { id: 'cal', label: 'Calendario' },
];

const read = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch (e) {}
};

let notes = read(KEY) === 'true';
let tools = (() => {
  try {
    return JSON.parse(read(TOOLS_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
})();
const listeners = new Set();

const applyBodyClass = () => {
  try {
    document.body.classList.toggle('eli-notes-mode', notes);
  } catch (e) {}
};
applyBodyClass();

const notify = () => listeners.forEach((l) => l(notes));

export const isNotesMode = () => notes;

// Al cambiar de modo, las herramientas vuelven a su valor de inicio (apagadas en Modo Notas)
export const setNotesMode = (v) => {
  notes = !!v;
  tools = {};
  write(KEY, notes ? 'true' : 'false');
  write(TOOLS_KEY, null);
  applyBodyClass();
  notify();
};

export const toolOn = (id) => (typeof tools[id] === 'boolean' ? tools[id] : !notes);

export const setToolOn = (id, v) => {
  tools = { ...tools, [id]: !!v };
  write(TOOLS_KEY, JSON.stringify(tools));
  notify();
};

export const subscribeNotesMode = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Vuelve a pintar al cambiar el modo o una herramienta; devuelve si está el Modo Notas
export const useNotesMode = () => {
  const [, setN] = useState(0);
  useEffect(() => subscribeNotesMode(() => setN((n) => n + 1)), []);
  return notes;
};

// Para las pruebas
export const _resetNotesModeForTests = () => {
  notes = read(KEY) === 'true';
  try {
    tools = JSON.parse(read(TOOLS_KEY) || '{}') || {};
  } catch (e) {
    tools = {};
  }
};
