// ORG Mode para Eli (4.46): Zettelkasten base. Modelo puro (sin Redux ni DOM):
//   - Carpeta ZK y nombres de fichero estilo org-roam (`AAAAMMDDHHMMSS-slug.org`).
//   - Plantillas: permanente, índice y ficha de fuente (libro / artículo / vídeo).
//   - Tabla «Puntos destacados» de la ficha: fila nueva (con `|` escapado) y cita larga abajo.
//   - Fugaces: entrada para `ZK/inbox.org`.
//   - Alias (`:ROAM_ALIASES:`): formato para escribirlos.
// Compatible con org-roam: tipo de nota = `#+filetags:`; ID en el cajón del preámbulo.
import { slugify } from './eli_roam';
import { alignOrgTable } from './eli_org_table';

export const ZK_DEFAULT_FOLDER = 'ZK/';
export const ZK_KINDS = ['permanente', 'literatura', 'indice'];
export const KIND_DIR = {
  permanente: 'permanentes/',
  literatura: 'literatura/',
  indice: 'indices/',
};
export const KIND_LABEL = {
  permanente: 'Nota permanente',
  literatura: 'Ficha de fuente (libro, artículo, vídeo)',
  indice: 'Índice',
};
export const SOURCE_TYPES = [
  { id: 'libro', label: 'Libro' },
  { id: 'articulo', label: 'Artículo' },
  { id: 'video', label: 'Vídeo' },
];
export const SOURCE_STATES = ['pendiente', 'leyendo', 'leído', 'abandonado'];
export const POINT_TYPES = ['idea', 'cita', 'dato', 'ejemplo', 'pregunta'];
export const INBOX_NAME = 'inbox.org';
export const POINTS_HEADING = 'Puntos destacados';
export const QUOTES_HEADING = 'Citas';
export const POINT_HEADER = ['Dónde', 'Sección', 'Punto o cita', 'Tipo', 'Nota ZK'];

const pad = (n, len = 2) => String(n).padStart(len, '0');

// AAAAMMDDHHMMSS (como org-roam-capture)
export const zkTimestamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;

// Una sola línea: sin saltos y con los espacios recortados
const oneLine = (s) =>
  String(s == null ? '' : s)
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();

// Carpeta ZK del ajuste: relativa a la del fichero de entrada (o absoluta), con «/» al final
export const normalizeZkFolder = (raw) => {
  let d = String(raw || '').trim();
  if (!d) d = ZK_DEFAULT_FOLDER;
  d = d.replace(/\/{2,}/g, '/');
  return d.endsWith('/') ? d : `${d}/`;
};

// `zkDir` = carpeta ZK ya resuelta (absoluta, con «/» al final)
export const zkNotePath = (zkDir, kind, title, date = new Date()) =>
  `${zkDir}${KIND_DIR[kind] || ''}${zkTimestamp(date)}-${slugify(title)}.org`;
export const zkInboxPath = (zkDir) => `${zkDir}${INBOX_NAME}`;

// ¿Es una ficha de fuente? (`#+filetags:` con «literatura»)
export const isSourceCard = (filetags) =>
  (filetags || []).map((t) => String(t).toLowerCase()).includes('literatura');

// --- Plantillas -------------------------------------------------------------------------

const idDrawer = (id, extra = []) =>
  [':PROPERTIES:', `:ID:       ${id}`, ...extra, ':END:'].join('\n');

export const permanentText = ({ title, id }) =>
  `${idDrawer(id)}\n#+title: ${oneLine(
    title
  )}\n#+filetags: :permanente:\n\n* Idea\n\n* Enlaces\n\n* Fuente\n`;

export const indexText = ({ title, id }) =>
  `${idDrawer(id)}\n#+title: ${oneLine(title)}\n#+filetags: :indice:\n\n* Notas\n`;

export const formatAliases = (list) =>
  (list || [])
    .map((a) => oneLine(a))
    .filter(Boolean)
    .map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(' ');

export const pointsTable = () =>
  alignOrgTable([`| ${POINT_HEADER.join(' | ')} |`, `|${POINT_HEADER.map(() => '-').join('+')}|`]);

/**
 * Ficha de fuente. f: { id, type, title, author, year, source, url, isbn, alias }
 */
export const sourceText = (f) => {
  const type = SOURCE_TYPES.some((t) => t.id === f.type) ? f.type : 'libro';
  const refs = [f.isbn ? `isbn:${oneLine(f.isbn)}` : '', oneLine(f.url)].filter(Boolean).join(' ');
  const extra = [];
  if (refs) extra.push(`:ROAM_REFS: ${refs}`);
  const aliases = formatAliases(f.alias ? [f.alias] : []);
  if (aliases) extra.push(`:ROAM_ALIASES: ${aliases}`);
  return [
    idDrawer(f.id, extra),
    `#+title: ${oneLine(f.title)}`,
    `#+filetags: :literatura:${type}:`,
    `#+AUTOR: ${oneLine(f.author)}`,
    `#+AÑO: ${oneLine(f.year)}`,
    `#+FUENTE: ${oneLine(f.source)}`,
    `#+URL: ${oneLine(f.url)}`,
    '#+ESTADO: pendiente',
    '#+INICIO: ',
    '#+FIN: ',
    '#+VALORACIÓN: ',
    '* Por qué lo leo',
    '',
    '* Resumen en 3 frases',
    '',
    `* ${POINTS_HEADING}`,
    ...pointsTable(),
    '',
    `* ${QUOTES_HEADING}`,
    '',
    '* Preguntas y desacuerdos',
    '',
    '* Notas permanentes creadas',
    '',
  ].join('\n');
};

