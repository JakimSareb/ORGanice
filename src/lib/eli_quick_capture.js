// (3.22) Captura rápida dentro de la app: /capture?text=…&notes=…&url=…[&editar=1]
// (4.18) …[&plantilla=letra o nombre]: con una plantilla de captura (vacía = preguntar)
// Se lee al arrancar (antes de iniciar sesión o de la vuelta de Dropbox), se guarda en
// localStorage y la vista GTD lo añade al Inbox en cuanto ha cargado sus ficheros.
import { BASE_PATH } from './base_path';

const LS_KEY = 'eliQuickCapture';
const MAX_AGE = 15 * 60 * 1000; // una captura sin usar caduca a los 15 minutos

const clean = (s) =>
  String(s || '')
    .replace(/\r\n?/g, '\n')
    .trim();

// Parámetros → { title, notes, edit } (o null si no trae nada)
export const parseQuickCapture = (search) => {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch (e) {
    return null;
  }
  const get = (...names) => {
    for (const n of names) {
      const v = params.get(n);
      if (v != null && clean(v)) return clean(v);
    }
    return '';
  };
  let text = get('text', 'texto', 'title', 'titulo', 't');
  let notes = get('notes', 'notas', 'body');
  const url = get('url', 'u');
  // Varias líneas: la primera es el título y el resto va a las notas
  if (text.includes('\n')) {
    const [first, ...rest] = text.split('\n');
    text = first.trim();
    notes = [rest.join('\n').trim(), notes].filter(Boolean).join('\n');
  }
  if (url && !text.includes(url) && !notes.includes(url))
    notes = [notes, url].filter(Boolean).join('\n');
  if (!text && url) text = url;
  if (!text && notes) {
    const [first, ...rest] = notes.split('\n');
    text = first.trim();
    notes = rest.join('\n').trim();
  }
  // (4.18) &plantilla=… (letra o nombre): se captura con esa plantilla de captura (editor de
  // la tarea nueva con lo compartido dentro). Vacía o desconocida: la app pregunta cuál.
  const withTemplate = ['plantilla', 'template'].some((n) => params.has(n));
  const template = get('plantilla', 'template');
  if (!text && !withTemplate) return null;
  const e = params.get('editar') || params.get('edit');
  const out = { title: text, notes, edit: e != null && e !== '0' && e !== 'false' };
  return withTemplate ? { ...out, withTemplate: true, template } : out;
};

// (4.18) La plantilla que nombra el enlace: por su letra (exacta y luego sin mayúsculas) o por
// su nombre (sin mayúsculas). null si no hay ninguna así (entonces se pregunta).
export const findCaptureTemplate = (templates, name) => {
  const list = (templates && templates.toArray ? templates.toArray() : templates) || [];
  const n = String(name || '').trim();
  if (!n) return null;
  const low = n.toLowerCase();
  const field = (t, k) => String(t.get(k) || '').trim();
  return (
    list.find((t) => field(t, 'letter') === n) ||
    list.find((t) => field(t, 'letter').toLowerCase() === low) ||
    list.find((t) => field(t, 'description').toLowerCase() === low) ||
    null
  );
};

// (4.18) Lo compartido dentro de la tarea de la plantilla: si el título de la plantilla está
// vacío o acaba en espacio (su %? al final, «Llamar a %?»), el texto va en el título; si no, al
// principio de las notas. Las notas compartidas, al final de las de la plantilla.
export const fillCaptureDraft = (title, notes, shared) => {
  const t = String(title || '');
  const n = String(notes || '');
  const st = clean(shared && shared.title);
  const sn = clean(shared && shared.notes);
  if (!st && !sn) return { title: t, notes: n };
  const inTitle = !!st && (!t.trim() || /\s$/.test(t));
  const outTitle = inTitle ? t + st : t;
  const outNotes = [inTitle ? '' : st, n.trim() ? n.replace(/\s+$/, '') : '', sn]
    .filter(Boolean)
    .join('\n');
  return { title: outTitle, notes: outNotes };
};

// Ruta actual sin la base de la app (/ORGanice)
const appPath = (pathname) => {
  let p = pathname || '';
  if (BASE_PATH && p.startsWith(BASE_PATH)) p = p.substring(BASE_PATH.length);
  return p.replace(/\/+$/, '') || '/';
};

export const isCapturePath = (pathname) => appPath(pathname) === '/capture';

export const stashQuickCapture = (capture) => {
  if (!capture) return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ ...capture, at: Date.now() }));
  } catch (e) {}
};

export const peekQuickCapture = () => {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || (!c.title && !c.withTemplate) || Date.now() - (c.at || 0) > MAX_AGE) {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    return c;
  } catch (e) {
    return null;
  }
};

export const takeQuickCapture = () => {
  const c = peekQuickCapture();
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch (e) {}
  return c;
};

// Al cargar la app: si se abre /capture, se guarda lo que trae (se usa una sola vez)
export const captureFromLocation = (loc) => {
  if (!loc || !isCapturePath(loc.pathname)) return false;
  stashQuickCapture(parseQuickCapture(loc.search));
  return true;
};

try {
  if (typeof window !== 'undefined') captureFromLocation(window.location);
} catch (e) {}
