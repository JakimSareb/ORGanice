// 4.28: selección múltiple de cabeceras (modelo puro + reductor con ELI_BATCH = un deshacer)
import { Map, List } from 'immutable';
import { createStore } from 'redux';
import undoable, { includeAction, ActionTypes } from 'redux-undo';
import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';
import rootOrgReducer from '../reducers/org';
import {
  multiActions,
  batchOf,
  topIds,
  orderedIds,
  rangeIds,
  toggleId,
  parseTagEdit,
} from './eli_multi_select';
import { matchesBinding } from './eli_hotkeys';

const TEXT = ['* P', '** A', '*** A1', '** B', '** C', '* Q :x:', ''].join('\n');
const stateFor = (text = TEXT) =>
  Map({ path: '/x.org', files: Map({ '/x.org': parseOrg(text) }), fileSettings: List() });
const headersOf = (s) => s.getIn(['files', '/x.org', 'headers']);
const out = (s) =>
  exportOrg({ headers: headersOf(s), linesBeforeHeadings: List(), dontIndent: true });
const idOf = (s, title) =>
  headersOf(s)
    .find((h) => h.getIn(['titleLine', 'rawTitle']).trim() === title)
    .get('id');
const run = (s, titles, op, args) => {
  const ids = titles.map((t) => idOf(s, t));
  const action = batchOf(multiActions(headersOf(s), ids, op, args));
  return action ? rootOrgReducer(s, action) : s;
};

test('rango, alternar y solo las de arriba', () => {
  expect(rangeIds(['1', '2', '3', '4'], '3', '1')).toEqual(['1', '2', '3']);
  expect(rangeIds(['1', '2', '3'], null, '2')).toEqual(['2']);
  expect(toggleId(['1', '2'], 2)).toEqual(['1']);
  expect(toggleId(['1'], 3)).toEqual(['1', '3']);
  const s = stateFor();
  const h = headersOf(s);
  const ids = ['A1', 'A', 'B'].map((t) => idOf(s, t));
  expect(orderedIds(h, ids)).toEqual(['A', 'A1', 'B'].map((t) => idOf(s, t)));
  expect(topIds(h, ids)).toEqual(['A', 'B'].map((t) => idOf(s, t)));
});

test('indentar y desindentar varias (con subárbol) en un solo paso', () => {
  let s = run(stateFor(), ['B', 'C'], 'indent');
  expect(out(s)).toBe('* P\n** A\n*** A1\n*** B\n*** C\n* Q :x:\n');
  s = run(s, ['B', 'C'], 'outdent');
  expect(out(s)).toBe(TEXT);
  // la primera hermana no puede entrar (ni la que va pegada detrás)
  expect(out(run(stateFor(), ['A', 'B'], 'indent'))).toBe(TEXT);
});

test('subir y bajar varias', () => {
  expect(out(run(stateFor(), ['B', 'C'], 'up'))).toBe('* P\n** B\n** C\n** A\n*** A1\n* Q :x:\n');
  expect(out(run(stateFor(), ['A', 'B'], 'down'))).toBe('* P\n** C\n** A\n*** A1\n** B\n* Q :x:\n');
  // ya arriba del todo: no se mueve nada
  expect(out(run(stateFor(), ['A', 'B'], 'up'))).toBe(TEXT);
});

test('estado, etiquetas, prioridad, fecha y borrar', () => {
  let s = stateFor();
  const id = {};
  ['A', 'A1', 'B', 'C', 'Q'].forEach((t) => (id[t] = idOf(s, t)));
  const go = (titles, op, args) => {
    const action = batchOf(
      multiActions(
        headersOf(s),
        titles.map((t) => id[t]),
        op,
        args
      )
    );
    if (action) s = rootOrgReducer(s, action);
  };
  go(['A', 'Q'], 'todo', { keyword: 'NEXT' });
  expect(out(s)).toMatch(/\*\* NEXT A\n/);
  expect(out(s)).toMatch(/\* NEXT Q +:x:\n/);
  go(['A', 'Q'], 'tags', parseTagEdit('casa -x'));
  expect(out(s)).toMatch(/\*\* NEXT A +:casa:\n/);
  expect(out(s)).toMatch(/\* NEXT Q +:casa:\n/);
  go(['A', 'B'], 'priority');
  expect(out(s)).toMatch(/\*\* NEXT \[#A\] A/);
  expect(out(s)).toMatch(/\*\* \[#A\] B/);
  go(['A', 'B'], 'priority');
  expect(out(s)).not.toMatch(/\[#A\]/);
  go(['B', 'C'], 'plan', { type: 'SCHEDULED', date: new Date(2026, 10, 3) });
  expect(out(s).match(/SCHEDULED: <2026-11-03/g)).toHaveLength(2);
  go(['B'], 'plan', { type: 'SCHEDULED', date: new Date(2026, 10, 9) });
  expect(out(s)).toMatch(/SCHEDULED: <2026-11-09/);
  go(['A', 'A1', 'C'], 'remove');
  expect(out(s)).not.toMatch(/A1|\*\* NEXT A|\*\* C/);
  expect(out(s)).toMatch(/\*\* B/);
});

test('etiquetas escritas: añadir y quitar', () => {
  expect(parseTagEdit('#casa trabajo, -viejo')).toEqual({
    add: ['casa', 'trabajo'],
    remove: ['viejo'],
  });
});

test('un solo deshacer para toda la acción', () => {
  const reducer = undoable(rootOrgReducer, { filter: includeAction(['ELI_BATCH']) });
  const s0 = stateFor();
  const store = createStore(reducer, s0);
  const ids = ['B', 'C'].map((t) => idOf(s0, t));
  store.dispatch(batchOf(multiActions(headersOf(s0), ids, 'indent')));
  expect(out(store.getState().present)).not.toBe(TEXT);
  store.dispatch({ type: ActionTypes.UNDO });
  expect(out(store.getState().present)).toBe(TEXT);
});

test('atajo #: también con Alt (Mac en español)', () => {
  expect(matchesBinding({ key: '#', shiftKey: true }, '#')).toBe(true);
  expect(matchesBinding({ key: '#', altKey: true, code: 'Digit3' }, '#')).toBe(true);
  expect(matchesBinding({ key: '#', metaKey: true }, '#')).toBe(false);
});
