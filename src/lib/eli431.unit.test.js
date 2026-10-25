// 4.31: índice común de cabeceras (etiquetas con heredadas, referencias entrantes, buscador),
// «#» al escribir el título y crear en el fichero de páginas
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile } from '../actions/org';
import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';
import {
  headingIndex,
  entriesWithTags,
  backlinkEntries,
  childrenOf,
  searchHeadings,
  allTags,
  groupByPath,
  contextLabel,
  splitTrailingTags,
  appendTagToTitle,
  mergeTitleTags,
  hashStartsWord,
  openedDoubleBracket,
  pagesFilePath,
} from './eli_heading_index';
import { ensureHeadingOrgId, createPageHeading, pagesPathFor } from './eli_heading_links';
import { shortDate } from './eli_layout';

const file = (text) => IMap({ headers: parseOrg(text).get('headers') });

const A = `* Casa :hogar:
** Pintar la cocina
Comprar pintura blanca.
*** Rodillo
** Jardín :fuera:
* Trabajo
:PROPERTIES:
:ID: TRA-1
:END:
** Informe :hogar:
`;
const B = `* Ideas
Mira [[id:TRA-1][el trabajo]].
* Ver [[id:tra-1][trabajo]] hoy
* Otra :hogar:
`;
const D = `* 2026
** 2026-10-25 domingo :hogar:
`;

const files = IMap({ '/a.org': file(A), '/b.org': file(B), '/pages/diari-2026.org': file(D) });

test('índice: ruta de madres, etiquetas propias y heredadas', () => {
  const idx = headingIndex(files);
  const rod = idx.find((e) => e.title === 'Rodillo');
  expect(rod.parents).toEqual(['Casa', 'Pintar la cocina']);
  expect(rod.ownTags).toEqual([]);
  expect(rod.tags).toEqual(['hogar']);
  expect(contextLabel(rod)).toBe('Casa › Pintar la cocina · a.org');
  const tra = idx.find((e) => e.title === 'Trabajo');
  expect(tra.orgId).toBe('TRA-1');
  expect(
    childrenOf(
      idx,
      idx.find((e) => e.title === 'Casa')
    ).map((e) => e.title)
  ).toEqual(['Pintar la cocina', 'Jardín']);
});

test('vista por etiqueta: con heredadas solo las de más arriba; sin diario', () => {
  const idx = headingIndex(files, { skipDiary: true });
  const withInh = entriesWithTags(idx, 'hogar', { inherited: true }).map((e) => e.title);
  expect(withInh).toEqual(['Casa', 'Informe', 'Otra']);
  const own = entriesWithTags(idx, 'HOGAR', { inherited: false }).map((e) => e.title);
  expect(own).toEqual(['Casa', 'Informe', 'Otra']);
  // dos etiquetas: Jardín tiene «fuera» y hereda «hogar»
  expect(entriesWithTags(idx, ['hogar', 'fuera']).map((e) => e.title)).toEqual(['Jardín']);
  expect(entriesWithTags(idx, ['hogar', 'fuera'], { inherited: false })).toEqual([]);
  expect(groupByPath(entriesWithTags(idx, 'hogar')).map((g) => g.path)).toEqual([
    '/a.org',
    '/b.org',
  ]);
  expect(allTags(idx).map((t) => t.tag)).toEqual(['fuera', 'hogar']);
});

test('referencias entrantes: solo por ID (sin distinguir mayúsculas)', () => {
  const idx = headingIndex(files);
  expect(backlinkEntries(idx, 'TRA-1').map((e) => e.title)).toEqual(['Ideas', 'Ver trabajo hoy']);
  expect(backlinkEntries(idx, 'NADA')).toEqual([]);
  expect(backlinkEntries(idx, null)).toEqual([]);
});

test('buscador: sin tildes ni mayúsculas, todas las palabras, primero las que empiezan', () => {
  const idx = headingIndex(files);
  expect(searchHeadings(idx, 'jardin').map((e) => e.title)).toEqual(['Jardín']);
  expect(searchHeadings(idx, 'TRABAJO').map((e) => e.title)).toEqual([
    'Trabajo',
    'Ver trabajo hoy',
  ]);
  expect(searchHeadings(idx, 'pintar cocina').map((e) => e.title)).toEqual(['Pintar la cocina']);
});

