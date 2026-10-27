// 4.40: tablas alineadas en el texto en todos los caminos, elementos de lista (plegar y flechas),
// acciones en lote (quitar fechas, enlaces) y recuadro de selección de GTD.
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath } from '../actions/org';
import { multiActions, multiLinks } from './eli_multi_select';
import {
  visibleListItems,
  listKeyAction,
  setListFolded,
  clearListFold,
  isListFolded,
  toggleListFold,
  itemHasChildren,
} from './eli_list_fold';
import { rowsTouching } from '../components/Gtd/gtdMarquee';

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

const TABLA = '* Uno\n| a | b |\n|---+---|\n| 1 | 22 |\n* Dos\n| x | y |\n| zzz | w |\n';

describe('4.40 D: tablas alineadas en todos los caminos', () => {
  test('editar una celda con la acción antigua deja TODAS las filas con los | en su sitio', () => {
    const store = makeStore({ '/a.org': TABLA });
    const h = headersOf(store).get(0);
    const table = h.get('description').find((p) => p.get('type') === 'table');
    const cell = table.getIn(['contents', 0, 'contents', 0, 'id']);
    store.dispatch({
      type: 'UPDATE_TABLE_CELL_VALUE',
      cellId: cell,
      newValue: 'largo',
      dirtying: true,
    });
    const raw = headersOf(store).get(0).get('rawDescription');
    const lines = raw.split('\n').filter((l) => l.trim().startsWith('|'));
    const pipes = (l) =>
      [...l].map((c, i) => (c === '|' || c === '+' ? i : -1)).filter((i) => i >= 0);
    lines.forEach((l) => expect(pipes(l)).toEqual(pipes(lines[0])));
    expect(lines[0]).toContain('largo');
    // la otra tabla (otra cabecera) no se ha tocado
    expect(headersOf(store).get(1).get('rawDescription')).toContain('| x | y |');
  });

  test('es idempotente: volver a guardar lo mismo no cambia el texto', () => {
    const store = makeStore({ '/a.org': TABLA });
    const h = headersOf(store).get(0);
    const table = h.get('description').find((p) => p.get('type') === 'table');
    const cell = table.getIn(['contents', 0, 'contents', 0, 'id']);
    store.dispatch({
      type: 'UPDATE_TABLE_CELL_VALUE',
      cellId: cell,
      newValue: 'largo',
      dirtying: true,
    });
    const once = headersOf(store).get(0).get('rawDescription');
    const cell2 = headersOf(store)
      .get(0)
      .get('description')
      .find((p) => p.get('type') === 'table')
      .getIn(['contents', 0, 'contents', 0, 'id']);
    store.dispatch({
      type: 'UPDATE_TABLE_CELL_VALUE',
      cellId: cell2,
      newValue: 'largo',
      dirtying: true,
    });
    expect(headersOf(store).get(0).get('rawDescription')).toBe(once);
  });

  test('cargar un fichero no reescribe sus tablas', () => {
    const store = makeStore({ '/a.org': TABLA });
    expect(headersOf(store).get(1).get('rawDescription')).toContain('| x | y |');
  });
});

describe('4.40 B: acciones en lote', () => {
  const FILE =
    '* TODO Uno\nSCHEDULED: <2026-10-27 mar> DEADLINE: <2026-10-30 vie>\n* TODO Dos\n* Tres\n';
  test('unplan quita las dos fechas de las cabeceras que las tienen', () => {
    const store = makeStore({ '/a.org': FILE });
    const hs = headersOf(store);
    const ids = hs.map((h) => h.get('id')).toArray();
    const acts = multiActions(hs, ids, 'unplan');
    expect(acts.length).toBe(2);
    expect(acts.map((a) => a.type)).toEqual(['REMOVE_PLANNING_ITEM', 'REMOVE_PLANNING_ITEM']);
    // de atrás adelante: índices 1 y 0
    expect(acts.map((a) => a.planningItemIndex)).toEqual([1, 0]);
    acts.forEach((a) => store.dispatch(a));
    expect(headersOf(store).get(0).get('planningItems').size).toBe(0);
  });
  test('multiLinks da un enlace por ID por cabecera y pone :ID: a las que no lo tienen', () => {
    const store = makeStore({
      '/a.org': '* Uno\n:PROPERTIES:\n:ID: AAA\n:END:\n* Dos\n',
    });
    const hs = headersOf(store);
    const r = multiLinks(hs, hs.map((h) => h.get('id')).toArray(), () => 'NUEVO');
    expect(r.text.split('\n')).toEqual(['[[id:AAA][Uno]]', '[[id:NUEVO][Dos]]']);
    expect(r.actions.length).toBe(1);
    expect(r.actions[0].type).toBe('UPDATE_PROPERTY_LIST_ITEMS');
  });
});

