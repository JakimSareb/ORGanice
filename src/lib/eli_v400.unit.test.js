import { Map, List } from 'immutable';
import { parseOrg } from './parse_org';
import rootOrgReducer from '../reducers/org';
import { insertTableText } from '../components/OrgFile/components/EliEditSheet';

const text = ['* A', '** A1', '* B', ''].join('\n');
const stateFor = () =>
  Map({ path: '/x.org', files: Map({ '/x.org': parseOrg(text) }), fileSettings: List() });
const headersOf = (s) => s.getIn(['files', '/x.org', 'headers']);
const idOf = (s, title) =>
  headersOf(s)
    .find((h) => h.getIn(['titleLine', 'rawTitle']).trim() === title)
    .get('id');

test('(4.0) Nueva › Subcabecera: hija al final de las suyas, madre abierta y la nueva seleccionada', () => {
  let s = stateFor();
  const a = idOf(s, 'A');
  s = rootOrgReducer(s, { type: 'ELI_ADD_SUBHEADER', headerId: a, dirtying: false });
  const hs = headersOf(s);
  expect(hs.size).toBe(4);
  expect(hs.map((h) => h.get('nestingLevel')).toArray()).toEqual([1, 2, 2, 1]);
  expect(hs.get(2).getIn(['titleLine', 'rawTitle'])).toBe('');
  expect(hs.get(2).getIn(['titleLine', 'todoKeyword'])).toBeFalsy();
  expect(hs.get(0).get('opened')).toBe(true);
  expect(s.getIn(['files', '/x.org', 'selectedHeaderId'])).toBe(hs.get(2).get('id'));
});

test('(4.0) hoja Editar: la tabla va en líneas propias, con el cursor en la primera celda', () => {
  const r = insertTableText('uno\ndos', 2);
  expect(r.value.startsWith('uno\n|   |   |   |')).toBe(true);
  expect(r.value.endsWith('\ndos')).toBe(true);
  expect(r.value.slice(r.cursor - 2, r.cursor)).toBe('| ');
  const e = insertTableText('', 0);
  expect(e.value.split('\n')[1]).toBe('|---+---+---|');
});
