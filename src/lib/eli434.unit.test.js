// 4.34: tema Logseq, vista previa de notas en la vista por etiqueta, narrow que pliega subcabeceras
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath, eliNarrowAndExpand, toggleHeaderOpened } from '../actions/org';
import { notePreview } from './eli_heading_index';
import { themes } from './color';

const makeStore = (path, text) => {
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
      base: fromJS({ customKeybindings: {}, isLoading: Set() }),
    },
    applyMiddleware(thunk)
  );
  store.dispatch(parseFile(path, text));
  store.dispatch(setPath(path));
  return store;
};

test('vista previa: dos líneas de notas, sin cajones ni planificación', () => {
  const notes = `SCHEDULED: <2026-10-25 dom>
:LOGBOOK:
CLOCK: [2026-10-25 dom 10:00]
:END:

Primera línea de notas.
#+BEGIN_SRC
Segunda línea.
Tercera línea.
`;
  expect(notePreview(notes, 2)).toEqual(['Primera línea de notas.', 'Segunda línea.']);
  expect(notePreview('', 2)).toEqual([]);
  expect(notePreview('x'.repeat(300), 1)[0].length).toBe(161);
});

test('tema Logseq: claro y oscuro con las mismas variables que Unicornio', () => {
  expect(themes.Logseq).toBeTruthy();
  ['Light', 'Dark'].forEach((scheme) => {
    expect(Object.keys(themes.Logseq[scheme]).sort()).toEqual(
      Object.keys(themes.Unicornio[scheme]).sort()
    );
  });
});

test('narrow: tocar el título del reducido pliega sus subcabeceras abiertas (con el ajuste)', () => {
  const store = makeStore('/n.org', '* Raíz\n** Hija A\n*** Nieta\n** Hija B\n*** Nieta B\n');
  const headers = () => store.getState().org.present.getIn(['files', '/n.org', 'headers']);
  const idOf = (title) =>
    headers()
      .find((h) => h.getIn(['titleLine', 'rawTitle']) === title)
      .get('id');
  const opened = (title) =>
    headers()
      .find((h) => h.getIn(['titleLine', 'rawTitle']) === title)
      .get('opened');
  store.dispatch(eliNarrowAndExpand(idOf('Raíz'), { titlesOnly: false, hideBody: false }));
  expect(opened('Hija A')).toBe(true);
  expect(opened('Hija B')).toBe(true);
  store.dispatch(toggleHeaderOpened(idOf('Raíz'), true));
  expect(opened('Raíz')).toBe(true);
  expect(opened('Hija A')).toBe(false);
  expect(opened('Hija B')).toBe(false);
});
