import { parseOrg } from './parse_org';
import { isMatch } from './headline_filter';
import headline_filter_parser from './headline_filter_parser';
import { contextsFromConfigLines, collectContexts, filterHeadersByContexts } from './gtd_contexts';
import AgendaDay from '../components/OrgFile/components/AgendaModal/components/AgendaDay';
import { Map, List } from 'immutable';
import { startOfDay, endOfDay } from 'date-fns';

const file = parseOrg(
  [
    '#+TAGS: @casa(c) @oficina(o) { @llamadas @recados } proyecto',
    '#+tags: @casa @ordenador',
    '* Proyecto X :@oficina:',
    '** TODO Llamar a Ana',
    'hablar del presupuesto',
    '** Notas',
    'el presupuesto está aprobado',
    '* TODO Comprar pan :@recados:',
    'DEADLINE: <2026-09-20 Sun>',
    '* TODO Revisar correo',
    'SCHEDULED: <2026-09-22 Tue>',
    '* DONE Hecha',
    'DEADLINE: <2026-09-01 Tue>',
    '',
  ].join('\n')
);
const headers = file.get('headers');
const search = (q, scope) =>
  headers
    .filter(isMatch(headline_filter_parser.parse(q), scope))
    .map((h) => h.getIn(['titleLine', 'rawTitle']).trim())
    .toJS();

test('ámbito de búsqueda: tareas / encabezados / texto', () => {
  expect(search('presupuesto', 'headers')).toEqual([]);
  expect(search('presupuesto', 'text')).toEqual(['Llamar a Ana', 'Notas']);
  expect(search('presupuesto', 'tasks')).toEqual([]);
  expect(search('', 'tasks')).toEqual([
    'Llamar a Ana',
    'Comprar pan',
    'Revisar correo',
    'Hecha',
  ]);
  expect(search('-DONE', 'tasks')).toEqual(['Llamar a Ana', 'Comprar pan', 'Revisar correo']);
  expect(search('pan', 'headers')).toEqual(['Comprar pan']);
});

test('contextos GTD: solo etiquetas @ de #+TAGS:', () => {
  expect(contextsFromConfigLines(file.get('fileConfigLines').toJS())).toEqual([
    '@casa',
    '@oficina',
    '@llamadas',
    '@recados',
    '@ordenador',
  ]);
  expect(collectContexts(Map({ '/a.org': file }))).toEqual([
    '@casa',
    '@llamadas',
    '@oficina',
    '@ordenador',
    '@recados',
  ]);
});

test('filtro por contexto con herencia de etiquetas', () => {
  const titles = (sel) =>
    filterHeadersByContexts(headers, List(sel))
      .map((h) => h.getIn(['titleLine', 'rawTitle']).trim())
      .toJS();
  expect(titles(['@oficina'])).toEqual(['Proyecto X', 'Llamar a Ana', 'Notas']);
  expect(titles(['@recados', '@oficina']).length).toBe(4);
  expect(titles([]).length).toBe(headers.size);
});

test('agenda: vencidas y días de retraso', () => {
  const day = new Date(2026, 8, 23, 12);
  const overdue = new AgendaDay({}).getOverdueItemsAndHeaders({
    files: Map({ '/a.org': file }),
    dateStart: startOfDay(day),
    dateEnd: endOfDay(day),
  });
  expect(
    overdue.map((o) => [o.header.getIn(['titleLine', 'rawTitle']).trim(), o.daysOverdue])
  ).toEqual([
    ['Comprar pan', 3],
    ['Revisar correo', 1],
  ]);
});
