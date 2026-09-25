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
  expect(search('', 'tasks')).toEqual(['Llamar a Ana', 'Comprar pan', 'Revisar correo', 'Hecha']);
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
  expect(allTagsForEditor(f.get('headers'), f.get('fileConfigLines').toJS())).toEqual([
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
    expect(windowTitleFor('/a/b.org')).toBe('ORGanice');
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

describe('atajos de organice fuera de sus ventanas', () => {
  const { shouldIgnoreOrganiceHotkey } = require('./eli_hotkeys');
  afterEach(() => (document.body.innerHTML = ''));
  test('Retroceso en el editor de texto plano o en el diálogo de adjuntos no borra encabezados', () => {
    document.body.innerHTML =
      '<div class="org-file-container" id="c"><textarea id="own"></textarea></div>' +
      '<div class="eli-prompt__overlay"><input id="name" type="text"></div>';
    const c = document.getElementById('c');
    expect(shouldIgnoreOrganiceHotkey({ target: document.getElementById('name') }, c)).toBe(true);
    expect(shouldIgnoreOrganiceHotkey({ target: c }, c)).toBe(true); // ventana abierta
    document.querySelector('.eli-prompt__overlay').remove();
    expect(shouldIgnoreOrganiceHotkey({ target: c }, c)).toBe(false);
    expect(shouldIgnoreOrganiceHotkey({ target: document.getElementById('own') }, c)).toBe(false);
    document.body.insertAdjacentHTML('beforeend', '<input id="out" type="search">');
    expect(shouldIgnoreOrganiceHotkey({ target: document.getElementById('out') }, c)).toBe(true);
  });
});

describe('búsqueda en el texto con contexto', () => {
  const { searchTerms, snippetsFor } = require('./eli_search_snippets');
  const parser = require('./headline_filter_parser');
  test('fragmentos con el término y su contexto', () => {
    const terms = searchTerms(parser.parse('factura -DONE'));
    expect(terms.map((t) => t.text)).toEqual(['factura']);
    const desc =
      'Primera línea sin nada\nHay que pagar la Factura de la luz antes del viernes porque si no nos cortan el suministro eléctrico\notra factura más\n';
    const sn = snippetsFor(desc, terms);
    expect(sn).toHaveLength(2);
    expect(sn[0].match).toBe('Factura');
    expect(sn[0].before).toBe('Hay que pagar la ');
    expect(sn[0].after.endsWith('…')).toBe(true);
    expect(sn[1].occurrence).toBe(1);
    expect(snippetsFor('', terms)).toEqual([]);
  });
});

describe('refile al nivel superior de un fichero', () => {
  const { refileSubtreeToFileTop } = require('../reducers/org');
  const { parseOrg } = require('./parse_org');
  const { exportOrg } = require('./export_org');
  const { fromJS } = require('immutable');
  const out = (file) =>
    exportOrg({ headers: file.get('headers'), linesBeforeHeadings: file.get('linesBeforeHeadings'), dontIndent: true });
  test('a otro fichero, al final y en nivel 1 con sus hijos', () => {
    const a = parseOrg('* Proyectos\n** TODO mover [1/2]\n*** hijo\n** otro\n');
    const b = parseOrg('#+TITLE: B\n* Existente\n');
    let state = fromJS({ files: {} }).setIn(['files', '/a.org'], a).setIn(['files', '/b.org'], b);
    const id = a.get('headers').get(1).get('id');
    state = refileSubtreeToFileTop(state, { sourcePath: '/a.org', sourceHeaderId: id, targetPath: '/b.org' });
    expect(out(state.getIn(['files', '/a.org']))).toBe('* Proyectos\n** otro\n');
    expect(out(state.getIn(['files', '/b.org']))).toBe('#+TITLE: B\n* Existente\n* TODO mover [1/2]\n** hijo\n');
  });
  test('dentro del mismo fichero', () => {
    const a = parseOrg('* Uno\n** Dos\n* Tres\n');
    let state = fromJS({ files: {} }).setIn(['files', '/a.org'], a);
    const id = a.get('headers').get(1).get('id');
    state = refileSubtreeToFileTop(state, { sourcePath: '/a.org', sourceHeaderId: id, targetPath: '/a.org' });
    expect(out(state.getIn(['files', '/a.org']))).toBe('* Uno\n* Tres\n* Dos\n');
  });
});

describe('enlaces Org', () => {
  const { formatOrgLink } = require('./eli_links');
  test('formato [[enlace][descripción]]', () => {
    expect(formatOrgLink('https://orgmode.org', 'Org Mode')).toBe('[[https://orgmode.org][Org Mode]]');
    expect(formatOrgLink(' https://a.b ', '')).toBe('[[https://a.b]]');
    expect(formatOrgLink('', 'x')).toBe('');
  });
});

describe('captura rápida', () => {
  const core = require('../capture/capture_core');
  const tpl = {
    description: 'INBOX',
    letter: 'i',
    template: '\n:Created: %U\n:Source: Organice2000\n',
    shouldPrepend: true,
    headerPaths: [],
    file: '/inbox.org',
  };
  test('parámetros, plantilla y encabezado', () => {
    const p = core.parseCaptureParams('?k=abc&t=inbox&url=https%3A%2F%2Fa.b%2Fx&title=Hola%20mundo');
    expect(p).toMatchObject({ appKey: 'abc', template: 'inbox', url: 'https://a.b/x', title: 'Hola mundo' });
    expect(core.findTemplate([tpl], 'inbox')).toBe(tpl);
    expect(core.findTemplate([tpl], 'i')).toBe(tpl);
    expect(core.defaultHeadline(p)).toBe('[[https://a.b/x][Hola mundo]]');
    const e = core.buildEntry({ template: tpl, headline: '[[u][t]]', note: 'algo' });
    expect(e.title).toBe('[[u][t]]');
    expect(e.bodyLines[0]).toMatch(/^:Created: \[\d{4}-\d\d-\d\d \w{3} \d\d:\d\d\]$/);
    expect(e.bodyLines).toContain('algo');
  });
  test('insertar al principio (tras la cabecera), al final y bajo un encabezado', () => {
    const entry = { title: 'Nuevo', bodyLines: ['cuerpo'] };
    const file = '#+TITLE: Inbox\n\n* Uno\n* Dos\n';
    expect(core.insertEntry(file, entry, { shouldPrepend: true })).toBe(
      '#+TITLE: Inbox\n\n* Nuevo\ncuerpo\n* Uno\n* Dos\n'
    );
    expect(core.insertEntry(file, entry, { shouldPrepend: false })).toBe(
      '#+TITLE: Inbox\n\n* Uno\n* Dos\nNuevo'.replace('Nuevo', '* Nuevo\ncuerpo\n')
    );
    const tree = '#+TODO: TODO NEXT | DONE\n* NEXT Proyectos :x:\n** a\n* Otros\n';
    expect(core.insertEntry(tree, entry, { headerPaths: ['Proyectos'], shouldPrepend: false })).toBe(
      '#+TODO: TODO NEXT | DONE\n* NEXT Proyectos :x:\n** a\n** Nuevo\ncuerpo\n* Otros\n'
    );
    expect(core.insertEntry(tree, entry, { headerPaths: ['Proyectos'], shouldPrepend: true })).toBe(
      '#+TODO: TODO NEXT | DONE\n* NEXT Proyectos :x:\n** Nuevo\ncuerpo\n** a\n* Otros\n'
    );
    expect(() => core.insertEntry(tree, entry, { headerPaths: ['Nada'] })).toThrow(/Nada/);
    expect(core.insertEntry('', entry, {})).toBe('* Nuevo\ncuerpo\n');
  });
});

describe('CLOSED al terminar una tarea', () => {
  const { updateClosedTimestamp } = require('../reducers/org');
  const { parseOrg } = require('./parse_org');
  const { exportOrg } = require('./export_org');
  test('se añade al pasar a DONE/CANCELLED y se quita al reabrir', () => {
    let file = parseOrg('#+TODO: TODO NEXT | DONE CANCELLED\n* TODO tarea\nSCHEDULED: <2026-09-24 Thu>\n');
    const t = new Date(2026, 8, 24, 13, 5);
    file = file.setIn(['headers', 0, 'titleLine', 'todoKeyword'], 'DONE');
    file = updateClosedTimestamp(file, 0, 'TODO', 'DONE', t);
    const out = (f) => exportOrg({ headers: f.get('headers'), linesBeforeHeadings: f.get('linesBeforeHeadings'), dontIndent: true });
    expect(out(file)).toContain('* DONE tarea\nCLOSED: [2026-09-24 Thu 13:05] SCHEDULED: <2026-09-24 Thu>');
    // DONE -> CANCELLED: se mantiene
    expect(updateClosedTimestamp(file, 0, 'DONE', 'CANCELLED', t)).toBe(file);
    file = file.setIn(['headers', 0, 'titleLine', 'todoKeyword'], 'TODO');
    file = updateClosedTimestamp(file, 0, 'DONE', 'TODO', t);
    expect(out(file)).toContain('* TODO tarea\nSCHEDULED: <2026-09-24 Thu>');
    expect(out(file)).not.toContain('CLOSED');
  });
});

describe('atajos: comparación de teclas', () => {
  const { matchesBinding } = require('./eli_hotkeys');
  const ev = (o) => ({ ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...o });
  test('letras, flechas, modificadores y Alt del Mac', () => {
    expect(matchesBinding(ev({ key: 'd', code: 'KeyD' }), 'd')).toBe(true);
    expect(matchesBinding(ev({ key: 'D', code: 'KeyD', shiftKey: true }), 'd')).toBe(false);
    expect(matchesBinding(ev({ key: '†', code: 'KeyT', altKey: true }), 'alt+t')).toBe(true);
    expect(matchesBinding(ev({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, shiftKey: true }), 'alt+shift+left')).toBe(true);
    expect(matchesBinding(ev({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true }), 'ctrl+up')).toBe(true);
    expect(matchesBinding(ev({ key: 'ArrowUp', code: 'ArrowUp' }), 'ctrl+up')).toBe(false);
    expect(matchesBinding(ev({ key: 'Backspace', code: 'Backspace', ctrlKey: true }), 'ctrl+backspace')).toBe(true);
    expect(matchesBinding(ev({ key: 'Backspace', code: 'Backspace' }), 'ctrl+backspace')).toBe(false);
    expect(matchesBinding(ev({ key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true }), 'ctrl+shift+enter')).toBe(true);
    expect(matchesBinding(ev({ key: 'Tab', code: 'Tab' }), 'tab')).toBe(true);
    expect(matchesBinding(ev({ key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true }), 'ctrl+enter')).toBe(false);
    expect(matchesBinding(ev({ key: '/', code: 'Digit7', ctrlKey: true, shiftKey: true }), 'ctrl+/')).toBe(true);
    expect(matchesBinding(ev({ key: 'Escape', code: 'Escape' }), 'escape')).toBe(true);
    expect(matchesBinding(ev({ key: 'i', code: 'KeyI', altKey: true }), 'alt+i')).toBe(true);
  });
});
