// ORG Mode para Eli: botones de formato de texto con los marcadores estándar de Org Mode
// (*negrita*, /cursiva/, _subrayado_, +tachado+, ~código~, =literal=)

export const ORG_EMPHASIS = [
  { marker: '*', icon: 'fas fa-bold', title: 'Negrita (*texto*)', id: 'bold', key: 'b' },
  { marker: '/', icon: 'fas fa-italic', title: 'Cursiva (/texto/)', id: 'italic', key: 'i' },
  {
    marker: '_',
    icon: 'fas fa-underline',
    title: 'Subrayado (_texto_)',
    id: 'underline',
    key: 'u',
  },
  {
    marker: '+',
    icon: 'fas fa-strikethrough',
    title: 'Tachado (+texto+)',
    id: 'strike',
    key: 'x',
    shift: true,
  },
  { marker: '~', icon: 'fas fa-code', title: 'Código (~texto~)', id: 'code', key: 'e' },
  {
    marker: '=',
    icon: 'fas fa-equals',
    title: 'Literal (=texto=)',
    id: 'verbatim',
    key: 'e',
    shift: true,
  },
];

// ORG Mode para Eli: atajos de teclado del formato (Ctrl en Windows/Linux, ⌘ en el Mac)
export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');

export const emphasisShortcutLabel = (item, mac = isMac()) =>
  `${mac ? '⌘' : 'Ctrl+'}${item.shift ? (mac ? '⇧' : 'Mayús+') : ''}${item.key.toUpperCase()}`;

// ¿Qué formato pide esta tecla? (null si ninguno)
export const emphasisForKeyEvent = (event) => {
  if (!event || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const code = event.code || '';
  const key = /^Key[A-Z]$/.test(code)
    ? code.slice(3).toLowerCase()
    : (event.key || '').toLowerCase();
  return ORG_EMPHASIS.find((e) => e.key === key && !!e.shift === !!event.shiftKey) || null;
};

/**
 * Pone o quita un marcador de énfasis alrededor de la selección [start, end) de `value`.
 * - Sin selección: inserta el par de marcadores y deja el cursor en medio.
 * - Si la selección ya está rodeada por el marcador (por dentro o por fuera), lo quita.
 * - Si no, lo pone en cada línea no vacía de la selección, sin incluir los espacios de los
 *   extremos (Org no reconoce "* texto *").
 * Devuelve { value, start, end } con la nueva selección.
 */
export const toggleOrgEmphasis = (value, start, end, marker) => {
  const text = value || '';
  let s = Math.max(0, Math.min(start == null ? text.length : start, text.length));
  let e = Math.max(s, Math.min(end == null ? s : end, text.length));
  if (s === e) {
    return { value: text.slice(0, s) + marker + marker + text.slice(e), start: s + 1, end: s + 1 };
  }
  const sel = text.slice(s, e);
  // Ya marcado por dentro: *texto* seleccionado entero
  if (sel.length >= 2 && sel.startsWith(marker) && sel.endsWith(marker) && !sel.includes('\n')) {
    const inner = sel.slice(1, -1);
    return { value: text.slice(0, s) + inner + text.slice(e), start: s, end: s + inner.length };
  }
  // Ya marcado por fuera: se seleccionó solo "texto" dentro de *texto*
  if (s > 0 && text[s - 1] === marker && text[e] === marker && !sel.includes('\n')) {
    return {
      value: text.slice(0, s - 1) + sel + text.slice(e + 1),
      start: s - 1,
      end: e - 1,
    };
  }
  const wrapped = sel
    .split('\n')
    .map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line);
      return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : line;
    })
    .join('\n');
  return { value: text.slice(0, s) + wrapped + text.slice(e), start: s, end: s + wrapped.length };
};

// ORG Mode para Eli (2.16): marcadores de lista al principio de línea (botón Aa) y continuar la
// lista al pulsar Intro (notas del editor de la vista GTD).
export const LIST_MARKERS = [
  { id: 'check', marker: '- [ ] ', icon: 'far fa-check-square', title: 'Casilla (- [ ])' },
  { id: 'dash', marker: '- ', icon: 'fas fa-list-ul', title: 'Lista con guion (-)' },
  { id: 'plus', marker: '+ ', icon: 'fas fa-plus', title: 'Lista con más (+)' },
  { id: 'num', marker: '1. ', icon: 'fas fa-list-ol', title: 'Lista numerada (1. 2. 3.)' },
  { id: 'none', marker: '', icon: 'fas fa-eraser', title: 'Quitar el marcador de lista' },
];

