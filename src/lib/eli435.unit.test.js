// 4.35: narrow que pliega, índice jerárquico, backlinks por párrafo, filtros, triángulos, ancho,
// scroll tipo Word y «Enviar a»
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath, narrowHeader, eliNarrowAndExpand } from '../actions/org';
import {
  headingIndex,
  orderHierarchical,
  nestEntries,
  countNodes,
  linkingParagraph,
  splitLinkParts,
  filterEntries,
  isArchivedEntry,
} from './eli_heading_index';
import { triangleGlyph } from './eli_triangles';
import { scrollDeltaFor } from './eli_caret_view';
import { gtdSendTo, sendPlan } from './gtd/gtd_sendto';
import { buildTasks } from './gtd/gtd_model';
import { exportOrg } from './export_org';

const makeStore = (files) => {
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
      base: fromJS({ customKeybindings: {}, isLoading: Set(), shouldLogIntoDrawer: true }),
    },
    applyMiddleware(thunk)
  );
  Object.keys(files).forEach((p) => store.dispatch(parseFile(p, files[p])));
  store.dispatch(setPath(Object.keys(files)[0]));
  return store;
};
const headersOf = (store, path) => store.getState().org.present.getIn(['files', path, 'headers']);
const idOf = (store, path, title) =>
  headersOf(store, path)
    .find((h) => h.getIn(['titleLine', 'rawTitle']) === title)
    .get('id');
const openedOf = (store, path, title) =>
  headersOf(store, path)
    .find((h) => h.getIn(['titleLine', 'rawTitle']) === title)
    .get('opened');
const fileText = (store, path) => {
  const f = store.getState().org.present.getIn(['files', path]);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};
const indexOf = (store) => headingIndex(store.getState().org.present.get('files'));

test('narrow: al reducir, las subcabeceras abiertas quedan plegadas (ir a cabecera incluido)', () => {
  const store = makeStore({ '/n.org': '* Raíz\n** Hija A\n*** Nieta\n** Hija B\n' });
  store.dispatch({ type: 'ELI_SET_ALL_OPENED', opened: true });
  expect(openedOf(store, '/n.org', 'Hija A')).toBe(true);
  store.dispatch(narrowHeader(idOf(store, '/n.org', 'Raíz')));
  expect(openedOf(store, '/n.org', 'Hija A')).toBe(false);
  expect(openedOf(store, '/n.org', 'Hija B')).toBe(false);
  expect(openedOf(store, '/n.org', 'Raíz')).toBe(true);
  // el camino de «solo cabeceras / todo» de 4.34 sigue desplegando si se pide
  store.dispatch(eliNarrowAndExpand(idOf(store, '/n.org', 'Raíz'), { titlesOnly: false }));
  expect(openedOf(store, '/n.org', 'Hija A')).toBe(true);
});

test('nestEntries: cuelga cada resultado de su madre más cercana que también salga', () => {
  const store = makeStore({
    '/a.org': '* Raíz #x\n** Salta\n*** Nieta :t:\n** Otra :t:\n* Otra raíz :t:\n',
    '/b.org': '* Suelta :t:\n',
  });
  const index = indexOf(store);
  const t = index.filter((e) => e.ownTags.includes('t'));
  expect(t.map((e) => e.title)).toEqual(['Nieta', 'Otra', 'Otra raíz', 'Suelta']);
  const tree = nestEntries(t);
  expect(tree.map((n) => n.entry.title)).toEqual(['Nieta', 'Otra', 'Otra raíz', 'Suelta']);
  // con «Raíz» y «Salta» en la lista, Nieta cuelga de Salta y Salta de Raíz
  const all = index.filter((e) => ['Raíz #x', 'Salta', 'Nieta', 'Otra'].includes(e.title));
  const t2 = nestEntries(all);
  expect(t2).toHaveLength(1);
  expect(t2[0].children.map((n) => n.entry.title)).toEqual(['Salta', 'Otra']);
  expect(t2[0].children[0].children.map((n) => n.entry.title)).toEqual(['Nieta']);
  expect(countNodes(t2)).toBe(4);
});

test('nestEntries: una madre sin relación no adopta (no basta con el nivel)', () => {
  const store = makeStore({ '/c.org': '* A\n* B\n** B1\n*** B11\n' });
  const index = indexOf(store);
  const pick = index.filter((e) => ['A', 'B11'].includes(e.title));
  expect(nestEntries(pick).map((n) => n.entry.title)).toEqual(['A', 'B11']);
});

test('orderHierarchical: por fichero, madres primero; la madre que no coincide sale atenuada', () => {
  const store = makeStore({
    '/a.org': '* Uno\n** Hija\n* Dos\n',
    '/b.org': '* Otro\n',
  });
  const index = indexOf(store);
  const all = orderHierarchical(index, index);
  expect(all.map((o) => [o.entry.title, o.depth, o.dim])).toEqual([
    ['Uno', 0, false],
    ['Hija', 1, false],
    ['Dos', 0, false],
    ['Otro', 0, false],
  ]);
  const only = orderHierarchical(
    index.filter((e) => e.title === 'Hija'),
    index
  );
  expect(only.map((o) => [o.entry.title, o.depth, o.dim])).toEqual([
    ['Uno', 0, true],
    ['Hija', 1, false],
  ]);
});

