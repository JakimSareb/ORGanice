// ORG Mode para Eli (3.02): tablas Org «de verdad» (una línea = una fila, como en Emacs).
// organice guarda las tablas a su manera (las líneas entre dos |---| forman una sola fila de
// varias líneas) y al guardar pone un |---| entre cada fila. Aquí se trabaja sobre el TEXTO del
// fichero: se lee la tabla línea a línea, se cambia lo pedido y se vuelve a escribir alineada como
// hace org-table-align. Lo que rodea a la tabla (#+NAME:, #+TBLFM:, otros párrafos) no se toca.

// --- Lectura -------------------------------------------------------------------------------

const isTableLine = (line) => /^\s*\|/.test(line);
const isSepLine = (line) => /^\s*\|-/.test(line);

// Celdas de una línea «| a | b |» → ['a', 'b'] (sin espacios de relleno)
export const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
};

// Líneas de una tabla → { indent, rows: [{ sep: true } | { cells: [...] }] }
export const parseTableLines = (lines) => {
  const first = lines.find((l) => l.trim()) || '';
  const indent = (first.match(/^\s*/) || [''])[0];
  const rows = lines.map((l) => (isSepLine(l) ? { sep: true } : { cells: splitRow(l) }));
  return { indent, rows };
};

export const columnCount = (table) =>
  Math.max(1, ...table.rows.filter((r) => !r.sep).map((r) => r.cells.length));

// Bloques de tabla de primer nivel de un texto de notas, con la MISMA lógica que parseRawText
// (parse_org): las líneas que van dentro de un elemento de lista no cuentan. Devuelve
// [{ start, end }] (índices de línea, end incluido), en el mismo orden que las partes «table».
const LIST_HEADER_REGEX = /^\s*([-+*]|(\d+(\.|\)))) (.*)/;
export const tableBlocks = (rawText) => {
  const lines = String(rawText || '').split('\n');
  const out = [];
  let listLevel = null;
  let cur = null;
  lines.forEach((line, i) => {
    const lead = line.match(/^( *)/)[0].length;
    let isTable = false;
    if (listLevel !== null && (lead > listLevel || !line.trim())) {
      // contenido de un elemento de lista
    } else {
      listLevel = null;
      if (line.match(LIST_HEADER_REGEX)) listLevel = lead;
      else if (line.trim().startsWith('|')) isTable = true;
    }
    if (isTable) {
      if (cur && cur.end === i - 1) cur.end = i;
      else {
        cur = { start: i, end: i };
        out.push(cur);
      }
    } else {
      cur = null;
    }
  });
  return out;
};

export const tableLinesAt = (rawText, blockIndex) => {
  const b = tableBlocks(rawText)[blockIndex];
  if (!b) return null;
  return String(rawText || '')
    .split('\n')
    .slice(b.start, b.end + 1);
};

export const replaceTableAt = (rawText, blockIndex, newLines) => {
  const b = tableBlocks(rawText)[blockIndex];
  if (!b) return rawText;
  const lines = String(rawText || '').split('\n');
  lines.splice(b.start, b.end - b.start + 1, ...newLines);
  return lines.join('\n');
};

// --- Escritura (org-table-align) -------------------------------------------------------------

