// ORG Mode para Eli (4.47): procesos del Zettelkasten. Modelo puro (sin Redux ni DOM):
//   - Fugaces de `ZK/inbox.org`: leerlas una a una y quitar la procesada.
//   - Información de cada nota de la carpeta ZK (tipo, ID, título, enlaces) → Revisión ZK
//     (huérfanas, permanentes sin índice, fugaces viejas, fichas con puntos sin procesar).
//   - Ficha de fuente: filas de «Puntos destacados» sin «Nota ZK», texto entero de una cita larga,
//     celda «Nota ZK» al crear la permanente y lista «Notas permanentes creadas».
//   - Asistente de nota permanente: texto de la nota, enlaces sugeridos y enlace en el índice.
//   - Biblioteca: datos de cada ficha, filtros y orden.
import { parsePreamble, parseAliases, findMention } from './eli_roam';
import { splitRow, alignOrgTable } from './eli_org_table';
import { POINTS_HEADING, oneLine, sectionRange, trimmedEnd } from './eli_zk';

export const CREATED_HEADING = 'Notas permanentes creadas';
export const OLD_FUGAZ_DAYS = 7;

const DAY_MS = 86400000;
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const baseName = (path) =>
  String(path || '')
    .split('/')
    .pop()
    .replace(/\.org$/i, '')
    .replace(/^\d{14}-/, '');

// Descripción de un enlace: una línea y sin corchetes (romperían el enlace)
export const linkDesc = (s) => oneLine(s).replace(/[[\]]/g, '');
export const idLink = (id, title) => `[[id:${id}][${linkDesc(title) || id}]]`;

// «[2026-10-27 Tue 23:50]», «<2026-10-27>» o «2026-10-27» → Date (o null)
export const parseOrgDate = (s) => {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+[^\d\s\]>]+)?(?:\s+(\d{1,2}):(\d{2}))?/.exec(
    String(s || '')
  );
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
};

// --- Fugaces -------------------------------------------------------------------------------

/**
 * Entradas de `ZK/inbox.org` (cada `* ` con lo que cuelga) →
 * [{ start, end, title, id, created, createdDate, body, origin }]
 */
export const parseFugaces = (text) => {
  const lines = String(text || '').split('\n');
  const out = [];
  let cur = null;
  const close = (end) => {
    if (!cur) return;
    cur.end = end;
    out.push(cur);
  };
  lines.forEach((l, i) => {
    if (/^\*\s/.test(l)) {
      close(i);
      cur = { start: i, title: l.replace(/^\*\s+/, '').trim(), raw: [] };
    } else if (cur) cur.raw.push(l);
  });
  close(lines.length);
  return out.map((e) => {
    const props = {};
    let rest = e.raw;
    const first = rest.findIndex((l) => l.trim());
    if (first >= 0 && /^\s*:PROPERTIES:\s*$/i.test(rest[first])) {
      const endAt = rest.findIndex((l, i) => i > first && /^\s*:END:\s*$/i.test(l));
      if (endAt > 0) {
        rest.slice(first + 1, endAt).forEach((l) => {
          const m = /^\s*:([^\s:]+):\s*(.*)$/.exec(l);
          if (m) props[m[1].toUpperCase()] = m[2].trim();
        });
        rest = rest.slice(endAt + 1);
      }
    }
    let origin = '';
    const bodyLines = rest.filter((l) => {
      const m = /^\s*Origen:\s*(.+)$/.exec(l);
      if (m && !origin) {
        origin = m[1].trim();
        return false;
      }
      return true;
    });
    const body = bodyLines.join('\n').replace(/^\s*\n+|\s+$/g, '');
    return {
      start: e.start,
      end: e.end,
      title: e.title,
      id: props.ID || '',
      created: props.CREATED || '',
      createdDate: parseOrgDate(props.CREATED),
      body,
      origin,
    };
  });
};

// Texto del inbox sin esa fugaz (por :ID:; si no tiene, por título y posición)
export const removeFugaz = (text, entry) => {
  const list = parseFugaces(text);
  const hit =
    (entry.id && list.find((e) => e.id === entry.id)) ||
    list.find((e) => e.start === entry.start && e.title === entry.title) ||
    list.find((e) => e.title === entry.title);
  if (!hit) return null;
  const lines = String(text || '').split('\n');
  lines.splice(hit.start, hit.end - hit.start);
  let out = lines.join('\n').replace(/\n{3,}$/, '\n');
  if (out && !out.endsWith('\n')) out += '\n';
  return out;
};

