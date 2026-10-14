import { parseRawText } from './parse_org';
import {
  nestedTableIds,
  nestedTableLinesAt,
  replaceNestedTableAt,
  tableBlocks,
  parseTableLines,
  formatTable,
} from './eli_org_table';

const RAW = [
  'Intro',
  '- 10:16-21',
  '  Texto de la primera línea',
  '  segunda línea con “comillas” y acentós',
  '  |---+---+---|',
  '  | Figura | Cómo mostró Jehová su aprobación | Textos clave |',
  '  |---+---+---|',
  '  | Moisés | algo | Núm 16 |',
  '  | Jesús | otro | Mt 3:17 |',
  '- otro elemento',
  '',
  '| a | b |',
].join('\n');

describe('tablas dentro de listas (3.06)', () => {
  test('se encuentran y se reemplazan sin tocar lo demás', () => {
    const parts = parseRawText(RAW);
    const ids = nestedTableIds(parts);
    expect(ids.length).toBe(1);
    expect(tableBlocks(RAW).length).toBe(1);
    const lines = nestedTableLinesAt(RAW, 0);
    expect(lines.length).toBe(5);
    expect(lines[1]).toContain('Figura');
    const t = parseTableLines(lines);
    expect(t.indent).toBe('  ');
    const out = replaceNestedTableAt(RAW, 0, formatTable(t));
    const outLines = out.split('\n');
    expect(outLines[1]).toBe('- 10:16-21');
    expect(outLines[5]).toMatch(/^ {2}\| Figura +\| Cómo/);
    expect(outLines[9]).toBe('- otro elemento');
    expect(outLines[11]).toBe('| a | b |');
  });
});
