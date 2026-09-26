import { parseOrg } from './parse_org';
import { taskStateOf, clockTotals, formatMillis } from './eli_task_state';

const file = parseOrg(
  [
    '#+TODO: NEXT TODO | DONE CANCELLED',
    '* NEXT Activa',
    ':LOGBOOK:',
    'CLOCK: [2026-09-20 Sun 10:00]--[2026-09-20 Sun 11:30] =>  1:30',
    ':END:',
    '** Sub',
    ':LOGBOOK:',
    'CLOCK: [2026-09-21 Mon 09:00]--[2026-09-21 Mon 09:45] =>  0:45',
    ':END:',
    '* DONE Hecha',
    '* Nota',
    '',
  ].join('\n')
);
const headers = file.get('headers');
const sets = file.get('todoKeywordSets');

test('estado de la casilla', () => {
  expect(taskStateOf(headers.get(0), sets)).toEqual({
    kind: 'active',
    doneKeyword: 'DONE',
    cancelKeyword: 'CANCELLED',
  });
  expect(taskStateOf(headers.get(2), sets).kind).toBe('done');
  expect(taskStateOf(headers.get(3), sets).kind).toBe('none');
  const sinCancel = parseOrg('#+TODO: TODO | DONE\n* TODO x\n');
  expect(taskStateOf(sinCancel.getIn(['headers', 0]), sinCancel.get('todoKeywordSets'))).toEqual({
    kind: 'active',
    doneKeyword: 'DONE',
    cancelKeyword: 'DONE',
  });
});

test('suma del reloj con subencabezados', () => {
  const t = clockTotals(headers, headers.get(0).get('id'));
  expect(formatMillis(t.own)).toBe('1:30');
  expect(formatMillis(t.total)).toBe('2:15');
  expect(t.subheaders).toBe(1);
  expect(t.running).toBe(false);
});

test('al terminar se quita la prioridad y el título sigue siendo Immutable', () => {
  const rootOrgReducer = require('../reducers/org').default;
  const { Map, List: IList } = require('immutable');
  const f = parseOrg('#+TODO: TODO | DONE CANCELLED\n* TODO [#A] Algo *importante*\n');
  const id = f.getIn(['headers', 0, 'id']);
  let s = Map({ path: '/a.org', files: Map({ '/a.org': f }), fileSettings: IList() });
  s = rootOrgReducer(s, {
    type: 'SET_TODO_STATE',
    headerId: id,
    newTodoState: 'CANCELLED',
    dirtying: true,
    timestamp: new Date(),
  });
  const tl = s.getIn(['files', '/a.org', 'headers', 0, 'titleLine']);
  expect(tl.get('rawTitle')).toBe('Algo *importante*');
  expect(IList.isList(tl.get('title'))).toBe(true);
});
