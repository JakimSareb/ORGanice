// ORG Mode para Eli (3.02): la tabla que se está editando (si hay una). La barra de Documentos
// (EliDocBar) la escucha para mostrar los botones de filas y columnas.
let active = null;
const listeners = new Set();

export const setActiveTable = (api, onlyIf = undefined) => {
  // al cerrar, solo se quita si sigue siendo la misma (otra tabla puede haber tomado el relevo)
  if (api === null && onlyIf !== undefined && active !== onlyIf) return;
  active = api;
  listeners.forEach((l) => l(active));
};

export const getActiveTable = () => active;

export const subscribeActiveTable = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
