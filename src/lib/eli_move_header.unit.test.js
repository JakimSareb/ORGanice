import { Map, List } from 'immutable';
import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';
import rootOrgReducer from '../reducers/org';

const text = ['* A', '** A1', '* B', '** B1', ''].join('\n');
const stateFor = () =>
  Map({ path: '/x.org', files: Map({ '/x.org': parseOrg(text) }), fileSettings: List() });
const out = (s) =>
  exportOrg({
    headers: s.getIn(['files', '/x.org', 'headers']),
    linesBeforeHeadings: List(),
    dontIndent: true,
  });
const idOf = (s, title) =>
  s
    .getIn(['files', '/x.org', 'headers'])
    .find((h) => h.getIn(['titleLine', 'rawTitle']).trim() === title)
    .get('id');

test('subir/bajar solo la línea del encabezado', () => {
  let s = stateFor();
  s = rootOrgReducer(s, {
    type: 'ELI_MOVE_HEADER_LINE',
    headerId: idOf(s, 'B'),
    direction: 'up',
    dirtying: true,
  });
  expect(out(s)).toBe('* A\n* B\n** A1\n** B1\n');
  s = rootOrgReducer(s, {
    type: 'ELI_MOVE_HEADER_LINE',
    headerId: idOf(s, 'B'),
    direction: 'down',
    dirtying: true,
  });
  expect(out(s)).toBe(text);
  // en los extremos no hace nada
  const s2 = rootOrgReducer(stateFor(), {
    type: 'ELI_MOVE_HEADER_LINE',
    headerId: idOf(stateFor(), 'A'),
    direction: 'up',
  });
  expect(out(s2)).toBe(text);
});

test('bajar de nivel solo el encabezado (sin sus subencabezados)', () => {
  let s = stateFor();
  s = rootOrgReducer(s, { type: 'MOVE_HEADER_RIGHT', headerId: idOf(s, 'B'), dirtying: true });
  expect(out(s)).toBe('* A\n** A1\n** B\n** B1\n');
  s = rootOrgReducer(s, { type: 'MOVE_HEADER_LEFT', headerId: idOf(s, 'B'), dirtying: true });
  expect(out(s)).toBe(text);
});
