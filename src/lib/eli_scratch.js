// ORG Mode para Eli (4.23): bloc de notas rápido (scratch). Un fichero scratch.org junto al de
// entrada (inbox.org) que se abre desde el Menú ☰ en una hoja con un cuadro de texto grande.
// No se analiza ni entra en GTD, la agenda ni los avisos (como horizons.org).
export const SCRATCH_NAME = 'scratch.org';

// scratch.org junto al fichero dado (o en la raíz)
export const scratchPathNear = (path) => {
  const i = String(path || '').lastIndexOf('/');
  return (i >= 0 ? path.slice(0, i + 1) : '/') + SCRATCH_NAME;
};

// Dónde está: junto al inbox elegido en Ajustes; si no, junto al inbox.org cargado de ruta más
// corta; si no, en la raíz.
export const scratchPath = (chosenInbox, loadedPaths) => {
  if (chosenInbox) return scratchPathNear(chosenInbox);
  const inbox = (loadedPaths || [])
    .filter((p) => /(^|\/)inbox\.org$/i.test(p))
    .sort((a, b) => a.length - b.length)[0];
  return scratchPathNear(inbox || '/');
};

export const openScratch = () => window.dispatchEvent(new CustomEvent('eli:scratch'));