test('«#» y «[[» al escribir', () => {
  expect(hashStartsWord('Llamar #', 8)).toBe(true);
  expect(hashStartsWord('#', 1)).toBe(true);
  expect(hashStartsWord('C#', 2)).toBe(false);
  expect(openedDoubleBracket('ver [[', 6)).toBe(true);
  expect(openedDoubleBracket('ver [', 5)).toBe(false);
  expect(openedDoubleBracket('[[[', 3)).toBe(false);
});

test('«#tag» → «:tag:» al final del título y, al guardar, a las etiquetas', () => {
  expect(appendTagToTitle('Llamar a Ana', 'casa')).toBe('Llamar a Ana :casa:');
  expect(appendTagToTitle('Llamar :casa:', 'tel')).toBe('Llamar :casa:tel:');
  expect(appendTagToTitle('Llamar :casa:', 'casa')).toBe('Llamar :casa:');
  expect(splitTrailingTags('Llamar a Ana :casa:tel:')).toEqual({
    title: 'Llamar a Ana',
    tags: ['casa', 'tel'],
  });
  expect(splitTrailingTags('Hora 10:30')).toEqual({ title: 'Hora 10:30', tags: [] });
  expect(mergeTitleTags('Llamar :tel:', ['casa'])).toEqual({
    title: 'Llamar',
    tags: ['casa', 'tel'],
    changed: true,
  });
  expect(mergeTitleTags('Llamar', ['casa']).changed).toBe(false);
});

const makeStore = (entries, base = {}) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: IMap({
          files: IMap(),
          fileSettings: [],
          search: IMap({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: IMap({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: IMap({ isAuthenticated: true }),
      capture: IMap().set('captureTemplates', []),
      base: fromJS({ customKeybindings: {}, isLoading: Set(), ...base }),
    },
    applyMiddleware(thunk)
  );
  Object.keys(entries).forEach((p) => store.dispatch(parseFile(p, entries[p])));
  return store;
};
const textOf = (store, path) => {
  const f = store.getState().org.present.getIn(['files', path]);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};

test('enlazar a una cabecera sin :ID: se lo pone (y si ya tiene, se usa)', () => {
  const store = makeStore({ '/a.org': A });
  const headers = store.getState().org.present.getIn(['files', '/a.org', 'headers']);
  const casa = headers.find((h) => (h.getIn(['titleLine', 'rawTitle']) || '').trim() === 'Casa');
  const tra = headers.find((h) => h.getIn(['titleLine', 'rawTitle']) === 'Trabajo');
  expect(store.dispatch(ensureHeadingOrgId('/a.org', tra.get('id')))).toBe('TRA-1');
  const id = store.dispatch(ensureHeadingOrgId('/a.org', casa.get('id')));
  expect(id).toMatch(/\S{6,}/);
  expect(textOf(store, '/a.org')).toContain(`* Casa`);
  expect(textOf(store, '/a.org')).toContain(`:ID: ${id}`);
  // la segunda vez no cambia
  expect(store.dispatch(ensureHeadingOrgId('/a.org', casa.get('id')))).toBe(id);
});

test('«➕ Crear»: cabecera de nivel 1 con :ID: al final del fichero de páginas', async () => {
  const store = makeStore(
    { '/notas/inbox.org': '* x\n', '/notas/paginas.org': '* Vieja\n' },
    { eliPagesFile: '' }
  );
  expect(pagesPathFor(store.getState())).toBe('/notas/paginas.org');
  const made = await store.dispatch(createPageHeading('Receta de pan'));
  expect(made.path).toBe('/notas/paginas.org');
  const text = textOf(store, '/notas/paginas.org');
  expect(text).toMatch(/\* Vieja\n[\s\S]*\* Receta de pan\n:PROPERTIES:\n:ID: (\S+)\n:END:/);
  expect(text).toContain(`:ID: ${made.orgId}`);
});

test('fichero de páginas: el elegido en Ajustes o paginas.org junto al de entrada', () => {
  expect(pagesFilePath('', '/gtd/inbox.org')).toBe('/gtd/paginas.org');
  expect(pagesFilePath('wiki.org', '/gtd/inbox.org')).toBe('/wiki.org');
  expect(pagesFilePath('', '')).toBe('/paginas.org');
});

test('lista de ficheros: fecha corta', () => {
  const now = new Date(2026, 9, 25, 20, 0);
  expect(shortDate(new Date(2026, 9, 25, 9, 5).toISOString(), now)).toBe('09:05');
  expect(shortDate(new Date(2026, 2, 3).toISOString(), now)).toBe('3 mar');
  expect(shortDate(new Date(2024, 2, 3).toISOString(), now)).toBe('3 mar 2024');
  expect(shortDate(null, now)).toBe('');
});
