// 4.42: «Citar» (transclusión tipo org-transclusion): línea `#+transclude:`, opciones, resolución
// del origen (cabecera y nota-fichero), ciclos/profundidad y que el fichero conserve solo la línea
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set as ISet, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile } from '../actions/org';
import { exportOrg } from './export_org';
import { parseRawText } from './parse_org';
import { scanBrokenLinks } from './eli_roam';
import {
  parseTransclude,
  buildTransclusionLine,
  lineInsertion,
  filterElements,
  resolveTransclusion,
  transclusionGuard,
  isTranscludeLine,
  MAX_TRANSCLUSION_DEPTH,
} from './eli_transclude';

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

const ORIGEN = `* Receta
:PROPERTIES:
:ID: REC-1
:END:
Mezclar todo.
#+name: ingredientes
** Ingredientes
:NOTAS:
oculto
:END:
Harina y agua.
*** Extra
Sal.
* Otra cosa
Fuera de la receta.
`;

const NOTA = `:PROPERTIES:
:ID: NOTA-1
:END:
#+title: Pan de pueblo
Texto de portada.

* Paso uno
Amasar.
`;

const DESTINO = `* Menú
Cita:
#+transclude: [[id:REC-1][Receta]] :level 2
* Con nota
#+transclude: [[id:NOTA-1][Pan de pueblo]]
* Rota
#+transclude: [[id:NO-EXISTE][Nada]]
`;

test('parseTransclude: enlace, descripción y opciones', () => {
  expect(parseTransclude('#+transclude: [[id:ABC][Título]]')).toMatchObject({
    id: 'ABC',
    desc: 'Título',
    onlyContents: false,
    level: null,
    exclude: [],
  });
  expect(
    parseTransclude(
      '#+TRANSCLUDE: [[id:ABC]] :only-contents :level 3 :exclude-elements "drawer keyword"\n'
    )
  ).toMatchObject({ id: 'ABC', onlyContents: true, level: 3, exclude: ['drawer', 'keyword'] });
  expect(parseTransclude('#+transclude: [[id:ABC]] :only-contents nil').onlyContents).toBe(false);
  // otros enlaces (file:, web) no se pueden citar: sin id
  expect(parseTransclude('#+transclude: [[file:otro.org::*Algo]]').id).toBeNull();
  expect(parseTransclude('#+transclude: https://x.org').id).toBeNull();
  expect(parseTransclude('texto normal')).toBeNull();
  expect(isTranscludeLine('  #+transclude: [[id:A]]')).toBe(true);
  expect(isTranscludeLine('#+title: x')).toBe(false);
});

test('buildTransclusionLine y lineInsertion: línea propia, con y sin opciones', () => {
  expect(buildTransclusionLine('X1', 'Mi nota')).toBe('#+transclude: [[id:X1][Mi nota]]');
  expect(buildTransclusionLine('X1', 'Mi nota', { onlyContents: true, level: 2 })).toBe(
    '#+transclude: [[id:X1][Mi nota]] :only-contents :level 2'
  );
  // lo que se escribe se vuelve a leer igual
  expect(
    parseTransclude(buildTransclusionLine('X1', 'Mi nota', { exclude: ['drawer'] }))
  ).toMatchObject({ id: 'X1', exclude: ['drawer'] });
  const line = '#+transclude: [[id:X1][A]]';
  // en medio de una línea: salto antes y después
  expect(lineInsertion('hola mundo', 4, 4, line).text).toBe(`\n${line}\n`);
  // al principio de línea y con texto detrás: solo salto después
  expect(lineInsertion('hola', 0, 0, line)).toEqual({ text: `${line}\n`, caret: line.length + 1 });
  // texto vacío
  expect(lineInsertion('', 0, 0, line).text).toBe(`${line}\n`);
  // tras un salto y con otro detrás: nada que añadir
  expect(lineInsertion('a\n\nb', 2, 2, line).text).toBe(line);
});

test('filterElements: drawer y keyword', () => {
  const t = 'uno\n:LOGBOOK:\nx\n:END:\n#+name: n\ndos\n';
  expect(filterElements(t, [])).toBe(t);
  expect(filterElements(t, ['drawer'])).toBe('uno\n#+name: n\ndos\n');
  expect(filterElements(t, ['keyword'])).toBe('uno\n:LOGBOOK:\nx\n:END:\ndos\n');
  expect(filterElements(t, ['drawer', 'keyword'])).toBe('uno\ndos\n');
});

test('resolver una cabecera: título, notas y subcabeceras en orden; sin lo que sigue a la cita', () => {
  const store = makeStore({ '/origen.org': ORIGEN, '/destino.org': DESTINO });
  const res = resolveTransclusion(files(store), parseTransclude('#+transclude: [[id:REC-1]]'));
  expect(res).toMatchObject({ ok: true, kind: 'heading', title: 'Receta', path: '/origen.org' });
  expect(res.blocks.map((b) => [b.level, b.rawTitle && b.rawTitle.trim()])).toEqual([
    [1, 'Receta'],
    [2, 'Ingredientes'],
    [3, 'Extra'],
  ]);
  expect(res.blocks[0].text).toContain('Mezclar todo.');
  expect(res.blocks[2].text).toBe('Sal.');
  // «Otra cosa» (hermana) no entra
  expect(JSON.stringify(res.blocks)).not.toContain('Fuera de la receta');
});

