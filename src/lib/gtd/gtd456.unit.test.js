import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map, Set, fromJS, List } from 'immutable';

import rootReducer from '../../reducers';
import { eliKeepsCheckboxes } from '../../reducers/org';
import { parseFile, setPath, setTodoState } from '../../actions/org';
import { buildTasks, ownTypeOf, propertyValue } from './gtd_model';
import { parseContacts } from './gtd_persons';
import { parseAgendas } from './gtd_agendas';
import { STRICT_REVIEW_STEPS } from './gtd_review';
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
const fileOf = (store, path) => store.getState().org.present.getIn(['files', path]);
const fileText = (store, path) => {
  const f = fileOf(store, path);
  return exportOrg({
    headers: f.get('headers'),
    linesBeforeHeadings: f.get('linesBeforeHeadings'),
    dontIndent: true,
  });
};
const tasksOf = (store) => buildTasks(store.getState().org.present.get('files'));
const TODO = '#+TODO: TODO NEXT | DONE\n';

describe('4.56: :TYPE: (checklist, agenda, persona, meeting)', () => {
  test('ownTypeOf lee :TYPE: en minúsculas; :STYLE: de esos tipos NO cuenta', () => {
    const store = makeStore(
      '/t.org',
      TODO +
        '* Uno\n:PROPERTIES:\n:TYPE: Checklist\n:END:\n' +
        '* Dos\n:PROPERTIES:\n:STYLE: meeting\n:END:\n' +
        '* Tres\n'
    );
    const hs = fileOf(store, '/t.org').get('headers');
    expect(ownTypeOf(hs.get(0))).toBe('checklist');
    expect(ownTypeOf(hs.get(1))).toBeNull();
    expect(ownTypeOf(hs.get(2))).toBeNull();
  });

  test('el tipo es heredable (reunión → sus puntos) y ownType solo el propio', () => {
    const store = makeStore(
      '/t.org',
      TODO + '* Reunión\n:PROPERTIES:\n:TYPE: meeting\n:END:\n** Punto\n*** Subpunto\n* Otra\n'
    );
    const t = tasksOf(store);
    const by = (x) => t.find((y) => y.title === x);
    expect(by('Reunión').type).toBe('meeting');
    expect(by('Reunión').ownType).toBe('meeting');
    expect(by('Punto').type).toBe('meeting');
    expect(by('Punto').ownType).toBeNull();
    expect(by('Subpunto').type).toBe('meeting');
    expect(by('Otra').type).toBeNull();
  });

  test('los hábitos siguen con :STYLE: habit (y :TYPE: habit no es un hábito)', () => {
    const store = makeStore(
      '/t.org',
      TODO +
        '* TODO Correr\nSCHEDULED: <2026-10-01 Thu .+1d>\n:PROPERTIES:\n:STYLE: habit\n:END:\n' +
        '* TODO Leer\n:PROPERTIES:\n:TYPE: habit\n:END:\n'
    );
    const t = tasksOf(store);
    expect(t.find((x) => x.title === 'Correr').isHabit).toBe(true);
    expect(t.find((x) => x.title === 'Leer').isHabit).toBe(false);
  });

  test('personas y agendas exponen su :TYPE:', () => {
    const personas = makeStore(
      '/personas.org',
      '* Ana\n:PROPERTIES:\n:ID: a1\n:TYPE: persona\n:END:\n* Luis\n:PROPERTIES:\n:ID: l1\n:END:\n'
    );
    const contacts = parseContacts(fileOf(personas, '/personas.org'), '/personas.org');
    expect(contacts.find((c) => c.name === 'Ana').type).toBe('persona');
    expect(contacts.find((c) => c.name === 'Luis').type).toBeNull();
    const agendas = makeStore(
      '/agendas.org',
      '* Ana\n:PROPERTIES:\n:TYPE: agenda\n:END:\n** Hablar de X\n'
    );
    const ag = parseAgendas(fileOf(agendas, '/agendas.org'), contacts, '/agendas.org');
    expect(ag.roots[0].type).toBe('agenda');
    expect(ag.roots[0].children[0].type).toBeNull();
  });

  test('propertyValue sigue leyendo TYPE tal cual', () => {
    const store = makeStore('/t.org', TODO + '* A\n:PROPERTIES:\n:TYPE: persona\n:END:\n');
    expect(propertyValue(fileOf(store, '/t.org').get('headers').get(0), 'TYPE')).toBe('persona');
  });
});

