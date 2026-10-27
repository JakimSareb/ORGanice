// 4.41: compatibilidad org-roam (nodos de fichero, alias, filetags, ROAM_EXCLUDE, ROAM_REFS),
// menciones sin enlazar, renombrar y herramienta «Enlaces rotos»
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set as ISet, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, eliRewriteHeadings } from '../actions/org';
import { exportOrg } from './export_org';
import {
  headingIndex,
  backlinkEntries,
  searchHeadings,
  entriesWithTags,
} from './eli_heading_index';
import {
  parsePreamble,
  parseAliases,
  parseRefs,
  fileNodeOf,
  findFileNodeById,
  slugify,
  freeNotePath,
  newNoteFileText,
  rewriteLinks,
  unlinkedMentions,
  linkFirstMention,
  renameLinkDescriptions,
  countRenamable,
  classifyLink,
  relativePath,
  resolvePath,
  scanBrokenLinks,
  repairSuggestions,
} from './eli_roam';
import { computeBrokenLinks, unlinkGroups, repairGroup } from './eli_broken_links';
import { renameEdits } from '../middleware/rename_links';

const makeStore = (entries) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: IMap({
          files: IMap(),
          fileSettings: List(),
          search: IMap({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: IMap({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: IMap({ isAuthenticated: true }),
      capture: IMap().set('captureTemplates', []),
      base: fromJS({ customKeybindings: {}, isLoading: ISet() }),
    },
    applyMiddleware(thunk)
  );
  Object.keys(entries).forEach((p) => store.dispatch(parseFile(p, entries[p])));
  return store;
};
const files = (store) => store.getState().org.present.get('files');
const textOf = (store, path) => {
  const f = files(store).get(path);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};

const NOTE = `:PROPERTIES:
:ID:       NOTA-1
:ROAM_ALIASES: "Pan casero" masa
:ROAM_REFS: https://ejemplo.org/pan @libro2020
:END:
#+title: Receta de pan
#+filetags: :cocina:receta:

* Ingredientes
** Harina
* Oculta
:PROPERTIES:
:ID: OCU-1
:ROAM_EXCLUDE: t
:END:
** Hija de oculta
`;

const OTHER = `* Diario
Hoy hice Receta de pan y quedó bien. Ver [[id:NOTA-1][Receta de pan]].
** Otra
Esta habla de pan casero sin enlace.
* Enlaza oculta
[[id:OCU-1][x]]
`;

test('preámbulo: :ID:, #+title:, #+filetags:, alias y refs', () => {
  const pre = parsePreamble(NOTE.split('\n').slice(0, 8));
  expect(pre.props.ID).toBe('NOTA-1');
  expect(pre.title).toBe('Receta de pan');
  expect(pre.filetags).toEqual(['cocina', 'receta']);
  expect(parseAliases('"Pan casero" masa')).toEqual(['Pan casero', 'masa']);
  expect(parseRefs('https://a.b/c @cita')).toEqual([
    { text: 'https://a.b/c', url: 'https://a.b/c' },
    { text: '@cita', url: null },
  ]);
});

test('nodo de fichero: se encuentra por ID y tiene título, alias y etiquetas', () => {
  const store = makeStore({ '/pages/pan.org': NOTE, '/otro.org': OTHER });
  const node = fileNodeOf('/pages/pan.org', files(store).get('/pages/pan.org'));
  expect(node).toMatchObject({
    orgId: 'NOTA-1',
    title: 'Receta de pan',
    aliases: ['Pan casero', 'masa'],
    isFile: true,
    headerId: null,
  });
  expect(findFileNodeById(files(store), 'nota-1').path).toBe('/pages/pan.org');
  expect(fileNodeOf('/otro.org', files(store).get('/otro.org'))).toBeNull();
  // el texto del fichero no cambia al exportarlo
  expect(textOf(store, '/pages/pan.org')).toContain(':ID:       NOTA-1\n');
  expect(textOf(store, '/pages/pan.org')).toContain('#+title: Receta de pan\n');
});

test('#+filetags: los heredan las cabeceras; ROAM_EXCLUDE deja fuera el subárbol', () => {
  const store = makeStore({ '/pages/pan.org': NOTE, '/otro.org': OTHER });
  const index = headingIndex(files(store));
  const harina = index.find((e) => e.title === 'Harina');
  expect(harina.tags).toEqual(expect.arrayContaining(['cocina', 'receta']));
  expect(harina.ownTags).toEqual([]);
  expect(entriesWithTags(index, 'cocina').map((e) => e.title)).toContain('Ingredientes');
  expect(index.find((e) => e.title === 'Oculta').exclude).toBe(true);
  expect(index.find((e) => e.title === 'Hija de oculta').exclude).toBe(true);
  expect(harina.exclude).toBe(false);
  // backlinks: el fichero tiene uno; la cabecera excluida no sale como origen
  expect(backlinkEntries(index, 'NOTA-1').map((e) => e.title)).toEqual(['Diario']);
});

test('buscar por alias', () => {
  const store = makeStore({
    '/a.org': '* Proyecto Alfa\n:PROPERTIES:\n:ID: A1\n:ROAM_ALIASES: Omega\n:END:\n',
  });
  const index = headingIndex(files(store));
  expect(searchHeadings(index, 'omega').map((e) => e.title)).toEqual(['Proyecto Alfa']);
});

test('menciones sin enlazar (título y alias, fuera de enlaces) y «Enlazar»', () => {
  const store = makeStore({ '/pages/pan.org': NOTE, '/otro.org': OTHER });
  const index = headingIndex(files(store));
  const node = fileNodeOf('/pages/pan.org', files(store).get('/pages/pan.org'));
  const ms = unlinkedMentions(index, node);
  expect(ms.map((m) => [m.entry.title, m.text])).toEqual([
    ['Diario', 'Receta de pan'],
    ['Otra', 'pan casero'],
  ]);
  expect(
    linkFirstMention('Hoy hice Receta de pan. [[id:X][Receta de pan]]', ['Receta de pan'], 'N')
  ).toBe('Hoy hice [[id:N][Receta de pan]]. [[id:X][Receta de pan]]');
  // no dentro de otra palabra
  expect(linkFirstMention('masaje', ['masa'], 'N')).toBe('masaje');
  const otra = ms[1].entry;
  const fn = (t) => linkFirstMention(t, ['Receta de pan', 'Pan casero', 'masa'], 'NOTA-1');
  store.dispatch(eliRewriteHeadings([{ path: otra.path, headerId: otra.headerId, notes: fn }]));
  expect(textOf(store, '/otro.org')).toContain('habla de [[id:NOTA-1][pan casero]] sin enlace');
});

test('renombrar: solo los enlaces que muestran el título antiguo', () => {
  const t = '[[id:A][Viejo]] y [[id:A][Mi texto]] y [[id:B][Viejo]]';
  expect(countRenamable(t, 'A', 'viejo')).toBe(1);
  expect(renameLinkDescriptions(t, 'A', 'Viejo', 'Nuevo')).toBe(
    '[[id:A][Nuevo]] y [[id:A][Mi texto]] y [[id:B][Viejo]]'
  );
  const store = makeStore({
    '/a.org': '* Viejo\n:PROPERTIES:\n:ID: A\n:END:\n* Otra\nVer [[id:A][Viejo]].\n',
  });
  const { count, edits } = renameEdits(files(store), 'A', 'Viejo', 'Nuevo');
  expect(count).toBe(1);
  store.dispatch(eliRewriteHeadings(edits));
  expect(textOf(store, '/a.org')).toContain('Ver [[id:A][Nuevo]].');
});

test('notas nuevas: nombre de fichero y contenido como org-roam', () => {
  expect(slugify('Receta de Pan — ¡ya!')).toBe('receta_de_pan_ya');
  const taken = new Set(['/n/pages/pan.org']);
  expect(freeNotePath('/n/pages/', 'Pan', (p) => taken.has(p))).toBe('/n/pages/pan_2.org');
  expect(newNoteFileText('Pan', 'X1')).toBe(':PROPERTIES:\n:ID:       X1\n:END:\n#+title: Pan\n\n');
});

test('reescribir enlaces: texto, borrar y cambiar destino', () => {
  const t = 'a [[id:X][Uno]] b [[id:X]] c [[https://e.org][web]]';
  const isX = (u) => u === 'id:X';
  expect(rewriteLinks(t, isX, 'text')).toBe('a Uno b X c [[https://e.org][web]]');
  expect(rewriteLinks(t, isX, 'remove')).toBe('a b c [[https://e.org][web]]');
  expect(rewriteLinks(t, isX, 'retarget', { newUri: 'id:Y', newDesc: 'Nuevo' })).toBe(
    'a [[id:Y][Uno]] b [[id:Y][Nuevo]] c [[https://e.org][web]]'
  );
});

test('rutas de enlaces', () => {
  expect(resolvePath('/a/b/c.org', '../d.org')).toBe('/a/d.org');
  expect(resolvePath('/a/b/c.org', './e/f.org')).toBe('/a/b/e/f.org');
  expect(relativePath('/a/b/c.org', '/a/d/e.org')).toBe('../d/e.org');
  expect(relativePath('/a/c.org', '/a/x.org')).toBe('x.org');
  expect(classifyLink('https://x.org', '/a.org')).toBeNull();
  expect(classifyLink('file:b.org::*T', '/d/a.org')).toMatchObject({
    kind: 'heading',
    file: '/d/b.org',
    search: '*T',
  });
});

const BROKEN = `* Uno
Ver [[id:NO-EXISTE][Receta de pan]] y [[id:NOTA-1][bien]].
También [[file:viejo/plan.org][el plan]] y [[file:pan.org::*Nada][nada]].
* Dos
:PROPERTIES:
:PADRE: [[id:NO-EXISTE][Receta de pan]]
:END:
[[*Uno][arriba]] [[*Falta][falta]] [[id:diari-2026-10-27][hoy]]
`;

test('escanear enlaces rotos: id, fichero y cabecera; los buenos y el diario no salen', () => {
  const store = makeStore({ '/pages/pan.org': NOTE, '/pages/x.org': BROKEN });
  const all = ['/pages/pan.org', '/pages/x.org', '/otra/plan.org'];
  const { groups, nodes } = computeBrokenLinks(store.getState(), all);
  const labels = groups.map((g) => [g.kind, g.label, g.occurrences.length]);
  expect(labels).toEqual(
    expect.arrayContaining([
      ['id', 'id:NO-EXISTE', 2],
      ['file', '/pages/viejo/plan.org', 1],
      ['heading', 'pan.org › *Nada', 1],
      ['heading', '*Falta', 1],
    ])
  );
  expect(groups).toHaveLength(4);
  // sugerencias: el fichero movido y una nota con el mismo título
  const file = groups.find((g) => g.kind === 'file');
  expect(repairSuggestions(file, { nodes, allPaths: all })[0]).toMatchObject({
    kind: 'file',
    path: '/otra/plan.org',
  });
  const id = groups.find((g) => g.kind === 'id');
  expect(repairSuggestions(id, { nodes, allPaths: all })[0].node.orgId).toBe('NOTA-1');
});

test('enlaces rotos: ignorados no salen', () => {
  const store = makeStore({ '/x.org': BROKEN });
  const ctx = {
    existsFile: () => true,
    resolveId: () => false,
    findHeading: () => true,
    isVirtualId: (id) => /^diari-/.test(id),
    ignored: new Set(['id:no-existe']),
  };
  const groups = scanBrokenLinks(files(store), ctx);
  expect(groups.map((g) => g.key)).toEqual(['id:nota-1']);
});

test('reparar y dejar solo el texto escriben el fichero (propiedades incluidas)', async () => {
  const store = makeStore({ '/pages/pan.org': NOTE, '/pages/x.org': BROKEN });
  const all = ['/pages/pan.org', '/pages/x.org', '/otra/plan.org'];
  let { groups, nodes } = computeBrokenLinks(store.getState(), all);
  const id = groups.find((g) => g.kind === 'id');
  await store.dispatch(repairGroup(id, repairSuggestions(id, { nodes, allPaths: all })[0]));
  let text = textOf(store, '/pages/x.org');
  expect(text).not.toContain('NO-EXISTE');
  expect(text).toContain('Ver [[id:NOTA-1][Receta de pan]]');
  expect(text).toContain(':PADRE: [[id:NOTA-1][Receta de pan]]');
  ({ groups } = computeBrokenLinks(store.getState(), all));
  const file = groups.find((g) => g.kind === 'file');
  await store.dispatch(repairGroup(file, { kind: 'file', path: '/otra/plan.org' }));
  expect(textOf(store, '/pages/x.org')).toContain('[[file:../otra/plan.org][el plan]]');
  ({ groups } = computeBrokenLinks(store.getState(), all));
  store.dispatch(unlinkGroups(groups, 'text'));
  text = textOf(store, '/pages/x.org');
  expect(text).toContain('y nada.');
  expect(text).toContain('[[*Uno][arriba]] falta');
  expect(computeBrokenLinks(store.getState(), all).groups).toEqual([]);
});
