// ORG Mode para Eli (4.59): notas de PDF compatibles con org-noter (Emacs).
// Sesión = cabecera con `:NOTER_DOCUMENT: ruta.pdf` (relativa al .org o absoluta); cada nota es
// una subcabecera con `:NOTER_PAGE: n` (o `(n . posición)` / `(n x . y)`). Todo se hace sobre el
// TEXTO del fichero: se insertan líneas nuevas y el resto queda byte a byte igual.
import { resolveDropboxPath } from './eli_media';

const HEADING = /^(\*+)\s+(.*)$/;
const PLANNING = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;
const PROP = /^\s*:([^:\s]+):\s*(.*?)\s*$/;

// «3», «(3 . 0.45)», «(3 0.2 . 0.45)» → { page: 3, pos: 0.45 | null }; si no, null
export const parseNoterPage = (value) => {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  let m = v.match(/^(\d+)$/);
  if (m) return { page: parseInt(m[1], 10), pos: null };
  m = v.match(/^\(\s*(\d+)(?:\s+[-\d.]+)?\s*\.\s*([-\d.]+)\s*\)$/);
  if (m) return { page: parseInt(m[1], 10), pos: parseFloat(m[2]) };
  m = v.match(/^\(\s*(\d+)\b/);
  if (m) return { page: parseInt(m[1], 10), pos: null };
  return null;
};

// Cabeceras del texto: { line, level, title, props, end } (end = primera línea fuera del subárbol)
export const headingsOf = (text) => {
  const lines = (text || '').split('\n');
  const out = [];
  let inBlock = false;
  lines.forEach((l, i) => {
    // las líneas dentro de bloques #+begin_… no son cabeceras
    if (/^\s*#\+begin_/i.test(l)) inBlock = true;
    else if (/^\s*#\+end_/i.test(l)) inBlock = false;
    if (inBlock) return;
    const m = l.match(HEADING);
    if (m) out.push({ line: i, level: m[1].length, title: m[2] });
  });
  out.forEach((h, k) => {
    let j = k + 1;
    while (j < out.length && out[j].level > h.level) j += 1;
    h.end = j < out.length ? out[j].line : lines.length;
    h.bodyEnd = k + 1 < out.length ? out[k + 1].line : lines.length;
    h.props = {};
    let i = h.line + 1;
    while (i < h.bodyEnd && PLANNING.test(lines[i])) i += 1;
    h.drawerEnd = h.line + 1;
    if (i < h.bodyEnd && lines[i].trim().toUpperCase() === ':PROPERTIES:') {
      for (i += 1; i < h.bodyEnd; i += 1) {
        if (lines[i].trim().toUpperCase() === ':END:') {
          h.drawerEnd = i + 1;
          break;
        }
        const p = lines[i].match(PROP);
        if (p) h.props[p[1].toUpperCase()] = p[2];
      }
    }
    h.body = lines
      .slice(Math.max(h.drawerEnd, h.line + 1), h.bodyEnd)
      .filter((l) => !PLANNING.test(l))
      .join('\n')
      .trim();
  });
  return out;
};

const baseName = (p) => (p || '').split('/').pop();

// ¿La ruta de `:NOTER_DOCUMENT:` (escrita en `orgPath`) es este PDF? 2 = exacta, 1 = mismo nombre
// con ruta absoluta de otro ordenador (~/…, /Users/…), 0 = no
export const noterDocMatches = (orgPath, doc, pdfPath) => {
  if (!doc || !pdfPath) return 0;
  const raw = doc.replace(/^file:/i, '').trim();
  if (!raw.startsWith('~') && resolveDropboxPath(orgPath, raw) === pdfPath) return 2;
  if ((raw.startsWith('~') || raw.startsWith('/')) && baseName(raw) === baseName(pdfPath)) return 1;
  return 0;
};

// Sesiones org-noter del texto: [{ index, line, level, title, document, notes: [...] }]
export const noterSessions = (text) => {
  const hs = headingsOf(text);
  const sessions = [];
  hs.forEach((h, index) => {
    if (!h.props.NOTER_DOCUMENT) return;
    const notes = [];
    hs.forEach((n, ni) => {
      if (n.line <= h.line || n.line >= h.end) return;
      const pg = parseNoterPage(n.props.NOTER_PAGE);
      if (!pg) return;
      notes.push({
        index: ni,
        line: n.line,
        level: n.level,
        title: n.title,
        page: pg.page,
        pos: pg.pos,
        body: n.body,
      });
    });
    sessions.push({
      index,
      line: h.line,
      level: h.level,
      end: h.end,
      title: h.title,
      document: h.props.NOTER_DOCUMENT,
      notes,
    });
  });
  return sessions;
};

// La sesión de este PDF en el texto (la de ruta exacta antes que la de solo nombre) o null
export const sessionForPdf = (text, orgPath, pdfPath) => {
  let best = null;
  let bestScore = 0;
  noterSessions(text).forEach((s) => {
    const score = noterDocMatches(orgPath, s.document, pdfPath);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  });
  return best;
};

// Ruta del PDF relativa a la carpeta del .org (como la escribe org-noter)
export const relativeDocPath = (orgPath, pdfPath) => {
  const from = (orgPath || '/').split('/').filter(Boolean);
  from.pop(); // nombre del .org
  const to = (pdfPath || '').split('/').filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i += 1;
  const up = from.slice(i).map(() => '..');
  return [...up, ...to.slice(i)].join('/');
};

// Fichero de notas por defecto si el PDF no se abrió desde un .org: «nombre.org» a su lado
// (lo mismo que propone org-noter)
export const defaultNotesPath = (pdfPath) => (pdfPath || '').replace(/\.pdf$/i, '') + '.org';

export const defaultNoteTitle = (page) => `Notas de la página ${page}`;

const quoteLines = (quote) => {
  const q = (quote || '').replace(/\r/g, '').trim();
  if (!q) return [];
  // una línea que empieza por «*» dentro del bloque se escapa con «,» (como hace Org)
  const body = q.split('\n').map((l) => (/^(\*|#\+)/.test(l) ? ',' + l : l));
  return ['#+begin_quote', ...body, '#+end_quote'];
};

/**
 * Añade una nota en `page` a la sesión del PDF (la crea al final si no hay).
 * Las notas se ordenan por página: va antes de la primera nota hija con página mayor.
 * @returns {{ text: string, created: boolean, line: number }} `line` = línea de la nota nueva
 */
export const addNoterNote = (
  text,
  { orgPath, pdfPath, page, title = '', quote = '', body = '', sessionTitle = '' }
) => {
  const src = text || '';
  const lines = src.split('\n');
  // el último elemento vacío = salto de línea final (se conserva)
  const endsWithNewline = src === '' || src.endsWith('\n');
  const contentEnd = endsWithNewline ? lines.length - 1 : lines.length;
  const session = sessionForPdf(src, orgPath, pdfPath);
  const level = session ? session.level + 1 : 2;
  const stars = '*'.repeat(level);
  const note = [
    `${stars} ${(title || '').trim() || defaultNoteTitle(page)}`,
    ':PROPERTIES:',
    `:NOTER_PAGE: ${page}`,
    ':END:',
    ...quoteLines(quote),
    ...((body || '').trim() ? (body || '').trim().split('\n') : []),
  ];
  let insertAt;
  let block;
  if (session) {
    const after = session.notes.find((n) => n.level === level && n.page > page);
    insertAt = after ? after.line : Math.min(session.end, contentEnd);
    block = note;
  } else {
    const name = baseName(pdfPath).replace(/\.pdf$/i, '');
    const rel = relativeDocPath(orgPath, pdfPath);
    block = [
      `* ${(sessionTitle || '').trim() || `Notas: ${name}`}`,
      ':PROPERTIES:',
      `:NOTER_DOCUMENT: ${rel}`,
      ':END:',
      `[[file:${rel}]]`,
      ...note,
    ];
    insertAt = contentEnd;
  }
  // (sin salto final en el original, el bloque va tras un «\n» nuevo y el resto no cambia)
  const result = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)].join('\n');
  return { text: result, created: !session, line: insertAt + (session ? 0 : 5) };
};

// Índice de cabecera (entre todas las del fichero) de la línea `line` del texto
export const headingIndexAtLine = (text, line) =>
  headingsOf(text).findIndex((h) => h.line === line);

// Enlaces a PDF: [[pdf:ruta.pdf::3]] (también «pdf:ruta::3++0.4» de org-pdftools),
// [[file:ruta.pdf::3]] y [[file:ruta.pdf]] → { target, page } (page = null si no la lleva)
export const pdfLinkInfo = (uri) => {
  if (!uri) return null;
  let t = String(uri).trim();
  const isPdfScheme = /^(pdf|pdfview|pdftools):/i.test(t);
  if (isPdfScheme) t = t.replace(/^[a-z]+:/i, '');
  else if (/^file:/i.test(t)) t = t.slice(5);
  else if (!/^(\.{1,2}\/|\/|assets\/)/i.test(t)) return null;
  const m = t.match(/^(.*?)(?:::(.*))?$/);
  const target = (m[1] || '').trim();
  if (!/\.pdf$/i.test(target) || target.startsWith('~')) return null;
  const pm = (m[2] || '').match(/^\s*(\d+)/);
  return { target, page: pm ? parseInt(pm[1], 10) : null };
};

// Para «Abrir el PDF de esta nota»: desde la cabecera `index` del texto, la sesión que la contiene
// (o ella misma) y la página de la nota (o de un antepasado) → { document, page } o null
export const noterTargetAt = (text, index) => {
  const hs = headingsOf(text);
  const h = hs[index];
  if (!h) return null;
  let page = null;
  for (let k = index; k >= 0; k -= 1) {
    const a = hs[k];
    if (k !== index && !(a.line < h.line && a.end > h.line)) continue;
    if (page === null) {
      const pg = parseNoterPage(a.props.NOTER_PAGE);
      if (pg) page = pg.page;
    }
    if (a.props.NOTER_DOCUMENT) return { document: a.props.NOTER_DOCUMENT, page };
  }
  return null;
};
