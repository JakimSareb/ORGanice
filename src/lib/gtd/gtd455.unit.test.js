import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map, Set, fromJS, List } from 'immutable';

import rootReducer from '../../reducers';
import { parseFile, setPath } from '../../actions/org';
import { gtdSaveTask, gtdAddTask, LS_NEW_PROJECT_ORDER } from './gtd_actions';
import { setGtdConfig } from './gtd_sections';
import { reorderIds, dropTargetAt } from '../eli_list_drag';
import { buildTasks, listOf, parseCreated } from './gtd_model';
import { exportOrg } from '../export_org';

const makeStore = (path, text) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: Map({
          files: Map(),
          fileSettings: List(),
          search: Map({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: Map({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: Map({ isAuthenticated: true }),
      capture: Map().set('captureTemplates', []),
      base: new fromJS({ customKeybindings: {}, isLoading: Set(), shouldLogIntoDrawer: true }),
    },
    applyMiddleware(thunk)
  );
  store.dispatch(parseFile(path, text));
  store.dispatch(setPath(path));
  return store;
};
const fileText = (store, path) => {
  const f = store.getState().org.present.getIn(['files', path]);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};
const tasksOf = (store) => buildTasks(store.getState().org.present.get('files'));

test('4.55: pasar una tarea a Referencia le quita el estado', () => {
  const store = makeStore(
    '/t.org',
    '#+TODO: TODO NEXT | DONE\n#+TODO: WAITING MAYBE PROJECT | CANCELLED\n* WAITING Pintar\n* PROJECT P\n** MAYBE Hija\n'
  );
  for (const title of ['Pintar', 'Hija']) {
    const t = tasksOf(store).find((x) => x.title === title);
    store.dispatch(gtdSaveTask(t, { list: 'reference', tags: [] }));
  }
  const after = tasksOf(store);
  expect(after.find((x) => x.title === 'Pintar').keyword).toBeFalsy();
  expect(listOf(after.find((x) => x.title === 'Pintar'))).toBe('reference');
  expect(listOf(after.find((x) => x.title === 'Hija'))).toBe('reference');
});

test('4.55: un proyecto nuevo lleva :CREATED: y, si se pide, :ORDERED: t', () => {
  const store = makeStore(
    '/t.org',
    '#+TODO: TODO NEXT | DONE\n#+TODO: WAITING MAYBE PROJECT | CANCELLED\n'
  );
  store.dispatch(gtdAddTask({ path: '/t.org' }, { title: 'Uno', list: 'project' }));
  let txt = fileText(store, '/t.org');
  expect(txt).toMatch(/\* PROJECT Uno\n:PROPERTIES:\n:CREATED: \[\d{4}-\d{2}-\d{2}/);
  expect(txt).not.toMatch(/ORDERED/);
  window.localStorage.setItem(LS_NEW_PROJECT_ORDER, 'sequential');
  store.dispatch(gtdAddTask({ path: '/t.org' }, { title: 'Dos', list: 'project' }));
  txt = fileText(store, '/t.org');
  expect(txt).toMatch(/\* PROJECT Dos\n:PROPERTIES:[\s\S]*:ORDERED: t/);
  // una tarea convertida en proyecto también nace secuencial
  store.dispatch(gtdAddTask({ path: '/t.org' }, { title: 'Tres', list: 'next' }));
  const t = tasksOf(store).find((x) => x.title === 'Tres');
  store.dispatch(gtdSaveTask(t, { list: 'project' }));
  expect(tasksOf(store).find((x) => x.title === 'Tres').ordered).toBe(true);
  window.localStorage.removeItem(LS_NEW_PROJECT_ORDER);
});

test('4.55: parseCreated lee [AAAA-MM-DD …] y AAAAMMDD', () => {
  expect(parseCreated('[2026-10-31 Sat 14:39]')).toEqual(new Date(2026, 9, 31));
  expect(parseCreated('20261031')).toEqual(new Date(2026, 9, 31));
  expect(parseCreated('')).toBeNull();
});

test('4.55: reorderIds mueve junto a la fila de destino', () => {
  expect(reorderIds(['a', 'b', 'c', 'd'], 'a', { id: 'c', after: true })).toEqual([
    'b',
    'c',
    'a',
    'd',
  ]);
  expect(reorderIds(['a', 'b', 'c', 'd'], 'd', { id: 'b', after: false })).toEqual([
    'a',
    'd',
    'b',
    'c',
  ]);
  expect(reorderIds(['a', 'b'], 'a', { id: 'a', after: true })).toEqual(['a', 'b']);
});

test('4.55: dropTargetAt elige la fila según la altura', () => {
  const box = document.createElement('div');
  ['a', 'b', 'c'].forEach((id, i) => {
    const el = document.createElement('div');
    el.setAttribute('data-drag-id', id);
    el.getBoundingClientRect = () => ({ top: i * 20, height: 20, bottom: i * 20 + 20 });
    box.appendChild(el);
  });
  expect(dropTargetAt(box, 5, 'c')).toEqual({ id: 'a', after: false });
  expect(dropTargetAt(box, 35, 'a')).toEqual({ id: 'c', after: false });
  expect(dropTargetAt(box, 100, 'a')).toEqual({ id: 'c', after: true });
});

test('4.55: «Descartar las recurrentes» saca la tarea de esa sección', () => {
  const store = makeStore(
    '/t.org',
    '#+TODO: TODO NEXT | DONE\n* NEXT Normal\n* NEXT Repite\nSCHEDULED: <2026-10-01 Thu +1w>\n'
  );
  const today = new Date(2026, 9, 31);
  const rep = () => tasksOf(store).find((x) => x.title === 'Repite');
  expect(listOf(rep(), today)).not.toBeNull();
  setGtdConfig({ sections: { next: { noRecurring: true } } });
  expect(listOf(rep(), today)).not.toBe('next');
  expect(
    listOf(
      tasksOf(store).find((x) => x.title === 'Normal'),
      today
    )
  ).toBe('next');
  setGtdConfig(null);
});
