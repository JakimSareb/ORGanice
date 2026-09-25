// ORG Mode para Eli: conflictos de sincronización pendientes (uno por fichero). Los muestra el
// componente EliConflicts, esté abierto el fichero, el explorador o la vista GTD.
let conflicts = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(conflicts));

export const addConflict = (conflict) => {
  // Si el fichero ya tenía un conflicto pendiente, se actualiza con las versiones nuevas
  conflicts = [...conflicts.filter((c) => c.path !== conflict.path), conflict];
  emit();
};

export const removeConflict = (path) => {
  conflicts = conflicts.filter((c) => c.path !== path);
  emit();
};

export const hasConflict = (path) => conflicts.some((c) => c.path === path);

export const subscribeConflicts = (listener) => {
  listeners.add(listener);
  listener(conflicts);
  return () => listeners.delete(listener);
};

const normalize = (t) => (t || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
export const sameContents = (a, b) => normalize(a) === normalize(b);
