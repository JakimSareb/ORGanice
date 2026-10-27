// ORG Mode para Eli (4.42): «Citar» (transclusión compatible con org-transclusion).
// Modelo puro (sin Redux ni React):
//   - La línea del fichero es SOLO `#+transclude: [[id:X][Título]] :only-contents :level 2
//     :exclude-elements "drawer keyword"`; el contenido citado no se copia.
//   - `resolveTransclusion(files, spec)` busca el origen (cabecera o nota-fichero por :ID:) y
//     devuelve los bloques de lectura (título + notas de cada cabecera del subárbol).
//   - Ciclos y profundidad máxima (3) se comprueban al pintar (`transclusionGuard`).
import { idHeadingLink } from './eli_id_links';
import { idOf, plainHeadingTitle } from './eli_heading_index';
import { findFileNodeById } from './eli_roam';

// Profundidad máxima de citas dentro de citas (la primera cita es la profundidad 0)
export const MAX_TRANSCLUSION_DEPTH = 3;

export const TRANSCLUDE_RE = /^\s*#\+transclude:\s*(.*?)\s*$/i;

// ¿La línea es un `#+transclude:`?
export const isTranscludeLine = (line) => TRANSCLUDE_RE.test(String(line || '').replace(/\n$/, ''));

/**
 * Lee la línea → { raw, uri, id, desc, onlyContents, level, exclude: [] } o null si no es una
 * línea `#+transclude:`. `id` es null si el enlace no es por ID (no se pueden citar otros).
 */
export const parseTransclude = (line) => {
  const raw = String(line || '').replace(/\n$/, '');
  const m = TRANSCLUDE_RE.exec(raw);
  if (!m) return null;
  const rest = m[1];
  const link = /^\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/.exec(rest);
  const uri = link ? link[1].trim() : '';
  const idMatch = /^id:\s*(.+)$/i.exec(uri);
  const opts = link ? rest.slice(link[0].length) : rest;
  const only = /(?:^|\s):only-contents(?:\s+(nil|t))?(?=\s|$)/i.exec(opts);
  const level = /(?:^|\s):level\s+(\d+)(?=\s|$)/i.exec(opts);
  const excl = /(?:^|\s):exclude-elements\s+"([^"]*)"/i.exec(opts);
  return {
    raw,
    uri,
    id: idMatch ? idMatch[1].trim() : null,
    desc: link && link[2] ? link[2] : '',
    onlyContents: !!only && String(only[1] || '').toLowerCase() !== 'nil',
    level: level ? Math.max(1, Number(level[1])) : null,
    exclude: excl ? excl[1].split(/\s+/).filter(Boolean) : [],
  };
};

/**
 * Línea `#+transclude:` para el origen `orgId` (título limpio de corchetes). `opts` opcionales:
 * { onlyContents, level, exclude: [] }.
 */
export const buildTransclusionLine = (orgId, title, opts = {}) => {
  let line = `#+transclude: ${idHeadingLink(orgId, title)}`;
  if (opts.onlyContents) line += ' :only-contents';
  if (opts.level) line += ` :level ${opts.level}`;
  if (opts.exclude && opts.exclude.length) line += ` :exclude-elements "${opts.exclude.join(' ')}"`;
  return line;
};

/**
 * Inserta `line` (una línea suelta) en `value` entre `start` y `end`: siempre en su propia línea
 * (se añade un salto antes si no se empieza línea y otro después si no se acaba).
 * → { text, caret } (caret = posición tras la línea insertada).
 */
export const lineInsertion = (value, start, end, line) => {
  const v = String(value || '');
  const before = v.slice(0, start);
  const after = v.slice(end);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const tail = after.startsWith('\n') ? '' : '\n';
  return { text: `${lead}${line}${tail}`, caret: start + lead.length + line.length + tail.length };
};

// --- Filtro de elementos (`:exclude-elements`) ---

const DRAWER_START_RE = /^\s*:[A-Za-z0-9_-]+:\s*$/;
const DRAWER_END_RE = /^\s*:END:\s*$/i;
const KEYWORD_RE = /^\s*#\+[A-Za-z_]+:/;

/**
 * Quita de `text` los elementos pedidos: «drawer» (cajones `:X: … :END:`) y «keyword» (líneas
 * `#+clave:`; las `#+begin_…` / `#+end_…` de los bloques no se tocan).
 */
export const filterElements = (text, exclude = []) => {
  const ex = new Set((exclude || []).map((e) => String(e).toLowerCase()));
  if (!ex.size) return String(text || '');
  const out = [];
  let inDrawer = false;
  String(text || '')
    .split('\n')
    .forEach((line) => {
      if (inDrawer) {
        if (DRAWER_END_RE.test(line)) inDrawer = false;
        return;
      }
      if (ex.has('drawer') && DRAWER_START_RE.test(line) && !DRAWER_END_RE.test(line)) {
        inDrawer = true;
        return;
      }
      if (ex.has('keyword') && KEYWORD_RE.test(line)) return;
      out.push(line);
    });
  return out.join('\n');
};