// --- Tabla «Puntos destacados» -------------------------------------------------------------

// Celda de tabla Org: sin saltos de línea y con `|` escapado (`\vert{}`)
export const escapeCell = (s) => oneLine(s).replace(/\|/g, '\\vert{}');

const firstWords = (text, n = 6) => {
  const w = oneLine(text).split(' ').filter(Boolean);
  return w.length > n ? `${w.slice(0, n).join(' ')}…` : w.join(' ');
};

// Rango de una cabecera de nivel 1 por su título: { start, end } (end = siguiente `* ` o fin)
const sectionRange = (lines, title) => {
  const re = new RegExp(`^\\*\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\*\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
};

// Fin de la sección sin sus líneas vacías de cola
const trimmedEnd = (lines, { start, end }) => {
  let e = end;
  while (e > start + 1 && !lines[e - 1].trim()) e--;
  return e;
};

/**
 * Añade un punto a la ficha → texto nuevo del fichero.
 * point: { where, section, text, type }; opts: { longQuote, newId } (la cita larga baja a
 * `* Citas` como subcabecera con :ID: y la celda guarda las primeras palabras + [[id:…][↓]]).
 */
export const addPointToText = (fileText, point, opts = {}) => {
  const lines = String(fileText || '').split('\n');
  const where = oneLine(point.where);
  const full = oneLine(point.text);
  const longQuote = !!opts.longQuote && !!opts.newId && !!full;
  const cellText = longQuote ? `${firstWords(full)} [[id:${opts.newId}][↓]]` : full;
  const row = `| ${[where, oneLine(point.section), cellText, oneLine(point.type), '']
    .map(escapeCell)
    .join(' | ')} |`;

  // 1. la fila, al final de la tabla de «Puntos destacados» (se crea si falta) y alineada
  let sec = sectionRange(lines, POINTS_HEADING);
  if (!sec) {
    const end = lines.length && !lines[lines.length - 1].trim() ? lines.length - 1 : lines.length;
    lines.splice(end, 0, `* ${POINTS_HEADING}`, ...pointsTable(), '');
    sec = sectionRange(lines, POINTS_HEADING);
  }
  let first = -1;
  let last = -1;
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (/^\s*\|/.test(lines[i])) {
      if (first < 0) first = i;
      last = i;
    } else if (first >= 0) break;
  }
  if (first < 0) {
    const at = sec.start + 1;
    lines.splice(at, 0, ...pointsTable());
    first = at;
    last = at + 1;
  }
  const table = lines.slice(first, last + 1);
  lines.splice(first, last - first + 1, ...alignOrgTable([...table, row]));

  // 2. la cita larga, como subcabecera con :ID: al final de `* Citas`
  if (longQuote) {
    let q = sectionRange(lines, QUOTES_HEADING);
    if (!q) {
      const end = lines.length && !lines[lines.length - 1].trim() ? lines.length - 1 : lines.length;
      lines.splice(end, 0, `* ${QUOTES_HEADING}`, '');
      q = sectionRange(lines, QUOTES_HEADING);
    }
    const at = trimmedEnd(lines, q);
    const head = `** ${where ? `${where} — ` : ''}${firstWords(full, 6)}`;
    lines.splice(at, 0, head, ':PROPERTIES:', `:ID:       ${opts.newId}`, ':END:', full);
  }
  return lines.join('\n');
};

// --- Fugaces -----------------------------------------------------------------------------

export const INBOX_HEAD = '#+title: Fugaces\n#+filetags: :fugaz:\n\n';

/**
 * Entrada de `ZK/inbox.org`. opts: { id, created: '[2026-10-27 Tue 23:50]', origin: '[[id:…][…]]' }
 * La primera línea es el título; el resto, el cuerpo.
 */
export const fugazEntry = (text, opts = {}) => {
  const [first, ...rest] = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  const title = oneLine(first) || 'Fugaz';
  const body = [...rest.map((l) => l.trimEnd()), opts.origin ? `Origen: ${opts.origin}` : '']
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
  const props = [':PROPERTIES:'];
  if (opts.id) props.push(`:ID:       ${opts.id}`);
  if (opts.created) props.push(`:CREATED:  ${opts.created}`);
  props.push(':END:');
  return `* ${title.replace(/^\*+\s*/, '')}\n${props.join('\n')}\n${body ? `${body}\n` : ''}`;
};

// Texto del inbox con la entrada añadida (el fichero se crea con su cabecera si no existe)
export const appendFugaz = (oldText, entry) => {
  const old = String(oldText || '');
  if (!old.trim()) return `${INBOX_HEAD}${entry}`;
  return `${old}${old.endsWith('\n') ? '' : '\n'}${entry}`;
};
