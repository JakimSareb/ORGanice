import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map, Set, fromJS, List } from 'immutable';

import rootReducer from '../../reducers';
import { parseFile } from '../../actions/org';
import { pomodoroLog } from './gtd_actions';
import { exportOrg } from '../export_org';

const makeStore = (path, text) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: Map({
          files: Map(),
          fileSettings: [],
          search: Map({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: Map({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: Map({ isAuthenticated: true }),
      capture: Map().set('captureTemplates', []),
      base: new fromJS({
        customKeybindings: {},
        isLoading: Set(),
        shouldLogIntoDrawer: true,
      }),
    },
    applyMiddleware(thunk)
  );
  store.dispatch(parseFile(path, text));
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

test('4.13: pomodoroLog crea la tarea «Pomodoro» y le apunta un CLOCK cerrado', () => {
  const store = makeStore('/tasks.org', '* NEXT Pintar\n');
  const start = new Date(2026, 9, 21, 12, 0);
  const end = new Date(2026, 9, 21, 12, 25);
  expect(store.dispatch(pomodoroLog(start, end))).toBe(true);
  const text = fileText(store, '/tasks.org');
  expect(text).toMatch(
    /\* Pomodoro\n:LOGBOOK:\nCLOCK: \[2026-10-21 \w+ 12:00\]--\[2026-10-21 \w+ 12:25\]/
  );
  // la segunda vez reutiliza la misma tarea
  expect(store.dispatch(pomodoroLog(end, new Date(2026, 9, 21, 12, 50)))).toBe(true);
  expect(fileText(store, '/tasks.org').match(/\* Pomodoro/g)).toHaveLength(1);
});

test('4.13: pomodoroLog sin fichero de tareas cargado no hace nada', () => {
  const store = makeStore('/otro.org', '* Hola\n');
  expect(store.dispatch(pomodoroLog(new Date(), new Date()))).toBe(false);
});