// Fugaces de más de `days` días (por :CREATED:)
export const oldFugaces = (entries, now = new Date(), days = OLD_FUGAZ_DAYS) =>
  (entries || []).filter((e) => e.createdDate && +now - +e.createdDate > days * DAY_MS);

// Texto de la fugaz para una nota o una tarea (título + cuerpo)
export const fugazText = (e) => [e.title, e.body].filter((s) => s && s.trim()).join('\n');

// --- Notas de la carpeta ZK ----------------------------------------------------------------

// Palabras clave del preámbulo (#+AUTOR:, #+VALORACIÓN:…) → { CLAVE: valor } (la primera)
const keywordsOf = (lines) => {
  const out = {};
  lines.forEach((l) => {
    const m = /^\s*#\+([^:\s]+):[ \t]*(.*)$/.exec(l);
    if (!m) return;
    const k = m[1].toUpperCase();
    if (!(k in out)) out[k] = m[2].trim();
  });
  return out;
};

const ID_PROP_RE = /^\s*:ID:\s+(\S+)\s*$/gim;
const ID_LINK_RE = /\[\[id:\s*([^\]\s]+)\s*\]/gi;

const kindOf = (tags) => {
  if (tags.includes('permanente')) return 'permanente';
  if (tags.includes('literatura')) return 'literatura';
  if (tags.includes('indice') || tags.includes('índice')) return 'indice';
  if (tags.includes('fugaz')) return 'fugaz';
  return 'otra';
};

/**
 * Nota de la carpeta ZK → { path, id, title, aliases, kind, tags, keywords, ownIds, outIds }
 * ownIds: todos sus :ID: (fichero y cabeceras); outIds: [[id:…]] a otras notas.
 */
export const zkNoteInfo = (path, text) => {
  const s = String(text || '');
  const lines = s.split('\n');
  const firstHead = lines.findIndex((l) => /^\*+\s/.test(l));
  const pre = firstHead < 0 ? lines : lines.slice(0, firstHead);
  const p = parsePreamble(pre);
  const tags = p.filetags.map((t) => t.toLowerCase());
  const ownIds = new Set();
  let m;
  ID_PROP_RE.lastIndex = 0;
  while ((m = ID_PROP_RE.exec(s))) ownIds.add(m[1].toLowerCase());
  const outIds = new Set();
  ID_LINK_RE.lastIndex = 0;
  while ((m = ID_LINK_RE.exec(s))) {
    const id = m[1].toLowerCase();
    if (!ownIds.has(id)) outIds.add(id);
  }
  return {
    path,
    id: (p.props.ID || '').trim(),
    title: p.title || baseName(path),
    aliases: parseAliases(p.props.ROAM_ALIASES),
    kind: kindOf(tags),
    tags,
    keywords: keywordsOf(pre),
    ownIds: Array.from(ownIds),
    outIds: Array.from(outIds),
  };
};

/**
 * Revisión ZK sobre las notas (sin el inbox) →
 * { orphans, withoutIndex, incoming: Map(ruta → nº de notas que enlazan) }
 * Huérfana = nota sin enlaces entrantes ni salientes (los índices también cuentan).
 * Sin índice = permanente a la que no enlaza ningún índice.
 */
export const zkAnalyze = (notes) => {
  const list = (notes || []).filter((n) => n.kind !== 'fugaz');
  const owner = new Map(); // id → ruta
  list.forEach((n) => n.ownIds.forEach((id) => owner.set(id, n.path)));
  const incoming = new Map();
  const fromIndex = new Set();
  list.forEach((n) => {
    const targets = new Set(n.outIds.map((id) => owner.get(id)).filter(Boolean));
    targets.forEach((path) => {
      if (path === n.path) return;
      incoming.set(path, (incoming.get(path) || 0) + 1);
      if (n.kind === 'indice') fromIndex.add(path);
    });
  });
  return {
    incoming,
    orphans: list.filter((n) => !n.outIds.length && !incoming.get(n.path)),
    withoutIndex: list.filter((n) => n.kind === 'permanente' && !fromIndex.has(n.path)),
  };
};

// Nota al azar (otra distinta de `exceptPath` si hay más de una)
export const randomNote = (notes, exceptPath = null, rnd = Math.random) => {
  const pool = (notes || []).filter((n) => n.kind !== 'fugaz');
  const others = pool.length > 1 ? pool.filter((n) => n.path !== exceptPath) : pool;
  if (!others.length) return null;
  return others[Math.min(others.length - 1, Math.floor(rnd() * others.length))];
};