// sangría, marcador (-, +, *, 1., 1)), casilla opcional y el resto
const LIST_LINE_RE = /^(\s*)([-+*]|\d+[.)])(\s+)(\[[ xX-]\](?:\s+|$))?(.*)$/;

const kindOfLine = (line) => {
  const m = LIST_LINE_RE.exec(line);
  // «* texto» a la izquierda del todo sería un encabezado de Org, no una lista
  if (!m || (m[2] === '*' && !m[1])) return null;
  if (m[4]) return 'check';
  if (/^\d/.test(m[2])) return 'num';
  return m[2] === '+' ? 'plus' : 'dash';
};

const stripMarker = (line) => {
  const m = LIST_LINE_RE.exec(line);
  if (!m || (m[2] === '*' && !m[1]))
    return { indent: (/^\s*/.exec(line) || [''])[0], rest: line.trimStart() };
  return { indent: m[1], rest: m[5] };
};

/**
 * Pone el marcador `kind` ('check', 'dash', 'plus', 'num' o 'none') en cada línea tocada por la
 * selección [start, end). Si todas ya lo tenían, lo quita. Devuelve { value, start, end }.
 */
export const applyListMarker = (value, start, end, kind) => {
  const text = value || '';
  const s = Math.max(0, Math.min(start == null ? text.length : start, text.length));
  const e = Math.max(s, Math.min(end == null ? s : end, text.length));
  const lineStart = text.lastIndexOf('\n', s - 1) + 1;
  let lineEnd = text.indexOf('\n', e > s && text[e - 1] === '\n' ? e - 1 : e);
  if (lineEnd < 0) lineEnd = text.length;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const touched = lines.filter((l) => l.trim() || lines.length === 1);
  const allSame = kind !== 'none' && touched.length && touched.every((l) => kindOfLine(l) === kind);
  // (3.06) numeración por nivel de sangría (1. 2. 3. en cada nivel; al volver a un nivel
  // menor, los más hondos empiezan de nuevo)
  const counters = {};
  const out = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const { indent, rest } = stripMarker(line);
    if (kind === 'none' || allSame) return indent + rest;
    Object.keys(counters).forEach((k) => {
      if (+k > indent.length) delete counters[k];
    });
    counters[indent.length] = (counters[indent.length] || 0) + 1;
    const marker =
      kind === 'num'
        ? `${counters[indent.length]}. `
        : (LIST_MARKERS.find((m) => m.id === kind) || {}).marker;
    return indent + marker + rest;
  });
  const block = out.join('\n');
  const value2 = text.slice(0, lineStart) + block + text.slice(lineEnd);
  // Con una sola línea, el cursor al final de la línea; con varias, todas seleccionadas
  if (lines.length === 1) {
    const pos = lineStart + block.length;
    return { value: value2, start: pos, end: pos };
  }
  return { value: value2, start: lineStart, end: lineStart + block.length };
};

/**
 * Intro en una línea de lista: la siguiente empieza con el mismo marcador (casilla vacía, número
 * + 1). En un elemento vacío, se quita el marcador (termina la lista). Devuelve
 * { value, pos } o null si la línea no es de lista.
 */
export const continueListOnEnter = (value, pos) => {
  const text = value || '';
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = text.indexOf('\n', pos);
  if (lineEnd < 0) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const m = LIST_LINE_RE.exec(line);
  if (!m || (m[2] === '*' && !m[1])) return null;
  const markerEnd = lineStart + m[1].length + m[2].length + m[3].length + (m[4] || '').length;
  if (pos < markerEnd) return null; // el cursor está antes del texto: Intro normal
  if (!m[5].trim()) {
    // Elemento vacío: se quita el marcador
    const v = text.slice(0, lineStart) + m[1] + text.slice(lineEnd);
    return { value: v, pos: lineStart + m[1].length };
  }
  const num = /^(\d+)([.)])$/.exec(m[2]);
  const marker = num ? `${+num[1] + 1}${num[2]}` : m[2];
  // (4.18) tras el marcador, UN espacio normal (antes se copiaban los que hubiera: varios, un
  // tabulador o el espacio duro del teclado del iPhone, y la lista iba sumando espacios)
  const prefix = `\n${m[1]}${marker} ${m[4] ? '[ ] ' : ''}`;
  const v = text.slice(0, pos) + prefix + text.slice(pos);
  return { value: v, pos: pos + prefix.length };
};

