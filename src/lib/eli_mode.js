import { BASE_PATH } from './base_path';

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

// ORG Mode para Eli (2.12): volver donde estabas. En el iPhone, el sistema cierra la app si
// pasa un rato en segundo plano y, al volver, arranca desde la página inicial. Se recuerda la
// última vista (GTD, un fichero o una carpeta) y, si la app arranca en la página inicial, se
// vuelve a ella.
const LS_LAST_ROUTE = 'eliLastRoute';
const RESUMABLE = /^\/(gtd|file\/.+|files(\/.*)?)$/;

export const rememberRoute = (pathname, search = '') => {
  if (!pathname || !RESUMABLE.test(pathname)) return;
  try {
    window.localStorage.setItem(LS_LAST_ROUTE, pathname + (search || ''));
  } catch (e) {}
};

// Solo al arrancar en la raíz de la app (lo que abre el icono de la pantalla de inicio)
let resumeRoute = (() => {
  try {
    const base = BASE_PATH;
    let here = window.location.pathname;
    if (base && here.startsWith(base)) here = here.substring(base.length);
    if (here.replace(/\/+$/, '') !== '' || window.location.search.includes('capture')) return null;
    const route = window.localStorage.getItem(LS_LAST_ROUTE);
    return route && RESUMABLE.test(route.split('?')[0]) ? route : null;
  } catch (e) {
    return null;
  }
})();

export const takeResumeRoute = () => {
  const r = resumeRoute;
  resumeRoute = null;
  return r;
};
