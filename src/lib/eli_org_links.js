// ORG Mode para Eli: enlaces a encabezados como los de Emacs (org-store-link, C-c l, e
// org-insert-link, C-c C-l): [[file:tareas.org::*Título][Título]], [[*Título]], [[#id]], [[id:…]]
import { List } from 'immutable';
import { PRIORITY_RE } from './eli_priority';
import { resolveDropboxPath } from './eli_media';

const ORG_FILE_RE = /\.org(_archive)?(\.gpg|\.asc)?$/i;

// Texto del encabezado como lo busca Emacs: sin estado, prioridad, etiquetas ni contadores
export const cleanHeadingText = (rawTitle) =>
  (rawTitle || '')
    .replace(PRIORITY_RE, '')
    .replace(/\[\d*\/\d*\]|\[\d*%\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Ruta relativa de `toPath` vista desde el directorio de `fromPath`
export const relativePath = (fromPath, toPath) => {
  const fromDir = (fromPath || '/').split('/').slice(0, -1).filter(Boolean);
  const to = (toPath || '').split('/').filter(Boolean);
  let i = 0;
  while (i < fromDir.length && i < to.length - 1 && fromDir[i] === to[i]) i++;
  const up = fromDir.length - i;
  return [...Array(up).fill('..'), ...to.slice(i)].join('/') || to.join('/');
};

/**
 * Enlace a un encabezado para escribir en el fichero `fromPath` (null = portapapeles, con la
 * ruta relativa a la carpeta del propio fichero).
 */
export const headingLink = ({ path, title }, fromPath = null) => {
  const text = cleanHeadingText(title);
  const safe = text.replace(/[[\]]/g, '');
  if (fromPath && fromPath === path) return `[[*${safe}][${safe}]]`;
  const rel = fromPath ? relativePath(fromPath, path) : path.split('/').pop();
  return `[[file:${rel}::*${safe}][${safe}]]`;
};

// Último enlace guardado (como org-stored-links), para insertarlo con la ruta correcta
let stored = null;
export const storeHeadingLink = (path, rawTitle) => {
  stored = { path, title: cleanHeadingText(rawTitle) };
  stored.clipboardText = headingLink(stored);
  return stored.clipboardText;
};
export const storedHeadingLink = () => stored;

/**
 * Si `uri` es un enlace a un fichero Org o a un encabezado, sus partes; si no, null.
 * { path: 'ruta' | null (este fichero), search: '*Título' | '#id' | 'texto' | null, id }
 */
export const parseOrgLink = (uri) => {
  const u = (uri || '').trim();
  if (!u) return null;
  if (/^id:/i.test(u)) return { path: null, search: null, id: u.slice(3).trim() };
  if (u.startsWith('*') || u.startsWith('#')) return { path: null, search: u, id: null };
  let rest = null;
  if (/^file:/i.test(u)) rest = u.slice(5);
  else if (/^(\.{1,2}\/|~\/|\/)/.test(u)) rest = u;
  if (rest === null) return null;
  const [file, ...searchParts] = rest.split('::');
  if (!ORG_FILE_RE.test(file)) return null;
  const search = searchParts.join('::').trim();
  return { path: file, search: search || null, id: null };
};

const propertyOf = (header, name) => {
  const item = (header.get('propertyListItems') || List()).find(
    (p) => (p.get('property') || '').toUpperCase() === name
  );
  if (!item) return null;
  return (item.get('value') || List())
    .map((v) => v.get('contents') || '')
    .join('')
    .trim();
};

// Encabezado que corresponde a la búsqueda del enlace (como org-link-search)
export const findLinkedHeader = (headers, search) => {
  if (!headers || !search) return null;
  if (search.startsWith('#')) {
    const id = search.slice(1).trim();
    return headers.find((h) => propertyOf(h, 'CUSTOM_ID') === id) || null;
  }
  const wanted = cleanHeadingText(search.startsWith('*') ? search.slice(1) : search).toLowerCase();
  if (!wanted) return null;
  const title = (h) => cleanHeadingText(h.getIn(['titleLine', 'rawTitle'])).toLowerCase();
  return (
    headers.find((h) => title(h) === wanted) ||
    headers.find((h) => title(h).startsWith(wanted)) ||
    headers.find((h) => title(h).includes(wanted)) ||
    (search.startsWith('*')
      ? null
      : headers.find((h) => (h.get('rawDescription') || '').toLowerCase().includes(wanted))) ||
    null
  );
};

// Busca un encabezado con :ID: en los ficheros cargados
export const findHeaderById = (files, id) => {
  let found = null;
  (files || []).forEach((file, path) => {
    if (found || !path || !file || !file.get('headers')) return;
    const h = file.get('headers').find((x) => propertyOf(x, 'ID') === id);
    if (h) found = { path, header: h };
  });
  return found;
};

/**
 * Ruta del fichero enlazado vista desde `basePath`. Si es una ruta de fuera de la app
 * (~/Dropbox/org/…, /Users/…), se busca entre las conocidas por el final de la ruta.
 */
export const resolveLinkedPath = (basePath, linkPath, knownPaths = []) => {
  if (!linkPath) return basePath;
  const direct = !linkPath.startsWith('~') ? resolveDropboxPath(basePath, linkPath) : null;
  if (direct && knownPaths.includes(direct)) return direct;
  const parts = linkPath.split('/').filter((p) => p && p !== '.' && p !== '..' && p !== '~');
  let best = null;
  let bestLen = 0;
  knownPaths.forEach((known) => {
    const kp = known.split('/').filter(Boolean);
    let n = 0;
    while (
      n < parts.length &&
      n < kp.length &&
      parts[parts.length - 1 - n] === kp[kp.length - 1 - n]
    )
      n++;
    if (n > bestLen) {
      best = known;
      bestLen = n;
    }
  });
  return best || direct;
};