describe('4.40 A: elementos de lista', () => {
  const FILE = '* Cab\n- a\n  - a1\n  - a2\n- b\n- c\n  - c1\n* Otra\n';
  const load = () => {
    const store = makeStore({ '/a.org': FILE });
    return headersOf(store);
  };
  beforeEach(() => clearListFold());
  const idOf = (headers, text) => {
    const found = visibleListItems(headers.get(0).get('description'), new Set()).find(() => true);
    expect(found).toBeTruthy();
    const all = [];
    const walk = (parts) =>
      parts.forEach((p) => {
        if (p.get('type') !== 'list') return;
        p.get('items').forEach((it) => {
          all.push(it);
          walk(it.get('contents'));
        });
      });
    walk(headers.get(0).get('description'));
    const it = all.find((x) => JSON.stringify(x.get('titleLine').toJS()).includes(`"${text}"`));
    return it.get('id');
  };

  test('los elementos visibles salen en orden y plegar esconde los hijos', () => {
    const hs = load();
    const todos = visibleListItems(hs.get(0).get('description'), new Set());
    expect(todos.length).toBe(6);
    const a = idOf(hs, 'a');
    const plegado = visibleListItems(hs.get(0).get('description'), new Set([String(a)]));
    expect(plegado.length).toBe(4);
    expect(plegado[0]).toMatchObject({ hasChildren: true, folded: true });
  });

  test('↑/↓ se mueven entre elementos y en el borde pasan a la cabecera', () => {
    const hs = load();
    const a = idOf(hs, 'a');
    const a1 = idOf(hs, 'a1');
    const b = idOf(hs, 'b');
    const c1 = idOf(hs, 'c1');
    expect(listKeyAction(hs, a, 'down', new Set())).toEqual({ type: 'select', id: String(a1) });
    // con «a» plegado, bajar salta a «b»
    expect(listKeyAction(hs, a, 'down', new Set([String(a)]))).toEqual({
      type: 'select',
      id: String(b),
    });
    expect(listKeyAction(hs, a, 'up', new Set())).toEqual({
      type: 'header',
      headerId: hs.get(0).get('id'),
      next: false,
    });
    expect(listKeyAction(hs, c1, 'down', new Set())).toEqual({
      type: 'header',
      headerId: hs.get(0).get('id'),
      next: true,
    });
  });

  test('←/→: plegar, desplegar, ir al padre', () => {
    const hs = load();
    const a = idOf(hs, 'a');
    const a1 = idOf(hs, 'a1');
    const b = idOf(hs, 'b');
    expect(listKeyAction(hs, a, 'left', new Set())).toEqual({ type: 'fold', id: String(a) });
    expect(listKeyAction(hs, a, 'right', new Set([String(a)]))).toEqual({
      type: 'unfold',
      id: String(a),
    });
    expect(listKeyAction(hs, a1, 'left', new Set())).toEqual({ type: 'select', id: String(a) });
    expect(listKeyAction(hs, b, 'left', new Set())).toBeNull(); // sin hijos ni padre
    expect(listKeyAction(hs, b, 'right', new Set())).toBeNull();
  });

  test('el estado de plegado es solo visual y se alterna', () => {
    expect(isListFolded('x')).toBe(false);
    toggleListFold('x');
    expect(isListFolded('x')).toBe(true);
    setListFolded('x', false);
    expect(isListFolded('x')).toBe(false);
    const hs = load();
    const a = hs
      .get(0)
      .get('description')
      .find((p) => p.get('type') === 'list')
      .get('items')
      .get(0);
    expect(itemHasChildren(a)).toBe(true);
  });
});

describe('4.40 C: recuadro de selección', () => {
  const rects = [
    { key: 'a', left: 0, top: 0, right: 100, bottom: 20 },
    { key: 'b', left: 0, top: 30, right: 100, bottom: 50 },
    { key: 'c', left: 0, top: 60, right: 100, bottom: 80 },
  ];
  test('toca (no hace falta cubrir entero) y vale en cualquier orden de esquinas', () => {
    expect(rowsTouching(rects, { x0: 50, y0: 45, x1: 120, y1: 65 })).toEqual(['b', 'c']);
    expect(rowsTouching(rects, { x0: 120, y0: 65, x1: 50, y1: 45 })).toEqual(['b', 'c']);
  });
  test('fuera de las filas no selecciona nada; el borde justo no cuenta', () => {
    expect(rowsTouching(rects, { x0: 200, y0: 0, x1: 300, y1: 100 })).toEqual([]);
    expect(rowsTouching(rects, { x0: 0, y0: 20, x1: 100, y1: 30 })).toEqual([]);
    expect(rowsTouching([], { x0: 0, y0: 0, x1: 1, y1: 1 })).toEqual([]);
  });
});
