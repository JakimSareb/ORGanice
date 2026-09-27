// ORG Mode para Eli: dos modos de la app, «Documentos» (hojas y explorador) y «GTD». Cada modo
// recuerda dónde se dejó: al volver a Documentos se abre el último fichero (con el encabezado
// seleccionado y, si estaba reducido, en narrow) o la última carpeta.

const LS_KEY = 'eliLastDocRoute';
let lastDoc = null;

export const rememberDoc = (info) => {
  if (!info || !info.route) return;
  lastDoc = info;
  try {
    window.localStorage.setItem(LS_KEY, info.route);
  } catch (e) {}
};

export const lastDocument = () => {
  if (lastDoc) return lastDoc;
  try {
    const route = window.localStorage.getItem(LS_KEY);
    if (route) return { route };
  } catch (e) {}
  return null;
};

// Fundido corto al cambiar de modo
export const modeFade = () => {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.classList.remove('eli-mode-fade');
  // reinicia la animación
  void body.offsetWidth; // eslint-disable-line no-void
  body.classList.add('eli-mode-fade');
  clearTimeout(modeFade.t);
  modeFade.t = setTimeout(() => body.classList.remove('eli-mode-fade'), 400);
};

export const openDocuments = () => window.dispatchEvent(new CustomEvent('eli:open-docs'));
export const openGtdMode = () => window.dispatchEvent(new CustomEvent('eli:open-gtd'));
