import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';

// ORG Mode para Eli (3.09): SCHEDULED debajo de :PROPERTIES: se lee como planificación y se
// guarda en su sitio (tras el título)
const roundTrip = (txt) => {
  const st = parseOrg(txt);
  return {
    header: st.get('headers').get(0),
    out: exportOrg({
      headers: st.get('headers'),
      linesBeforeHeadings: st.get('linesBeforeHeadings'),
      dontIndent: true,
    }),
  };
};

describe('planificación debajo del cajón de propiedades', () => {
  test('se reconoce y se recoloca', () => {
    const { header, out } = roundTrip(
      '* TODO Rep\n:PROPERTIES:\n:LAST_REPEAT: [2026-09-01 Tue 10:00]\n:END:\nSCHEDULED: <2027-03-01 Mon ++6m>\nnota\n'
    );
    const p = header.get('planningItems').toJS();
    expect(p.map((x) => x.type)).toEqual(['SCHEDULED']);
    expect(p[0].timestamp.repeaterType).toBe('++');
    expect(out).toBe(
      '* TODO Rep\nSCHEDULED: <2027-03-01 Mon ++6m>\n:PROPERTIES:\n:LAST_REPEAT: [2026-09-01 Tue 10:00]\n:END:\nnota\n'
    );
  });
  test('el orden correcto no cambia', () => {
    const txt =
      '* TODO Rep\nSCHEDULED: <2027-03-01 Mon ++6m>\n:PROPERTIES:\n:LAST_REPEAT: [2026-09-01 Tue 10:00]\n:END:\nnota\n';
    expect(roundTrip(txt).out).toBe(txt);
  });
  test('un SCHEDULED más abajo en las notas sigue siendo texto', () => {
    const { header } = roundTrip(
      '* TODO X\n:PROPERTIES:\n:A: 1\n:END:\nhola\nSCHEDULED: <2027-03-01 Mon>\n'
    );
    expect(
      header
        .get('planningItems')
        .map((x) => x.get('type'))
        .toJS()
    ).not.toContain('SCHEDULED');
  });
});
