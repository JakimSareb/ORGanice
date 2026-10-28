// ORG Mode para Eli (4.52): «Abrir y terminar de editar» en Procesar Inbox. Al salir de GTD hacia
// el fichero se guarda aquí el estado de Procesar Inbox (la cola, la tarea y la pregunta en curso);
// la barra «← Volver a Procesar Inbox» lo conserva y GTD lo recoge al volver a montarse.
let saved = null;
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

export const setProcReturn = (v) => {
  saved = v || null;
  notify();
};
export const getProcReturn = () => saved;
export const takeProcReturn = () => {
  const v = saved;
  saved = null;
  notify();
  return v;
};
export const subscribeProcReturn = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