test(':only-contents quita el título de la cabecera citada; :level la baja y desplaza las hijas', () => {
  const store = makeStore({ '/origen.org': ORIGEN });
  const only = resolveTransclusion(
    files(store),
    parseTransclude('#+transclude: [[id:REC-1]] :only-contents')
  );
  expect(only.blocks[0].rawTitle).toBeNull();
  expect(only.blocks[0].text).toContain('Mezclar todo.');
  expect(only.blocks.length).toBe(3);
  const lvl = resolveTransclusion(
    files(store),
    parseTransclude('#+transclude: [[id:REC-1]] :level 3')
  );
  expect(lvl.blocks.map((b) => b.level)).toEqual([3, 4, 5]);
});

test(':exclude-elements quita cajones y líneas #+ de lo citado', () => {
  const store = makeStore({ '/origen.org': ORIGEN });
  const full = resolveTransclusion(files(store), parseTransclude('#+transclude: [[id:REC-1]]'));
  expect(full.blocks[1].text).toContain(':NOTAS:');
  expect(full.blocks[0].text).toContain('#+name: ingredientes');
  const ex = resolveTransclusion(
    files(store),
    parseTransclude('#+transclude: [[id:REC-1]] :exclude-elements "drawer keyword"')
  );
  expect(ex.blocks[1].text).toBe('Harina y agua.');
  expect(ex.blocks[0].text).toBe('Mezclar todo.');
});

test('resolver una nota-fichero: preámbulo sin metadatos y todas sus cabeceras', () => {
  const store = makeStore({ '/pages/pan.org': NOTA });
  const res = resolveTransclusion(files(store), parseTransclude('#+transclude: [[id:NOTA-1]]'));
  expect(res).toMatchObject({
    ok: true,
    kind: 'file',
    title: 'Pan de pueblo',
    path: '/pages/pan.org',
  });
  expect(res.blocks[0].rawTitle).toBeNull();
  expect(res.blocks[0].text).toBe('Texto de portada.');
  expect(res.blocks[1].rawTitle.trim()).toBe('Paso uno');
  expect(res.blocks[1].level).toBe(1);
});

test('origen inexistente o enlace no soportado', () => {
  const store = makeStore({ '/origen.org': ORIGEN });
  expect(resolveTransclusion(files(store), parseTransclude('#+transclude: [[id:NO]]'))).toEqual({
    ok: false,
    reason: 'missing',
    id: 'NO',
  });
  expect(
    resolveTransclusion(files(store), parseTransclude('#+transclude: [[file:x.org]]'))
  ).toEqual({
    ok: false,
    reason: 'unsupported',
    id: null,
  });
});

test('ciclos y profundidad máxima', () => {
  expect(transclusionGuard('A', [])).toBeNull();
  expect(transclusionGuard('a', ['A'])).toBe('cycle');
  expect(transclusionGuard('C', ['A', 'B'])).toBeNull();
  const full = Array.from({ length: MAX_TRANSCLUSION_DEPTH }, (_, i) => `ID${i}`);
  expect(transclusionGuard('NUEVO', full)).toBe('depth');
  expect(MAX_TRANSCLUSION_DEPTH).toBe(3);
});

test('el fichero solo guarda la línea: se lee marcada y se escribe igual (sin partir el enlace)', () => {
  const parts = parseRawText(
    'Antes\n#+transclude: [[id:REC-1][Receta]] :level 2\nDespués\n'
  ).toJS();
  const marked = parts.filter((p) => p.transclude);
  expect(marked).toHaveLength(1);
  expect(marked[0]).toMatchObject({
    type: 'text',
    contents: '#+transclude: [[id:REC-1][Receta]] :level 2\n',
  });
  // ninguna parte de tipo enlace: el enlace va dentro de la línea
  expect(parts.some((p) => p.type === 'link')).toBe(false);
  const store = makeStore({ '/origen.org': ORIGEN, '/destino.org': DESTINO });
  expect(textOf(store, '/destino.org')).toBe(DESTINO);
  // y la cabecera conserva su texto de notas tal cual
  const menu = files(store).get('/destino.org').get('headers').first();
  expect(menu.get('rawDescription')).toContain('#+transclude: [[id:REC-1][Receta]] :level 2');
});

test('la cita rota aparece en «Enlaces rotos» (el enlace va dentro de la línea)', () => {
  const store = makeStore({
    '/origen.org': ORIGEN,
    '/pages/pan.org': NOTA,
    '/destino.org': DESTINO,
  });
  const known = (id) => !!resolveTransclusion(files(store), { id, exclude: [] }).ok;
  const groups = scanBrokenLinks(files(store), {
    existsFile: () => true,
    resolveId: known,
    findHeading: () => undefined,
    isVirtualId: () => false,
    ignored: new Set(),
  });
  expect(groups.map((g) => g.key)).toEqual(['id:no-existe']);
  expect(groups[0].occurrences[0].title).toBe('Rota');
});
