import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { buildTasks } from './gtd_model';
import {
  clockEntriesOf,
  clockMillis,
  clockSummary,
  isClockRunning,
  taskLinkText,
  toDateTimeInput,
  fromDateTimeInput,
} from './gtd_tools';
import rootOrgReducer from '../../reducers/org';
import { deleteLogEntry } from '../../actions/org';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TEXT =
  HEAD +
  [
    '* NEXT Pintar',
    ':LOGBOOK:',
    'CLOCK: [2026-10-21 Wed 10:00]--[2026-10-21 Wed 11:30] =>  1:30',
    'CLOCK: [2026-10-20 Tue 09:00]--[2026-10-20 Tue 09:20] =>  0:20',
    ':END:',
    '* NEXT Sin tiempo',
    '* NEXT En marcha',
    ':LOGBOOK:',
    'CLOCK: [2026-10-21 Wed 08:00]',
    ':END:',
    '',
  ].join('\n');
const tasks = buildTasks(Map({ '/tasks.org': parseOrg(TEXT) }), []);
const by = (title) => tasks.find((t) => t.title === title);

test('4.11: registros CLOCK de una tarea y su total', () => {
  const entries = clockEntriesOf(by('Pintar').header);
  expect(entries).toHaveLength(2);
  expect(clockMillis(entries)).toBe(110 * 60 * 1000);
  expect(clockSummary(by('Pintar').header)).toBe('⏱ 1:50 · 2 registros');
  expect(clockSummary(by('Sin tiempo').header)).toBe('');
  expect(isClockRunning(by('Pintar').header)).toBe(false);
});

test('4.11: reloj en marcha', () => {
  const header = by('En marcha').header;
  expect(isClockRunning(header)).toBe(true);
  const entries = clockEntriesOf(header);
  expect(entries[0].end).toBeNull();
  const now = new Date(2026, 9, 21, 9, 15);
  expect(clockMillis(entries, now)).toBe(75 * 60 * 1000);
  expect(clockSummary(header, now)).toBe('⏱ 1:15 · 1 registro (reloj en marcha)');
});

test('4.11: enlace propio de la tarea', () => {
  expect(taskLinkText('abc-1', 'Pintar [la] casa')).toBe('[[id:abc-1][Pintar la casa]]');
});

test('4.11: fecha y hora de los campos del reloj', () => {
  const d = new Date(2026, 9, 21, 7, 5);
  expect(toDateTimeInput(d)).toBe('2026-10-21T07:05');
  expect(fromDateTimeInput('2026-10-21T07:05').getTime()).toBe(d.getTime());
  expect(fromDateTimeInput('')).toBeNull();
});

test('4.11: borrar un registro del reloj', () => {
  const parsed = parseOrg(TEXT);
  const state = Map({ path: '/tasks.org', files: Map({ '/tasks.org': parsed }) });
  const header = parsed.get('headers').find((h) => h.getIn(['titleLine', 'rawTitle']) === 'Pintar');
  const entry = header.get('logBookEntries').first();
  const next = rootOrgReducer(state, deleteLogEntry(header.get('id'), entry.get('id')));
  const after = next
    .getIn(['files', '/tasks.org', 'headers'])
    .find((h) => h.get('id') === header.get('id'));
  expect(after.get('logBookEntries').size).toBe(1);
  // el reloj en marcha, al borrarlo, baja el contador
  const running = parsed
    .get('headers')
    .find((h) => h.getIn(['titleLine', 'rawTitle']) === 'En marcha');
  const before = parsed.get('activeClocks');
  const next2 = rootOrgReducer(
    state,
    deleteLogEntry(running.get('id'), running.get('logBookEntries').first().get('id'))
  );
  expect(next2.getIn(['files', '/tasks.org', 'activeClocks'])).toBe(before - 1);
});