// --- (3.06) Cambiar el tipo de lista (como C-c - en Emacs) y ordenarla (como C-c ^) ----------

const lineAt = (text, pos) => {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  let end = text.indexOf('\n', pos);
  if (end < 0) end = text.length;
  return { start, end };
};
const leadOf = (line) => (/^\s*/.exec(line) || [''])[0].length;
const isItem = (line) => !!kindOfLine(line);

// La lista (bloque de líneas) donde está pos y el nivel del elemento: { lines, first, last, level }
// (índices de línea). Las líneas más sangradas que el nivel van con su elemento.
const listAround = (lines, idx) => {
  // elemento al que pertenece la línea idx
  let item = idx;
  while (item >= 0 && !isItem(lines[item])) {
    if (!lines[item].trim()) return null;
    item--;
  }
  if (item < 0) return null;
  const level = leadOf(lines[item]);
  const belongs = (l) =>
    l.trim() ? leadOf(l) > level || (leadOf(l) === level && isItem(l)) : false;
  let first = item;
  while (first > 0 && belongs(lines[first - 1])) first--;
  // la primera línea del bloque tiene que ser un elemento de ese nivel
  while (first < item && !(leadOf(lines[first]) === level && isItem(lines[first]))) first++;
  let last = item;
  while (last + 1 < lines.length && belongs(lines[last + 1])) last++;
  return { first, last, level };
};

const LIST_CYCLE = ['-', '+', '1.', '1)'];

const renumber = (lines, level) => {
  let n = 0;
  return lines.map((l) => {
    if (leadOf(l) !== level || !isItem(l)) return l;
    const m = LIST_LINE_RE.exec(l);
    const num = /^(\d+)([.)])$/.exec(m[2]);
    if (!num) return l;
    n += 1;
    return m[1] + `${n}${num[2]}` + m[3] + (m[4] || '') + m[5];
  });
};

/** Cambia el marcador de TODA la lista (el nivel del cursor): - → + → 1. → 1) → - */
export const cycleListType = (value, pos) => {
  const text = value || '';
  const lines = text.split('\n');
  const idx = text.slice(0, pos).split('\n').length - 1;
  const block = listAround(lines, idx);
  if (!block) return null;
  const m0 = LIST_LINE_RE.exec(lines[block.first]);
  const cur = /^\d+\.$/.test(m0[2])
    ? '1.'
    : /^\d+\)$/.test(m0[2])
    ? '1)'
    : m0[2] === '+'
    ? '+'
    : '-';
  const next = LIST_CYCLE[(LIST_CYCLE.indexOf(cur) + 1) % LIST_CYCLE.length];
  let part = lines.slice(block.first, block.last + 1).map((l) => {
    if (leadOf(l) !== block.level || !isItem(l)) return l;
    const m = LIST_LINE_RE.exec(l);
    return m[1] + next + m[3] + (m[4] || '') + m[5];
  });
  part = renumber(part, block.level);
  const out = [...lines.slice(0, block.first), ...part, ...lines.slice(block.last + 1)];
  const v = out.join('\n');
  // el cursor se queda en su línea (al final de ella)
  const before = out.slice(0, idx + 1).join('\n').length;
  return { value: v, start: before, end: before };
};

const itemText = (line) => {
  const m = LIST_LINE_RE.exec(line);
  return m ? m[5] : line.trim();
};

/**
 * Ordena los elementos de la lista del cursor (con lo que cuelga de cada uno).
 * mode: 'alpha' (A→Z), 'alpha-desc' (Z→A), 'num' (por el número del principio), 'check'
 * (casillas hechas al final). Las listas numeradas se vuelven a numerar.
 */
