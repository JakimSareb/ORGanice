// ORG Mode para Eli: herramientas del editor de texto plano (SCHEDULED, DEADLINE, narrow).
// Funciones puras sobre el texto del fichero para poder probarlas sin la interfaz.

const HEADING = /^(\*+)\s/;

// Encabezado que contiene la posición `pos` (el último que empieza en o antes de esa línea).
// Devuelve { start, lineEnd, level, index } (index = nº de encabezados anteriores) o null.
export const headingAt = (text, pos) => {
  let offset = 0;
  let index = -1;
  let found = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (offset > pos) break;
    const m = HEADING.exec(line);
    if (m) {
      index++;
      found = { start: offset, lineEnd: offset + line.length, level: m[1].length, index };
    }
    offset += line.length + 1;
  }
  return found;
};

// Fin (posición) del subárbol que empieza en `start` con nivel `level`
export const subtreeEnd = (text, start, level) => {
  let offset = text.indexOf('\n', start);
  if (offset < 0) return text.length;
  offset += 1;
  while (offset < text.length) {
    const next = text.indexOf('\n', offset);
    const line = text.slice(offset, next < 0 ? text.length : next);
    const m = HEADING.exec(line);
    if (m && m[1].length <= level) return offset;
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return text.length;
};

const PLANNING_LINE = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;

// Pone (o cambia) SCHEDULED/DEADLINE en el encabezado donde está el cursor, como hace Emacs:
// en la línea de planificación justo debajo del título. Devuelve { text, cursor } o null si el
// cursor no está dentro de ningún encabezado.
export const setPlanning = (text, pos, type, stamp, { indent = false } = {}) => {
  const h = headingAt(text, pos);
  if (!h) return null;
  const nextStart = h.lineEnd + 1;
  const nextEnd = text.indexOf('\n', nextStart);
  const nextLine =
    nextStart <= text.length ? text.slice(nextStart, nextEnd < 0 ? text.length : nextEnd) : '';
  const entry = `${type}: ${stamp}`;
  if (h.lineEnd < text.length && PLANNING_LINE.test(nextLine)) {
    const re = new RegExp(`${type}:\\s*<[^>]*>`);
    const updated = re.test(nextLine)
      ? nextLine.replace(re, entry)
      : // Orden de Emacs: DEADLINE antes que SCHEDULED; CLOSED al principio
      type === 'DEADLINE'
      ? nextLine.replace(/^(\s*(?:CLOSED:\s*\[[^\]]*\]\s*)?)/, `$1${entry} `)
      : `${nextLine.replace(/\s+$/, '')} ${entry}`;
    const out = text.slice(0, nextStart) + updated + text.slice(nextStart + nextLine.length);
    return { text: out, cursor: nextStart + updated.length };
  }
  const line = (indent ? ' '.repeat(h.level + 1) : '') + entry;
  const out = text.slice(0, h.lineEnd) + '\n' + line + text.slice(h.lineEnd);
  return { text: out, cursor: h.lineEnd + 1 + line.length };
};

// Datos para enfocar (narrow) el encabezado donde está el cursor, dentro del texto completo.
// Devuelve { before, text, after, level, index, title, cursor } o null.
export const narrowAt = (full, pos) => {
  const h = headingAt(full, pos);
  if (!h) return null;
  const end = subtreeEnd(full, h.start, h.level);
  let text = full.slice(h.start, end);
  let after = full.slice(end);
  if (text && !text.endsWith('\n')) {
    text += '\n';
    if (after.startsWith('\n')) after = after.slice(1);
  }
  const title = full
    .slice(h.start, h.lineEnd)
    .replace(HEADING, '')
    .replace(/\s+:[\w@#%:]+:\s*$/, '')
    .trim();
  return {
    before: full.slice(0, h.start),
    text,
    after,
    level: h.level,
    index: h.index,
    title,
    cursor: Math.min(pos - h.start, text.length),
  };
};
