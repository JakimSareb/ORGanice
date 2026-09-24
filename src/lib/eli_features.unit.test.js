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

test('filtros: solo etiquetas con @ presentes en tareas abiertas; editor con las declaradas', () => {
  const f = parseOrg(
    [
      '#+TODO: TODO NEXT | DONE',
      '#+TAGS: { casa(c) recados(r) } ordenador llamadas \\n leer @oficina @nunca',
      '* TODO barrer :casa:recados:@calle:',
      '* TODO otra :@casa:proyectoX:',
      '* DONE hecha :@viejo:',
      '* Nota sin tarea :@nota:',
      '',
    ].join('\n')
  );
  const files = Map({ '/a.org': f });
  // Solo @ presentes en tareas abiertas: ni las sin @, ni las declaradas sin usar, ni DONE/notas
  expect(availableFacets(files, List(), List()).contexts).toEqual(['@calle', '@casa']);
  expect(
    allTagsForEditor(f.get('headers'), f.get('fileConfigLines').toJS())
  ).toEqual([
    'casa',
    'recados',
    'ordenador',
    'llamadas',
    'leer',
    '@oficina',
    '@nunca',
    '@calle',
    '@casa',
    '@nota',
    '@viejo',
    'proyectoX',
  ]);
});

describe('editor de texto plano: SCHEDULED, DEADLINE y narrow', () => {
  const { setPlanning, narrowAt, headingAt } = require('./eli_raw_tools');
  const text = '#+TITLE: x\n* TODO uno\nhola\n** sub\ntexto\n* dos\nfin\n';

  test('SCHEDULED nuevo debajo del título del encabezado del cursor', () => {
    const pos = text.indexOf('hola') + 2;
    const r = setPlanning(text, pos, 'SCHEDULED', '<2026-09-24 Thu>');
    expect(r.text).toBe(
      '#+TITLE: x\n* TODO uno\nSCHEDULED: <2026-09-24 Thu>\nhola\n** sub\ntexto\n* dos\nfin\n'
    );
    const r2 = setPlanning(r.text, r.cursor, 'DEADLINE', '<2026-10-01 Thu>');
    expect(r2.text).toContain('\nDEADLINE: <2026-10-01 Thu> SCHEDULED: <2026-09-24 Thu>\nhola');
    const r3 = setPlanning(r2.text, r2.cursor, 'SCHEDULED', '<2026-09-30 Wed>');
    expect(r3.text).toContain('\nDEADLINE: <2026-10-01 Thu> SCHEDULED: <2026-09-30 Wed>\nhola');
  });

  test('con sangría y sin encabezado', () => {
    const r = setPlanning(text, text.indexOf('texto'), 'DEADLINE', '<2026-09-24 Thu>', {
      indent: true,
    });
    expect(r.text).toContain('** sub\n   DEADLINE: <2026-09-24 Thu>\ntexto');
    expect(setPlanning(text, 3, 'SCHEDULED', '<x>')).toBeNull();
  });

  test('narrow del encabezado donde está el cursor', () => {
    const n = narrowAt(text, text.indexOf('hola'));
    expect(n.text).toBe('* TODO uno\nhola\n** sub\ntexto\n');
    expect(n.before).toBe('#+TITLE: x\n');
    expect(n.after).toBe('* dos\nfin\n');
    expect(n.index).toBe(0);
    expect(n.level).toBe(1);
    expect(n.title).toBe('TODO uno');
    expect(n.before + n.text + n.after).toBe(text);
    const n2 = narrowAt(text, text.indexOf('texto'));
    expect(n2.text).toBe('** sub\ntexto\n');
    expect(n2.index).toBe(1);
    expect(headingAt(text, text.indexOf('fin')).index).toBe(2);
  });
});

describe('adjuntos: renombrar antes de subir', () => {
  const { renamedFile, splitExt } = require('../components/EliTools');
  test('conserva la extensión real y limpia caracteres no válidos', () => {
    expect(splitExt('foto.final.jpg')).toEqual(['foto.final', '.jpg']);
    expect(splitExt('LEEME')).toEqual(['LEEME', '']);
    const f = new File(['x'], 'pegado-2026.jpg', { type: 'image/jpeg' });
    expect(renamedFile(f, 'recibo luz / sept').name).toBe('recibo luz  sept.jpg');
    expect(renamedFile(f, '   ')).toBe(f);
  });
});

describe('nombre de la app y del fichero', () => {
  const { fileDisplayName, windowTitleFor } = require('./eli_app_name');
  test('sin carpeta ni extensiones', () => {
    expect(fileDisplayName('/GTD/tareas.org')).toBe('tareas');
    expect(fileDisplayName('/GTD/secreto.org.gpg')).toBe('secreto');
    expect(fileDisplayName('/x/diario.org_archive')).toBe('diario.org_archive');
    expect(windowTitleFor('/a/b.org')).toBe('b · ORGanice');
    expect(windowTitleFor(null)).toBe('ORGanice');
  });
});

describe('agenda: modo Log', () => {
  const { closedItemsForDay } = require('./eli_agenda_log');
  const { parseOrg } = require('./parse_org');
  const { Map: IMap } = require('immutable');
  test('las terminadas aparecen en el día de su CLOSED:', () => {
    const file = parseOrg(
      '* DONE comprar pan\nCLOSED: [2026-09-23 Wed 18:05]\n* DONE llamar\nCLOSED: [2026-09-23 Wed 09:10]\n* DONE otra\nCLOSED: [2026-09-22 Tue]\n* TODO pendiente\n'
    );
    const files = IMap({ '/a.org': file });
    const items = closedItemsForDay(
      files,
      new Date(2026, 8, 23, 0, 0),
      new Date(2026, 8, 23, 23, 59, 59)
    );
    expect(items.map((i) => i.header.getIn(['titleLine', 'rawTitle']).trim())).toEqual([
      'llamar',
      'comprar pan',
    ]);
    expect(items[0].hasTime).toBe(true);
    expect(items[0].header.get('path')).toBe('/a.org');
  });
});
