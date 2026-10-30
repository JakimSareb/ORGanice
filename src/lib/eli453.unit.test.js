// 4.53: ciclo de visibilidad (S-TAB de Org), enlaces con formato y saltos de enlace en el historial
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import {
  parseFile,
  setPath,
  eliFollowOrgLink,
  eliRestoreView,
  eliCurrentView,
  eliCycleVisibility,
  eliNarrowAndExpand,
} from '../actions/org';
import { parseMarkupAndCookies } from './parse_org';
import { eliVisibilityStage } from '../reducers/org';
import { installNavHistory, setViewRestorer, canGoBack, goBack } from './eli_nav_history';

const makeStore = (files) => {
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
      base: fromJS({ customKeybindings: {}, isLoading: Set(), shouldLogIntoDrawer: true }),
    },
    applyMiddleware(thunk)
  );
  Object.keys(files).forEach((p) => store.dispatch(parseFile(p, files[p])));
  store.dispatch(setPath(Object.keys(files)[0]));
  return store;
};

const DOC = '* A\nnotas de A\n** B\nnotas de B\n*** C\n* D\n** E\n';
const flags = (store, path = '/d.org') =>
  store
    .getState()
    .org.present.getIn(['files', path, 'headers'])
    .map((h) => ({
      t: h.getIn(['titleLine', 'rawTitle']),
      o: !!h.get('opened'),
      hide: !!h.get('eliHideBody'),
    }));

describe('4.53 Ciclo de visibilidad CERRADA → HIJOS → TODO', () => {
  test('cicla las tres etapas y vuelve a CERRADA', () => {
    const store = makeStore({ '/d.org': DOC });
    store.dispatch({ type: 'ELI_SET_ALL_OPENED', opened: false });
    const headers = () => store.getState().org.present.getIn(['files', '/d.org', 'headers']);
    expect(eliVisibilityStage(headers(), null)).toBe(0);

    store.dispatch(eliCycleVisibility()); // HIJOS: solo el nivel 1 abierto
    let f = flags(store).toArray();
    expect(f.map((x) => x.o)).toEqual([true, false, false, true, false]);
    expect(eliVisibilityStage(headers(), null)).toBe(1);

    store.dispatch(eliCycleVisibility()); // TODO
    f = flags(store).toArray();
    expect(f.every((x) => x.o && !x.hide)).toBe(true);
    expect(eliVisibilityStage(headers(), null)).toBe(2);

    store.dispatch(eliCycleVisibility()); // CERRADA
    f = flags(store).toArray();
    expect(f.every((x) => !x.o)).toBe(true);
    expect(eliVisibilityStage(headers(), null)).toBe(0);
  });

  test('un estado intermedio (abierto a mano) pasa a CERRADA', () => {
    const store = makeStore({ '/d.org': DOC });
    store.dispatch({ type: 'ELI_SET_ALL_OPENED', opened: false });
    store.dispatch(eliCycleVisibility()); // HIJOS
    // se abre a mano una subcabecera: ya no es ninguna de las tres etapas
    const id = store.getState().org.present.getIn(['files', '/d.org', 'headers', 1, 'id']);
    store.dispatch({
      type: 'TOGGLE_HEADER_OPENED',
      headerId: id,
      closeSubheadersRecursively: false,
    });
    store.dispatch(eliCycleVisibility());
    expect(
      flags(store)
        .toArray()
        .every((x) => !x.o)
    ).toBe(true);
  });

  test('con la vista reducida solo cuenta esa cabecera y sus descendientes', () => {
    const store = makeStore({ '/d.org': DOC });
    const a = store.getState().org.present.getIn(['files', '/d.org', 'headers', 0, 'id']);
    store.dispatch(eliNarrowAndExpand(a, { titlesOnly: true, hideBody: true }));
    store.dispatch({ type: 'ELI_SET_ALL_OPENED', opened: false });
    const headers = () => store.getState().org.present.getIn(['files', '/d.org', 'headers']);
    expect(eliVisibilityStage(headers(), a)).toBe(0);
    store.dispatch(eliCycleVisibility()); // HIJOS: A con sus notas, B plegada
    let f = flags(store).toArray();
    expect(f[0]).toMatchObject({ o: true, hide: false });
    expect(f[1].o).toBe(false);
    expect(eliVisibilityStage(headers(), a)).toBe(1);
    store.dispatch(eliCycleVisibility()); // TODO
    f = flags(store).toArray();
    expect([f[0].o, f[1].o, f[2].o]).toEqual([true, true, true]);
    // lo de fuera de la vista reducida no se toca (D y E siguen como estaban)
    expect(f[3].o).toBe(false);
  });
});

describe('4.53 Enlaces con formato', () => {
  const markup = (raw) => parseMarkupAndCookies(raw).find((p) => p.type === 'inline-markup');

  test.each([
    ['*', 'bold'],
    ['/', 'italic'],
    ['_', 'underline'],
    ['=', 'verbatim'],
    ['~', 'inline-code'],
    ['+', 'strikethrough'],
  ])('«%s» envolviendo un enlace', (m, type) => {
    const p = markup(`mira ${m}[[https://a.com/x][texto]]${m} ya`);
    expect(p).toBeTruthy();
    expect(p.markupType).toBe(type);
    expect(p.content).toBe('[[https://a.com/x][texto]]');
  });

  test('el enlace se toma entero aunque su dirección lleve el mismo carácter', () => {
    const slash = markup('/[[https://a.com/x/y][texto]]/');
    expect(slash.content).toBe('[[https://a.com/x/y][texto]]');
    const under = markup('_[[https://a.com/x_y_z]]_');
    expect(under.content).toBe('[[https://a.com/x_y_z]]');
  });

  test('el formato de siempre sigue igual', () => {
    expect(markup('un *negrita* aquí').content).toBe('negrita');
    expect(markup('un */mixto/* aquí').content).toBe('/mixto/');
  });
});

describe('4.53 Atrás/adelante recorre los saltos de enlace', () => {
  test('un enlace a otro fichero guarda la vista de origen (reducida, seleccionada) y atrás la restaura', async () => {
    const store = makeStore({
      '/l.org':
        '* Origen\n:PROPERTIES:\n:ID: ORI\n:END:\ntexto\n* Destino\n:PROPERTIES:\n:ID: DST\n:END:\n',
      '/m.org': '* Más\n',
    });
    const history = require('history').createMemoryHistory({ initialEntries: ['/file/l.org'] });
    installNavHistory(history);
    setViewRestorer((v) => store.dispatch(eliRestoreView(v)));
    const narrowOf = () =>
      store.getState().org.present.getIn(['files', '/l.org', 'narrowedHeaderId']);
    // ir a «Destino» (reduce) y de ahí a otro FICHERO por ruta (sin cabecera de destino)
    await store.dispatch(eliFollowOrgLink('id:DST'));
    const reduced = narrowOf();
    expect(reduced).toBeTruthy();
    const view = eliCurrentView(store.getState());
    expect(view.narrowId).toBe(reduced);
    expect(view).toHaveProperty('selId');
    expect(view).toHaveProperty('scrollY');
    await store.dispatch(eliFollowOrgLink('file:m.org'));
    expect(history.location.pathname).toBe('/file/m.org');
    expect(canGoBack()).toBe(true);
    goBack(history);
    await new Promise((r) => setTimeout(r, 30));
    expect(history.location.pathname).toBe('/file/l.org');
    expect(narrowOf()).toBe(reduced); // vuelve con la cabecera reducida de antes
    setViewRestorer(null);
  });
});
