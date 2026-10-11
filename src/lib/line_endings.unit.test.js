import { List } from 'immutable';
import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';

const roundTrip = (text) => {
  const f = parseOrg(text);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings') || List(),
    dontIndent: false,
  });
};

describe('2.17: finales de línea (sin ^M)', () => {
  const lf = '#+TODO: TODO NEXT | DONE\n* TODO Uno :casa:\nnotas\n** NEXT Dos\n';

  test('un fichero con LF no cambia', () => {
    expect(roundTrip(lf)).toBe(lf);
  });

  test('un fichero con CRLF se lee y se escribe sin \\r', () => {
    const out = roundTrip(lf.replace(/\n/g, '\r\n'));
    expect(out).not.toMatch(/\r/);
    expect(out).toBe(lf);
  });

  test('un fichero con finales mezclados (LF y CRLF) queda todo en LF', () => {
    const mixed = '#+TODO: TODO NEXT | DONE\r\n* TODO Uno :casa:\nnotas\r\n** NEXT Dos\n';
    const out = roundTrip(mixed);
    expect(out).not.toMatch(/\r/);
    expect(out).toBe(lf);
  });

  test('los títulos y etiquetas no arrastran \\r', () => {
    const f = parseOrg('* TODO Uno :casa:\r\n');
    const h = f.get('headers').get(0);
    expect(h.getIn(['titleLine', 'rawTitle'])).not.toMatch(/\r/);
    expect(h.getIn(['titleLine', 'tags']).toJS()).toEqual(['casa']);
  });
});