test('linkingParagraph: solo el párrafo (o ítem de lista) con el enlace', () => {
  const store = makeStore({
    '/l.org':
      '* Origen\nPrimer párrafo sin nada.\n\nAquí enlaza [[id:ABC][la página]] y sigue.\n\n- uno\n- dos con [[id:ABC]]\n- tres\n',
    '/t.org': '* Ver [[id:ABC][destino]] en título\nNotas sin enlace.\n',
  });
  const index = indexOf(store);
  const e1 = index.find((e) => e.title === 'Origen');
  expect(linkingParagraph(e1, 'ABC')).toEqual([
    'Aquí enlaza [[id:ABC][la página]] y sigue.',
    '- dos con [[id:ABC]]',
  ]);
  const e2 = index.find((e) => e.path === '/t.org');
  expect(linkingParagraph(e2, 'abc')).toHaveLength(1);
  expect(linkingParagraph(e1, 'OTRO')).toEqual([]);
  expect(splitLinkParts('Aquí enlaza [[id:ABC][la página]] y sigue.', 'ABC')).toEqual([
    { text: 'Aquí enlaza ', link: false },
    { text: 'la página', link: true },
    { text: ' y sigue.', link: false },
  ]);
  expect(splitLinkParts('x [[id:ABC]]', 'ABC')[1]).toEqual({ text: 'id:ABC', link: true });
});

test('filtros de la vista por etiqueta: archivadas y tareas', () => {
  const store = makeStore({
    '/a.org': '* TODO Hacer :t:\n* Nota :t:\n* Vieja :t:ARCHIVE:\n',
    '/a.org_archive': '* Muy vieja :t:\n',
  });
  const t = indexOf(store).filter((e) => e.ownTags.includes('t'));
  expect(t).toHaveLength(4);
  expect(t.filter(isArchivedEntry).map((e) => e.title)).toEqual(['Vieja', 'Muy vieja']);
  expect(filterEntries(t, {}).length).toBe(4);
  expect(filterEntries(t, { hideArchived: true }).map((e) => e.title)).toEqual(['Hacer', 'Nota']);
  expect(filterEntries(t, { hideTasks: true }).map((e) => e.title)).toEqual([
    'Nota',
    'Vieja',
    'Muy vieja',
  ]);
  expect(filterEntries(t, { hideArchived: true, hideTasks: true }).map((e) => e.title)).toEqual([
    'Nota',
  ]);
});

test('viñeta «Triángulos»: glifo según contenido y apertura', () => {
  expect(triangleGlyph(true, false)).toBe('▸');
  expect(triangleGlyph(true, true)).toBe('▾');
  expect(triangleGlyph(false, true)).toBe('•');
  expect(triangleGlyph(false, false)).toBe('•');
});

test('scroll tipo Word: el cursor dentro de la franja no mueve nada; fuera, lo justo con 2 líneas', () => {
  const band = { top: 100, bottom: 500 };
  const lh = 20;
  const margin = 2 * lh;
  expect(scrollDeltaFor(300, 320, band, margin)).toBe(0);
  expect(scrollDeltaFor(440, 460, band, margin)).toBe(0); // justo en el margen
  expect(scrollDeltaFor(450, 470, band, margin)).toBe(470 - (500 - margin));
  expect(scrollDeltaFor(110, 130, band, margin)).toBe(110 - (100 + margin));
  // franja demasiado pequeña: no hace nada
  expect(scrollDeltaFor(300, 320, { top: 100, bottom: 150 }, margin)).toBe(0);
});

test('Enviar a: mueve dentro de la cabecera elegida y deja enlazada la tarea a su proyecto', () => {
  const store = makeStore({
    '/tasks.org': '* PROJECT Casa\n:PROPERTIES:\n:ID: P1\n:END:\n** NEXT Pintar\n* Archivo\n',
    '/otro.org': '* Carpeta\n',
  });
  const files = () => store.getState().org.present.get('files');
  const tasks = () => buildTasks(files(), []);
  const task = tasks().find((t) => t.title === 'Pintar');
  const dest = tasks().find((t) => t.title === 'Archivo');
  expect(sendPlan(task, dest, tasks()).link.title).toBe('Casa');
  const r = store.dispatch(gtdSendTo(task, '/otro.org', idOf(store, '/otro.org', 'Carpeta')));
  expect(r.moved).toBe(1);
  expect(r.linkedTo).toBe('Casa');
  expect(fileText(store, '/otro.org')).toMatch(
    /\* Carpeta\n\*\* NEXT Pintar\n:PROPERTIES:\n:PROYECTO: \[\[id:P1\]\[Casa\]\]\n:END:/
  );
  expect(fileText(store, '/tasks.org')).not.toMatch(/Pintar/);
  // la tarea movida sigue siendo del proyecto (por el enlace)
  const moved = tasks().find((t) => t.title === 'Pintar');
  expect(moved.project.title).toBe('Casa');
  expect(moved.projectExternal).toBe(true);
});

test('Enviar a: a otro proyecto se re-enlaza (queda dentro, sin enlace viejo)', () => {
  const store = makeStore({
    '/tasks.org':
      '* PROJECT Casa\n:PROPERTIES:\n:ID: P1\n:END:\n* PROJECT Jardín\n:PROPERTIES:\n:ID: P2\n:END:\n* NEXT Podar\n:PROPERTIES:\n:PROYECTO: [[id:P1][Casa]]\n:END:\n',
  });
  const files = () => store.getState().org.present.get('files');
  const task = buildTasks(files(), []).find((t) => t.title === 'Podar');
  expect(task.projRefOwn).toBeTruthy();
  const r = store.dispatch(gtdSendTo(task, '/tasks.org', idOf(store, '/tasks.org', 'Jardín')));
  expect(r.moved).toBe(1);
  const text = fileText(store, '/tasks.org');
  expect(text).not.toMatch(/:PROYECTO:/);
  expect(text).toMatch(/\* PROJECT Jardín[\s\S]*\*\* NEXT Podar/);
});