// Anchura de un texto como la cuenta Emacs (cada carácter, 1; los combinados no suman)
const width = (s) => Array.from(String(s || '').normalize('NFC')).length;
// org-table-number-regexp (valor por defecto de Emacs)
const NUMBER_RE = /^(?:[<>]?[-+^.0-9]*[0-9][-+^.0-9eEdDx()%]*|[<>]?[-+]?0[xX][0-9a-fA-F.]+|[<>]?[-+]?[0-9]+#[0-9a-zA-Z.]+|nan|[-+u]?inf)$/;
const isNumber = (s) => !!s && NUMBER_RE.test(s.trim());

// Columnas de números (como org-table-number-fraction = 0.5): la columna ENTERA se alinea a la
// derecha (también su cabecera), como hace Emacs. La cabecera (lo que hay encima de la primera
// línea |---|) no cuenta para decidirlo.
const numericColumns = (table, ncols) => {
  const out = [];
  const firstSep = table.rows.findIndex((r) => r.sep);
  const skipUntil =
    firstSep > 0 && table.rows.slice(firstSep + 1).some((r) => !r.sep) ? firstSep : 0;
  for (let c = 0; c < ncols; c++) {
    let filled = 0;
    let nums = 0;
    table.rows.forEach((r, i) => {
      if (r.sep || i < skipUntil) return;
      const v = r.cells[c];
      if (v) {
        filled++;
        if (isNumber(v)) nums++;
      }
    });
    out.push(filled > 0 && nums / filled > 0.5);
  }
  return out;
};

export const formatTable = (table) => {
  const ncols = columnCount(table);
  const widths = [];
  for (let c = 0; c < ncols; c++) {
    widths.push(
      Math.max(1, ...table.rows.filter((r) => !r.sep).map((r) => width(r.cells[c] || '')))
    );
  }
  const right = numericColumns(table, ncols);
  const pad = (s, w, alignRight) => {
    const gap = ' '.repeat(Math.max(0, w - width(s)));
    return alignRight ? gap + s : s + gap;
  };
  return table.rows.map((r) => {
    if (r.sep) return `${table.indent}|${widths.map((w) => '-'.repeat(w + 2)).join('+')}|`;
    const cells = widths.map((w, c) => {
      const v = r.cells[c] || '';
      return ` ${pad(v, w, right[c])} `;
    });
    return `${table.indent}|${cells.join('|')}|`;
  });
};

// --- Cambios (devuelven una tabla nueva) -----------------------------------------------------

const clone = (t) => ({
  indent: t.indent,
  rows: t.rows.map((r) => (r.sep ? { sep: true } : { cells: [...r.cells] })),
});

// «|» separa columnas en Org: dentro de una celda rompería la tabla
export const cleanCell = (v) =>
  String(v || '')
    .replace(/[|\r\n]/g, '¦')
    .trim();

export const setCell = (t, r, c, value) => {
  const n = clone(t);
  if (!n.rows[r] || n.rows[r].sep) return n;
  while (n.rows[r].cells.length <= c) n.rows[r].cells.push('');
  n.rows[r].cells[c] = cleanCell(value);
  return n;
};

export const insertRow = (t, r, below = true) => {
  const n = clone(t);
  const cols = columnCount(t);
  n.rows.splice(below ? r + 1 : r, 0, { cells: Array(cols).fill('') });
  return n;
};

export const deleteRow = (t, r) => {
  const n = clone(t);
  if (n.rows.filter((x) => !x.sep).length <= 1 && !n.rows[r].sep) return n;
  n.rows.splice(r, 1);
  return n;
};

export const insertColumn = (t, c, right = true) => {
  const n = clone(t);
  const at = right ? c + 1 : c;
  n.rows.forEach((row) => {
    if (row.sep) return;
    while (row.cells.length < at) row.cells.push('');
    row.cells.splice(at, 0, '');
  });
  return n;
};

export const deleteColumn = (t, c) => {
  const n = clone(t);
  if (columnCount(t) <= 1) return n;
  n.rows.forEach((row) => {
    if (!row.sep) row.cells.splice(c, 1);
  });
  return n;
};

// Mueve la fila r una posición (dir -1 arriba, +1 abajo), saltando las líneas |---|.
// Devuelve { table, row } con la nueva posición (o la misma si no se puede).
export const moveRow = (t, r, dir) => {
  let to = r + dir;
  while (t.rows[to] && t.rows[to].sep) to += dir;
  if (!t.rows[to] || t.rows[r].sep) return { table: t, row: r };
  const n = clone(t);
  const tmp = n.rows[r];
  n.rows[r] = n.rows[to];
  n.rows[to] = tmp;
  return { table: n, row: to };
};

export const moveColumn = (t, c, dir) => {
  const to = c + dir;
  const cols = columnCount(t);
  if (to < 0 || to >= cols) return { table: t, col: c };
  const n = clone(t);
  n.rows.forEach((row) => {
    if (row.sep) return;
    while (row.cells.length < cols) row.cells.push('');
    const tmp = row.cells[c];
    row.cells[c] = row.cells[to];
    row.cells[to] = tmp;
  });
  return { table: n, col: to };
};

// Fila de datos siguiente/anterior (saltando |---|); null si no hay
export const nextDataRow = (t, r, dir) => {
  let i = r + dir;
  while (t.rows[i] && t.rows[i].sep) i += dir;
  return t.rows[i] ? i : null;
};

export const isAligned = (lines) => {
  const t = parseTableLines(lines);
  const f = formatTable(t);
  return f.length === lines.length && f.every((l, i) => l === lines[i]);
};