export const sortList = (value, pos, mode = 'alpha') => {
  const text = value || '';
  const lines = text.split('\n');
  const idx = text.slice(0, pos).split('\n').length - 1;
  const block = listAround(lines, idx);
  if (!block) return null;
  const items = [];
  for (let i = block.first; i <= block.last; i++) {
    const l = lines[i];
    if (leadOf(l) === block.level && isItem(l)) items.push({ lines: [l], key: i });
    else items[items.length - 1].lines.push(l);
  }
  const coll = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
  const numOf = (t) => {
    const m = /-?\d+(?:[.,]\d+)?/.exec(t);
    return m ? parseFloat(m[0].replace(',', '.')) : Infinity;
  };
  const isDone = (l) => /\[[xX]\]/.test((LIST_LINE_RE.exec(l) || [])[4] || '');
  const sorted = [...items].sort((a, b) => {
    const ta = itemText(a.lines[0]);
    const tb = itemText(b.lines[0]);
    let r = 0;
    if (mode === 'alpha') r = coll(ta, tb);
    else if (mode === 'alpha-desc') r = coll(tb, ta);
    else if (mode === 'num') r = numOf(ta) - numOf(tb);
    else if (mode === 'check') r = (isDone(a.lines[0]) ? 1 : 0) - (isDone(b.lines[0]) ? 1 : 0);
    return r || a.key - b.key;
  });
  // el marcador numérico se reparte por posición (el primero, 1.)
  let part = [].concat(...sorted.map((it) => it.lines));
  part = renumber(part, block.level);
  const out = [...lines.slice(0, block.first), ...part, ...lines.slice(block.last + 1)];
  const v = out.join('\n');
  const start = out.slice(0, block.first).join('\n').length + (block.first ? 1 : 0);
  const end = start + part.join('\n').length;
  return { value: v, start, end };
};

/** Tabla Org vacía (3 columnas × 2 filas, con fila de títulos) para insertar en las notas */
export const emptyOrgTable = (indent = '') =>
  [
    `${indent}|   |   |   |`,
    `${indent}|---+---+---|`,
    `${indent}|   |   |   |`,
    `${indent}|   |   |   |`,
  ].join('\n');

// ORG Mode para Eli (4.09): tabla vacía en líneas propias, después de la línea del cursor (si tiene
// texto). Devuelve { value, ord } (ord = nº de tablas que hay antes, para encontrarla en la vista)
export const insertEmptyTable = (value, cursor) => {
  const v = value || '';
  const s0 = cursor == null ? v.length : Math.max(0, Math.min(cursor, v.length));
  const lineStart = v.lastIndexOf('\n', s0 - 1) + 1;
  const lineText = v.slice(lineStart, s0);
  const indent = /^\s*([-+]|\d+[.)])\s/.test(v.slice(lineStart).split('\n')[0])
    ? ' '.repeat((/^\s*/.exec(lineText) || [''])[0].length + 2)
    : (/^\s*/.exec(lineText) || [''])[0];
  const lineEnd = v.indexOf('\n', s0) < 0 ? v.length : v.indexOf('\n', s0);
  const at = lineText.trim() || v.slice(s0, lineEnd).trim() ? lineEnd : lineStart;
  const pre = at > 0 && v[at - 1] !== '\n' ? '\n' : '';
  const post = at < v.length && v[at] !== '\n' ? '\n' : '';
  const before = v.slice(0, at).split('\n');
  let ord = 0;
  before.forEach((l, i) => {
    if (/^\s*\|/.test(l) && !(i > 0 && /^\s*\|/.test(before[i - 1]))) ord++;
  });
  return { value: v.slice(0, at) + pre + emptyOrgTable(indent) + post + v.slice(at), ord };
};

// ORG Mode para Eli (3.44): inserta `text` en el cursor (sustituye la selección). Si justo antes
// hay una letra (no un espacio ni el principio de la línea), pone un espacio delante.
export const insertAtCursor = (value, start, end, text) => {
  const v = value || '';
  const s = Math.max(0, Math.min(start == null ? v.length : start, v.length));
  const e = Math.max(s, Math.min(end == null ? s : end, v.length));
  const before = v.slice(0, s);
  const ins = before && !/\s$/.test(before) ? ` ${text}` : text;
  return { value: before + ins + v.slice(e), start: s + ins.length, end: s + ins.length };
};