// --- Ficha de fuente: «Puntos destacados» --------------------------------------------------

const isTableLine = (l) => /^\s*\|/.test(l);
const isSepLine = (l) => /^\s*\|-/.test(l);

// Rango { first, last } de la tabla de «Puntos destacados» (o null)
const pointsTableRange = (lines) => {
  const sec = sectionRange(lines, POINTS_HEADING);
  if (!sec) return null;
  let first = -1;
  let last = -1;
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (isTableLine(lines[i])) {
      if (first < 0) first = i;
      last = i;
    } else if (first >= 0) break;
  }
  return first < 0 ? null : { first, last };
};

/**
 * Filas de datos de «Puntos destacados» → [{ line, cells, where, section, text, type, note }]
 * (sin la cabecera: la primera fila si va seguida de |---|).
 */
export const pointRows = (fileText) => {
  const lines = String(fileText || '').split('\n');
  const r = pointsTableRange(lines);
  if (!r) return [];
  const out = [];
  let headerDone = false;
  for (let i = r.first; i <= r.last; i++) {
    if (isSepLine(lines[i])) {
      headerDone = true;
      continue;
    }
    if (!headerDone && i + 1 <= r.last && isSepLine(lines[i + 1])) continue;
    const cells = splitRow(lines[i]);
    out.push({
      line: i,
      cells,
      where: cells[0] || '',
      section: cells[1] || '',
      text: cells[2] || '',
      type: cells[3] || '',
      note: cells[4] || '',
    });
  }
  return out;
};

export const unprocessedPoints = (fileText) =>
  pointRows(fileText).filter((r) => !r.note.trim() && r.text.trim());

// ¿Es esta fila (celdas tal como salen de la tabla) un punto sin procesar?
export const isUnprocessedRow = (cells) =>
  !!cells && !!String(cells[2] || '').trim() && !String(cells[4] || '').trim();

const unescapeCell = (s) => String(s || '').replace(/\\vert\{\}/g, '|');

// Texto entero del punto: la cita larga de «Citas» (si la celda lleva [[id:…][↓]]) o la celda
export const pointFullText = (fileText, row) => {
  const cell = String((row && row.text) || '');
  const m = /\[\[id:\s*([^\]\s]+)\s*\]\[↓\]\]/.exec(cell);
  if (m) {
    const lines = String(fileText || '').split('\n');
    const re = new RegExp(`^\\s*:ID:\\s+${escapeRe(m[1])}\\s*$`, 'i');
    const at = lines.findIndex((l) => re.test(l));
    if (at >= 0) {
      let i = at + 1;
      while (i < lines.length && !/^\s*:END:\s*$/i.test(lines[i])) i++;
      const body = [];
      for (i += 1; i < lines.length && !/^\*+\s/.test(lines[i]); i++) body.push(lines[i]);
      const t = body.join('\n').trim();
      if (t) return t;
    }
  }
  return unescapeCell(cell.replace(/\s*\[\[id:[^\]]+\]\[↓\]\]/, '')).trim();
};

const sameCells = (a, b) =>
  [0, 1, 2, 3].every((i) => String(a[i] || '').trim() === String(b[i] || '').trim());

/**
 * Pone `link` en «Nota ZK» de la primera fila sin procesar con esas celdas (Dónde, Sección,
 * Punto, Tipo) y realinea la tabla → texto nuevo (o null si no está la fila).
 */
export const setPointNote = (fileText, cells, link) => {
  const lines = String(fileText || '').split('\n');
  const r = pointsTableRange(lines);
  if (!r) return null;
  const row = pointRows(fileText).find((x) => !x.note.trim() && sameCells(x.cells, cells || []));
  if (!row) return null;
  const next = row.cells.slice();
  while (next.length < 5) next.push('');
  next[4] = String(link || '').replace(/\|/g, '\\vert{}');
  lines[row.line] = `| ${next.join(' | ')} |`;
  const table = lines.slice(r.first, r.last + 1);
  lines.splice(r.first, r.last - r.first + 1, ...alignOrgTable(table));
  return lines.join('\n');
};

// Añade «- texto» al final de la sección `heading` (nivel 1; se crea al final si falta)
export const appendToSection = (fileText, heading, item) => {
  const lines = String(fileText || '').split('\n');
  let sec = sectionRange(lines, heading);
  if (!sec) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push(`* ${heading}`, '');
    sec = sectionRange(lines, heading);
  }
  const at = trimmedEnd(lines, sec);
  lines.splice(at, 0, item);
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
};

