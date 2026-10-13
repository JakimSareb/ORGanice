import {
  parseTableLines,
  formatTable,
  tableBlocks,
  tableLinesAt,
  replaceTableAt,
  setCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  moveRow,
  moveColumn,
  isAligned,
} from './eli_org_table';

const fmt = (lines) => formatTable(parseTableLines(lines));

describe('eli_org_table (3.02)', () => {
  test('alinea como org-table-align (números a la derecha, separadores)', () => {
    expect(fmt(['|Nombre|Veces|', '|-', '|Ana|3|', '|Bartolomé|12|'])).toEqual([
      '| Nombre    | Veces |',
      '|-----------+-------|',
      '| Ana       |     3 |',
      '| Bartolomé |    12 |',
    ]);
  });

  test('igual que Emacs: la columna entera a la derecha; la cabecera no cuenta', () => {
    // salida de org-table-align (Emacs 29) para estas mismas tablas
    expect(
      fmt(['| Nombre | Veces |', '|-', '| Bartolomé | 7 |', '| Luis | 12 |', '| | Eva |'])
    ).toEqual([
      '| Nombre    | Veces |',
      '|-----------+-------|',
      '| Bartolomé |     7 |',
      '| Luis      |    12 |',
      '|           |   Eva |',
    ]);
    expect(fmt(['| x | 1 |', '| y | 2 |', '| z | a |', '| w | b |'])).toEqual([
      '| x | 1 |',
      '| y | 2 |',
      '| z | a |',
      '| w | b |',
    ]);
    expect(fmt(['| Fecha | n |', '|-', '| 2026-09-10 | 3 |', '| 2026-10-01 | 10 |'])).toEqual([
      '|      Fecha |  n |',
      '|------------+----|',
      '| 2026-09-10 |  3 |',
      '| 2026-10-01 | 10 |',
    ]);
    expect(fmt(['| h | v |', '|-', '| a | 1.5 |', '| b | |', '| c | -2 |'])).toEqual([
      '| h |   v |',
      '|---+-----|',
      '| a | 1.5 |',
      '| b |     |',
      '| c |  -2 |',
    ]);
  });

  test('una tabla ya alineada no cambia', () => {
    const t = ['| a | 1 |', '|---+---|', '| b | 2 |'];
    expect(isAligned(t)).toBe(true);
    expect(fmt(t)).toEqual(t);
  });

  test('conserva la sangría', () => {
    expect(fmt(['  | x |y|'])).toEqual(['  | x | y |']);
  });

  test('bloques de tabla: #+NAME y #+TBLFM quedan fuera y se conservan', () => {
    const raw = [
      'Texto',
      '#+NAME: Publicadores',
      '| a | b |',
      '|---+---|',
      '| 1 | 2 |',
      '#+TBLFM: $2=$1',
      '',
      '| z |',
    ].join('\n');
    expect(tableBlocks(raw)).toEqual([
      { start: 2, end: 4 },
      { start: 7, end: 7 },
    ]);
    const lines = tableLinesAt(raw, 0);
    const t = setCell(parseTableLines(lines), 2, 0, 'cien');
    const out = replaceTableAt(raw, 0, formatTable(t));
    expect(out.split('\n')).toEqual([
      'Texto',
      '#+NAME: Publicadores',
      '| a    | b |',
      '|------+---|',
      '| cien | 2 |',
      '#+TBLFM: $2=$1',
      '',
      '| z |',
    ]);
  });

  test('una tabla dentro de un elemento de lista no cuenta (como parseRawText)', () => {
    const raw = ['- uno', '  | a |', '', '| b |'].join('\n');
    expect(tableBlocks(raw)).toEqual([{ start: 3, end: 3 }]);
  });

  test('filas y columnas: añadir, borrar, mover (saltando |---|)', () => {
    let t = parseTableLines(['| h1 | h2 |', '|---+---|', '| a | b |', '| c | d |']);
    t = insertRow(t, 2);
    expect(t.rows[3].cells).toEqual(['', '']);
    t = deleteRow(t, 3);
    const m = moveRow(t, 2, -1);
    expect(m.row).toBe(0);
    expect(formatTable(m.table)[0]).toBe('| a  | b  |');
    t = insertColumn(t, 0);
    expect(t.rows[0].cells).toEqual(['h1', '', 'h2']);
    t = deleteColumn(t, 1);
    expect(t.rows[0].cells).toEqual(['h1', 'h2']);
    const mc = moveColumn(t, 0, 1);
    expect(mc.col).toBe(1);
    expect(mc.table.rows[2].cells).toEqual(['b', 'a']);
  });

  test('una «|» dentro de una celda no rompe la tabla', () => {
    const t = setCell(parseTableLines(['| a |']), 0, 0, 'x|y');
    expect(formatTable(t)).toEqual(['| x¦y |']);
  });
});
