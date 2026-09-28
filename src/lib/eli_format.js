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
  let n = 0;
  const out = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const { indent, rest } = stripMarker(line);
    if (kind === 'none' || allSame) return indent + rest;
    n += 1;
    const marker =
      kind === 'num' ? `${n}. ` : (LIST_MARKERS.find((m) => m.id === kind) || {}).marker;
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
  const prefix = `\n${m[1]}${marker}${m[3]}${m[4] ? '[ ] ' : ''}`;
  const v = text.slice(0, pos) + prefix + text.slice(pos);
  return { value: v, pos: pos + prefix.length };
};