// --- Asistente de nota permanente ----------------------------------------------------------

// Una línea que empieza por «*» sería una cabecera: se le pone un espacio delante
export const safeBody = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => (/^\*/.test(l) ? ` ${l}` : l.trimEnd()))
    .join('\n')
    .trim();

/**
 * «Añadir a nota existente»: el párrafo va al final de `* Idea` (permanente) o, si no la hay, al
 * final del fichero, separado por una línea en blanco.
 */
export const appendParagraph = (fileText, paragraph, heading = 'Idea') => {
  const para = safeBody(paragraph);
  if (!para) return String(fileText || '');
  const lines = String(fileText || '').split('\n');
  const sec = sectionRange(lines, heading);
  if (sec) {
    const at = trimmedEnd(lines, sec);
    const add = at > sec.start + 1 ? ['', ...para.split('\n')] : para.split('\n');
    lines.splice(at, 0, ...add);
    let out = lines.join('\n');
    if (!out.endsWith('\n')) out += '\n';
    return out;
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return `${lines.join('\n')}${lines.length ? '\n\n' : ''}${para}\n`;
};

/**
 * Texto de la permanente del asistente.
 * n: { id, title, idea, links: [{ id, title }], source: línea de «* Fuente» (con enlace) }
 */
export const permanentNoteText = (n) => {
  const links = (n.links || []).map((l) => `- ${idLink(l.id, l.title)}`);
  return [
    ':PROPERTIES:',
    `:ID:       ${n.id}`,
    ':END:',
    `#+title: ${oneLine(n.title)}`,
    '#+filetags: :permanente:',
    '',
    '* Idea',
    safeBody(n.idea),
    '',
    '* Enlaces',
    ...links,
    '',
    '* Fuente',
    ...(n.source ? [n.source] : []),
    '',
  ].join('\n');
};

// Línea de «* Fuente»: la ficha (con Dónde) o el origen (fugaz, cabecera)
export const sourceLine = ({ card = null, where = '', origin = '' } = {}) => {
  if (card && card.id) {
    const w = oneLine(where);
    return `- ${idLink(card.id, card.title)}${w ? ` — ${w}` : ''}`;
  }
  return origin ? `- ${oneLine(origin)}` : '';
};

/**
 * Notas que el texto menciona por su título o alias (sin enlazar) → enlaces sugeridos.
 * nodes: [{ id, title, aliases }]; except: IDs que no se sugieren.
 */
export const suggestLinks = (text, nodes, except = [], max = 12) => {
  const skip = new Set((except || []).map((x) => String(x).toLowerCase()));
  const out = [];
  (nodes || []).forEach((n) => {
    if (out.length >= max || !n.id || skip.has(n.id.toLowerCase())) return;
    if (findMention(text, [n.title, ...(n.aliases || [])])) out.push(n);
  });
  return out;
};

// --- Biblioteca ----------------------------------------------------------------------------

export const SOURCE_TYPE_IDS = ['libro', 'articulo', 'video'];

// Ficha de fuente → { path, id, title, author, type, state, rating, start, end, pending }
export const sourceCardInfo = (path, text, info = null) => {
  const n = info || zkNoteInfo(path, text);
  const k = n.keywords || {};
  return {
    path,
    id: n.id,
    title: n.title,
    author: k.AUTOR || '',
    type:
      n.tags.find((t) => SOURCE_TYPE_IDS.includes(t)) ||
      (n.tags.includes('artículo') ? 'articulo' : n.tags.includes('vídeo') ? 'video' : ''),
    state: k.ESTADO || '',
    rating: k['VALORACIÓN'] || k.VALORACION || '',
    start: k.INICIO || '',
    end: k.FIN || '',
    pending: unprocessedPoints(text).length,
  };
};

/**
 * Fichas filtradas por tipo y estado, ordenadas por fecha de fin (las más recientes primero; sin
 * fecha, al final) y título.
 */
export const libraryList = (cards, { type = '', state = '' } = {}) => {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  return (cards || [])
    .filter((c) => !type || c.type === type)
    .filter((c) => !state || norm(c.state) === norm(state))
    .map((c) => ({ c, d: parseOrgDate(c.end) }))
    .sort((a, b) => {
      if (a.d && b.d && +a.d !== +b.d) return +b.d - +a.d;
      if (!!a.d !== !!b.d) return a.d ? -1 : 1;
      return String(a.c.title).localeCompare(String(b.c.title), 'es');
    })
    .map((x) => x.c);
};
