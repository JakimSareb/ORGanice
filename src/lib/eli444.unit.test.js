// 4.44: soltar una selección fuera del cuadro (D), secciones con texto plegables y entrar en la
// lista desde la cabecera (A), árbol de cabeceras heredadas en GTD (B) y áreas nuevas (C).
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath } from '../actions/org';
import { textFieldOf, isSpuriousClick } from './eli_drag_click_guard';
import { itemHasChildren, firstListItemId, lastListItemId } from './eli_list_fold';
import { areaChoices, horizonsHasArea } from './gtd/gtd_horizons';
import { nestRefKids } from './gtd/gtd_model';
import { isNotesPlain, setNotesPlain } from './eli_notes_plain';

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
const headersOf = (store, path = '/a.org') =>
  store.getState().org.present.getIn(['files', path, 'headers']);

describe('4.44 D: soltar una selección fuera del cuadro no es un clic', () => {
  test('el campo de texto y el clic de mentira', () => {
    document.body.innerHTML =
      '<div id="notes"><ul><li><textarea id="ta"></textarea></li></ul>' +
      '<input id="cb" type="checkbox"/><input id="tx"/></div>';
    const ta = document.getElementById('ta');
    expect(textFieldOf(ta)).toBe(ta);
    expect(textFieldOf(document.getElementById('cb'))).toBeNull();
    expect(textFieldOf(document.getElementById('tx'))).toBe(document.getElementById('tx'));
    expect(textFieldOf(document.getElementById('notes'))).toBeNull();
    // el clic llega al antepasado común (la lista, las notas): no vale
    expect(isSpuriousClick(ta, document.querySelector('li'))).toBe(true);
    expect(isSpuriousClick(ta, document.getElementById('notes'))).toBe(true);
    // dentro del propio cuadro sí vale
    expect(isSpuriousClick(ta, ta)).toBe(false);
    expect(isSpuriousClick(null, ta)).toBe(false);
  });
});

describe('4.44 A: secciones con texto debajo y entrar en la lista', () => {
  const FILE = '* Cab\n- Uno\n  texto de uno\n- Dos\n- Tres\n  - Hija\n* Otra\n';
  test('una sección con texto debajo se puede plegar; una sin nada, no', () => {
    const items = headersOf(makeStore({ '/a.org': FILE }))
      .get(0)
      .get('description')
      .find((p) => p.get('type') === 'list')
      .get('items');
    expect(itemHasChildren(items.get(0))).toBe(true);
    expect(itemHasChildren(items.get(1))).toBe(false);
    expect(itemHasChildren(items.get(2))).toBe(true);
  });
  test('primer y último elemento visibles de las notas', () => {
    const hs = headersOf(makeStore({ '/a.org': FILE }));
    const desc = hs.get(0).get('description');
    const items = desc.find((p) => p.get('type') === 'list').get('items');
    expect(firstListItemId(desc, new Set())).toBe(items.get(0).get('id'));
    // con «Tres» desplegado, el último es su hija; plegado, «Tres»
    const tres = items.get(2);
    const hija = tres
      .get('contents')
      .find((p) => p.get('type') === 'list')
      .get('items')
      .get(0);
    expect(lastListItemId(desc, new Set())).toBe(hija.get('id'));
    expect(lastListItemId(desc, new Set([String(tres.get('id'))]))).toBe(tres.get('id'));
    expect(firstListItemId(hs.get(1).get('description'), new Set())).toBeNull();
  });
});

describe('4.44 E: notas en texto plano', () => {
  test('apagado por defecto; se guarda', () => {
    window.localStorage.removeItem('eliNotesPlain');
    expect(isNotesPlain()).toBe(false);
    setNotesPlain(true);
    expect(isNotesPlain()).toBe(true);
    setNotesPlain(false);
    expect(isNotesPlain()).toBe(false);
  });
});

describe('4.44 B: vista de una etiqueta en GTD', () => {
  const t = (id, extra = {}) => ({
    key: `/a.org::${id}`,
    path: '/a.org',
    id,
    parentId: null,
    ...extra,
  });
  const madre = t('m', { isProject: true, keyword: 'TODO' });
  const sub = t('s', { parentId: 'm' });
  const subsub = t('ss', { parentId: 's' });
  const tarea = t('k', { parentId: 'm', keyword: 'TODO' });
  const all = [madre, sub, subsub, tarea];
  const row = (task) => ({ kind: 'task', task, section: 'x' });
  const items = [row(madre), row(sub), row(subsub), row(tarea)];
  const id = (x) => x.id;
  const keys = (list) => list.map((i) => i.task.id);
  test('las cabeceras sin estado van dentro de su madre; las tareas siguen sueltas', () => {
    const plegado = nestRefKids(items, all, new Set(), id, { headingsOnly: true });
    expect(keys(plegado)).toEqual(['m', 'k']);
    expect(plegado[0]).toMatchObject({ hasKids: true, folded: true });
    const abierto = nestRefKids(items, all, new Set(['m', 's']), id, { headingsOnly: true });
    expect(abierto.map((i) => [i.task.id, i.depth || 0])).toEqual([
      ['m', 0],
      ['s', 1],
      ['ss', 2],
      ['k', 0],
    ]);
  });
});

describe('4.44 C: áreas de horizons.org en el editor de tarea', () => {
  const h = { areaList: [{ name: 'Casa' }, { name: 'Trabajo' }] };
  const tasks = [{ area: 'casa' }, { area: 'Salud' }, { area: null }];
  test('horizons.org + las usadas, sin repetir', () => {
    expect(areaChoices(h, tasks)).toEqual(['Casa', 'Salud', 'Trabajo']);
    expect(areaChoices(null, tasks)).toEqual(['casa', 'Salud']);
  });
  test('¿ya está?', () => {
    expect(horizonsHasArea(h, ' trabajo ')).toBe(true);
    expect(horizonsHasArea(h, 'Jardín')).toBe(false);
    expect(horizonsHasArea(null, 'Casa')).toBe(false);
  });
});