describe('4.56: tareas repetidas', () => {
  const repeating = (props, body = '') =>
    TODO +
    '* TODO Pagar\nSCHEDULED: <2026-10-01 Thu +1w>\n' +
    (props ? `:PROPERTIES:\n${props}\n:END:\n` : '') +
    body;
  const done = (store) => {
    const id = fileOf(store, '/t.org').getIn(['headers', 0, 'id']);
    store.dispatch(setTodoState(id, 'DONE'));
  };

  test('DEADLINE_DAYS: el límite se recalcula en cada repetición (nuevo inicio + N días)', () => {
    const store = makeStore('/t.org', repeating(':DEADLINE_DAYS: 3'));
    done(store);
    let txt = fileText(store, '/t.org');
    expect(txt).toMatch(/SCHEDULED: <2026-10-08 \w+ \+1w>/);
    expect(txt).toMatch(/DEADLINE: <2026-10-11 \w+>/);
    expect(txt).not.toMatch(/DEADLINE: <[^>]*\+/);
    done(store);
    txt = fileText(store, '/t.org');
    expect(txt).toMatch(/SCHEDULED: <2026-10-15/);
    expect(txt).toMatch(/DEADLINE: <2026-10-18/);
    // una sola línea DEADLINE
    expect(txt.match(/DEADLINE:/g).length).toBe(1);
  });

  test('sin DEADLINE_DAYS no se crea ningún DEADLINE', () => {
    const store = makeStore('/t.org', repeating(''));
    done(store);
    expect(fileText(store, '/t.org')).not.toMatch(/DEADLINE/);
  });

  test('las casillas se vacían al repetir (como siempre)', () => {
    const store = makeStore('/t.org', repeating('', '- [X] a\n- [X] b\n'));
    done(store);
    const txt = fileText(store, '/t.org');
    expect(txt).toMatch(/- \[ \] a/);
    expect(txt).toMatch(/- \[ \] b/);
  });

  test(':RESET_CHECK_BOXES: nil conserva las casillas', () => {
    const store = makeStore('/t.org', repeating(':RESET_CHECK_BOXES: nil', '- [X] a\n'));
    done(store);
    expect(fileText(store, '/t.org')).toMatch(/- \[X\] a/);
  });

  test('el modelo expone deadlineDays y resetBoxes', () => {
    const store = makeStore('/t.org', repeating(':DEADLINE_DAYS: 5\n:RESET_CHECK_BOXES: nil'));
    const t = tasksOf(store)[0];
    expect(t.deadlineDays).toBe('5');
    expect(t.resetBoxes).toBe(false);
    const s2 = makeStore('/t.org', repeating(''));
    expect(tasksOf(s2)[0].deadlineDays).toBeNull();
    expect(tasksOf(s2)[0].resetBoxes).toBe(true);
  });

  test('eliKeepsCheckboxes: nil/no/f/false/0', () => {
    ['nil', 'NIL', 'no', 'f', 'false', '0'].forEach((v) =>
      expect(eliKeepsCheckboxes(v)).toBe(true)
    );
    ['t', 'yes', '', null].forEach((v) => expect(eliKeepsCheckboxes(v)).toBe(false));
  });
});

describe('4.56: Revisión semanal salta entre secciones', () => {
  test('cada paso estricto lleva a su sección', () => {
    const view = Object.fromEntries(STRICT_REVIEW_STEPS.map((s) => [s.id, s.view]));
    expect(view).toMatchObject({
      loose: 'inbox',
      inbox: 'inbox',
      mind: 'inbox',
      next: 'next',
      past: 'logbook',
      upcoming: 'tickler',
      waiting: 'waiting',
      projects: 'projects',
      goals: 'horizons',
      checklists: 'checklist',
      someday: 'someday',
      creative: 'inbox',
    });
  });
});
