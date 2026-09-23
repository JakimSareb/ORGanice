import { parseOrg } from './parse_org';
import { isMatch } from './headline_filter';
import headline_filter_parser from './headline_filter_parser';
import {
  contextsFromConfigLines,
  collectContexts,
  filterHeadersByContexts,
  availableFacets,
  allTagsForEditor,
} from './gtd_contexts';
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
  // Varios contextos: deben cumplirse todos
  expect(titles(['@recados', '@oficina']).length).toBe(0);
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

test('filtros facetados: solo lo presente y contextos combinados con Y', () => {
  const f = parseOrg(
    [
      '#+TODO: TODO NEXT WAITING | DONE',
      '#+TAGS: @casa @recados @ordenador @oficina',
      '* TODO barrer la casa :@casa:@recados:@ordenador:',
      '* TODO comprar pan :@recados:',
      '* NEXT llamar :@casa:',
      '* WAITING factura',
      '',
    ].join('\n')
  );
  const files = Map({ '/a.org': f });
  const t = (sel) =>
    filterHeadersByContexts(f.get('headers'), List(sel))
      .map((h) => h.getIn(['titleLine', 'rawTitle']).trim())
      .toJS();
  expect(t(['@casa', '@recados'])).toEqual(['barrer la casa']);
  // Sin filtros: no aparece @oficina (declarado pero sin uso) ni MAYBE/PROJECT
  expect(availableFacets(files, List(), List())).toEqual({
    contexts: ['@casa', '@ordenador', '@recados'],
    todos: ['TODO', 'NEXT', 'WAITING'],
  });
  // Filtrando por TODO: contextos presentes en las TODO
  expect(availableFacets(files, List(), List(['TODO'])).contexts).toEqual([
    '@casa',
    '@ordenador',
    '@recados',
  ]);
  // Con @recados: solo contextos que conviven con @recados, y estados de esas tareas
  expect(availableFacets(files, List(['@recados']), List())).toEqual({
    contexts: ['@casa', '@ordenador', '@recados'],
    todos: ['TODO'],
  });
  // Con NEXT: solo @casa
  expect(availableFacets(files, List(), List(['NEXT'])).contexts).toEqual(['@casa']);
});

test('contextos sin @ y etiquetas declaradas en el editor', () => {
  const f = parseOrg(
    [
      '#+TODO: TODO | DONE',
      '#+TAGS: { casa(c) recados(r) } ordenador llamadas \\n leer',
      '* TODO barrer :casa:recados:',
      '* TODO otra :casa:proyectoX:',
      '',
    ].join('\n')
  );
  const files = Map({ '/a.org': f });
  // sin @ en #+TAGS: todas las declaradas son contextos; solo se muestran las presentes
  expect(availableFacets(files, List(), List()).contexts).toEqual(['casa', 'recados']);
  expect(
    filterHeadersByContexts(f.get('headers'), List(['casa', 'recados']))
      .map((h) => h.getIn(['titleLine', 'rawTitle']).trim())
      .toJS()
  ).toEqual(['barrer']);
  // "@casa" declarado equivale a la etiqueta "casa"
  const g = parseOrg('#+TAGS: @casa @recados\n* TODO x :casa:\n');
  expect(availableFacets(Map({ '/b.org': g }), List(), List()).contexts).toEqual(['@casa']);
  expect(
    allTagsForEditor(f.get('headers'), f.get('fileConfigLines').toJS())
  ).toEqual(['casa', 'recados', 'ordenador', 'llamadas', 'leer', 'proyectoX']);
});