// --- Resolver el origen ---

const PGP = '-----BEGIN PGP MESSAGE-----';

const levelOf = (h) => h.get('nestingLevel') || 1;

// Cabecera de `files` con ese :ID: → { path, headers, index } o null
const findHeaderIndex = (files, id) => {
  const want = String(id || '')
    .trim()
    .toLowerCase();
  if (!want || !files || typeof files.forEach !== 'function') return null;
  let found = null;
  files.forEach((file, path) => {
    if (found || !path || !file || !file.get || !file.get('headers')) return;
    const headers = file.get('headers');
    const index = headers.findIndex((h) => (idOf(h) || '').toLowerCase() === want);
    if (index >= 0) found = { path, headers, index };
  });
  return found;
};

const cleanText = (raw, exclude) => {
  const text = String(raw || '');
  if (text.includes(PGP)) return '[contenido cifrado]';
  return filterElements(text, exclude).replace(/^\n+/, '').replace(/\s+$/, '');
};

const blockOf = (h, displayLevel, withTitle, exclude) => ({
  level: displayLevel,
  headerId: h.get('id'),
  rawTitle: withTitle ? h.getIn(['titleLine', 'rawTitle']) || '' : null,
  keyword: withTitle ? h.getIn(['titleLine', 'todoKeyword']) || null : null,
  text: cleanText(h.get('rawDescription'), exclude),
});

// Texto del preámbulo de un fichero sin cajón :PROPERTIES: ni líneas `#+clave:` (metadatos)
const fileBodyText = (lines) => {
  const arr = !lines
    ? []
    : Array.isArray(lines)
    ? lines
    : typeof lines.toArray === 'function'
    ? lines.toArray()
    : String(lines).split('\n');
  return filterElements(arr.join('\n'), ['drawer', 'keyword']).replace(/^\n+|\s+$/g, '');
};

/**
 * Resuelve la cita → { ok: true, kind: 'heading'|'file', id, title, path, headerId, blocks } o
 * { ok: false, reason: 'unsupported'|'missing', id }.
 *   blocks: [{ level, headerId, rawTitle (null = sin título), keyword, text }] en orden.
 * Sin `:only-contents` la cabecera citada lleva su título; con `:level N` ese título pasa a nivel N
 * (y sus subcabeceras se desplazan igual).
 */
export const resolveTransclusion = (files, spec) => {
  if (!spec || !spec.id) return { ok: false, reason: 'unsupported', id: null };
  const hit = findHeaderIndex(files, spec.id);
  if (hit) {
    const { headers, index, path } = hit;
    const top = headers.get(index);
    const topLevel = levelOf(top);
    const shift = (spec.level || topLevel) - topLevel;
    const blocks = [blockOf(top, topLevel + shift, !spec.onlyContents, spec.exclude)];
    for (let j = index + 1; j < headers.size; j++) {
      const h = headers.get(j);
      if (levelOf(h) <= topLevel) break;
      blocks.push(blockOf(h, levelOf(h) + shift, true, spec.exclude));
    }
    return {
      ok: true,
      kind: 'heading',
      id: spec.id,
      title: plainHeadingTitle(top.getIn(['titleLine', 'rawTitle']) || ''),
      path,
      headerId: top.get('id'),
      blocks,
    };
  }
  const node = findFileNodeById(files, spec.id);
  if (node) {
    const file = files.get(node.path);
    const headers = (file && file.get('headers')) || [];
    const base = spec.level || 1;
    const blocks = [];
    const body = cleanText(fileBodyText(file && file.get('linesBeforeHeadings')), spec.exclude);
    if (body)
      blocks.push({ level: base, headerId: null, rawTitle: null, keyword: null, text: body });
    headers.forEach((h) => blocks.push(blockOf(h, base + levelOf(h) - 1, true, spec.exclude)));
    return {
      ok: true,
      kind: 'file',
      id: spec.id,
      title: node.title,
      path: node.path,
      headerId: null,
      blocks,
    };
  }
  return { ok: false, reason: 'missing', id: spec.id };
};

/**
 * ¿Se puede pintar la cita de `id` en este punto? `chain` = IDs de las citas que ya se están
 * pintando por encima. → null (sí) | 'cycle' | 'depth'.
 */
export const transclusionGuard = (id, chain = []) => {
  const want = String(id || '')
    .trim()
    .toLowerCase();
  if (chain.some((c) => String(c).trim().toLowerCase() === want)) return 'cycle';
  if (chain.length >= MAX_TRANSCLUSION_DEPTH) return 'depth';
  return null;
};
