import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { exportOrg } from '../export_org';
import rootOrgReducer from '../../reducers/org';
import { setGtdConfig } from './gtd_sections';
import { buildTasks, tagsForList } from './gtd_model';
import { gtdSaveTask } from './gtd_actions';

const P = '/p.org';
const text = [
  '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED',
  '* TODO Suelta A',
  '* NEXT Suelta B :casa:',
  '* TODO Con fecha',
  'SCHEDULED: <2026-10-20 Tue +4w>',
  '* TODO Desde hoy',
  'SCHEDULED: <2026-10-05 Mon .+4w>',
  '* TODO Sin atrasos',
  'SCHEDULED: <2026-10-05 Mon ++4w>',
  '* TODO Con fecha límite',
  'DEADLINE: <2026-10-05 Mon .+4w>',
  '',
].join('\n');

const makeStore = () => {
  let state = Map({ path: null, files: Map({ [P]: parseOrg(text) }), fileSettings: List() });
  const getState = () => ({ org: { present: state }, base: Map() });
  const dispatch = (a) => {
    if (typeof a === 'function') return a(dispatch, getState);
    state = rootOrgReducer(state, a);
    return a;
  };
  return { dispatch, state: () => state };
};
const tasksOf = (st) => buildTasks(st.get('files'), []);
const textOf = (st) =>
  exportOrg({
    headers: st.getIn(['files', P, 'headers']),
    linesBeforeHeadings: st.getIn(['files', P, 'linesBeforeHeadings']) || List(),
    dontIndent: false,
  });

beforeAll(() => setGtdConfig(null));

describe('2.17: etiquetas de una tarea', () => {
  test('añadir una etiqueta a una tarea sin etiquetas se guarda en el fichero', () => {
    const store = makeStore();
    const t = tasksOf(store.state()).find((x) => x.title === 'Suelta A');
    // como hace el editor: tagsForList(task, lista, etiquetas finales)
    const tags = tagsForList(t, t.list, [...(t.ownTags || []), 'oficina']);
    store.dispatch(gtdSaveTask(t, { tags }));
    expect(textOf(store.state())).toMatch(/\* TODO Suelta A\s+:oficina:/);
    const again = tasksOf(store.state()).find((x) => x.title === 'Suelta A');
    expect(again.ownTags).toEqual(['oficina']);
  });

  test('añadir otra etiqueta a una que ya tiene conserva las dos', () => {
    const store = makeStore();
    const t = tasksOf(store.state()).find((x) => x.title === 'Suelta B');
    const tags = tagsForList(t, t.list, [...t.ownTags, 'oficina']);
    store.dispatch(gtdSaveTask(t, { tags }));
    const again = tasksOf(store.state()).find((x) => x.title === 'Suelta B');
    expect(again.ownTags).toEqual(['casa', 'oficina']);
  });
});

describe('2.17: tareas repetitivas al marcarlas hechas', () => {
  const doneOf = (text, title) => {
    let state = Map({ path: null, files: Map({ [P]: parseOrg(text) }), fileSettings: List() });
    const getState = () => ({ org: { present: state }, base: Map() });
    const dispatch = (a) => {
      if (typeof a === 'function') return a(dispatch, getState);
      state = rootOrgReducer(state, a);
      return a;
    };
    const t = tasksOf(state).find((x) => x.title === title);
    dispatch(gtdSaveTask(t, { list: 'done' }));
    return {
      task: tasksOf(state).find((x) => x.title === title),
      out: textOf(state),
    };
  };
  const today = new Date();
  const inFourWeeks = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 28);
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
      2,
      '0'
    )}`;

  test('+4w (desde la fecha) avanza 4 semanas y vuelve a TODO', () => {
    const { task, out } = doneOf(text, 'Con fecha');
    expect(task.keyword).toBe('TODO');
    expect(out).toMatch(/SCHEDULED: <2026-11-17 Tue \+4w>/);
  });

  test('.+4w (desde hoy) avanza hasta dentro de 4 semanas y vuelve a TODO', () => {
    const { task, out } = doneOf(text, 'Desde hoy');
    expect(task.keyword).toBe('TODO');
    expect(out).toContain(`<${ymd(inFourWeeks)} `);
    expect(out).not.toContain('SCHEDULED: <2026-10-05 Mon .+4w>');
  });

  test('con DEADLINE .+4w también avanza', () => {
    const { task, out } = doneOf(text, 'Con fecha límite');
    expect(task.keyword).toBe('TODO');
    expect(out).toContain(`DEADLINE: <${ymd(inFourWeeks)} `);
  });

  // Regresión: con dos secuencias #+TODO, terminar una tarea que está en un estado de la segunda
  // la dejaba en DONE con la fecha sin avanzar
  const twoSets = (kw) =>
    [
      '#+TODO: TODO NEXT | DONE',
      '#+TODO: WAITING MAYBE | CANCELLED',
      `* ${kw} A`,
      'SCHEDULED: <2026-10-05 Mon .+4w>',
      '',
    ].join('\n');

  test('con dos secuencias #+TODO: WAITING repetitiva avanza la fecha y no queda en DONE', () => {
    const { task, out } = doneOf(twoSets('WAITING'), 'A');
    expect(task.isDone).toBeFalsy();
    expect(out).toContain(`SCHEDULED: <${ymd(inFourWeeks)} `);
    expect(out).not.toMatch(/\* DONE A/);
  });

  test('sin repetición, WAITING → DONE sigue terminando la tarea (CLOSED)', () => {
    const plain = ['#+TODO: TODO NEXT | DONE', '#+TODO: WAITING MAYBE | CANCELLED', '* WAITING A', ''].join(
      '\n'
    );
    const { task, out } = doneOf(plain, 'A');
    expect(task.isDone).toBe(true);
    expect(out).toMatch(/\* DONE A\n\s+CLOSED: \[/);
  });
});

describe('2.17: fecha de creación en tareas nuevas', () => {
  const { gtdAddTask, createdLine } = require('./gtd_actions');

  test('createdLine tiene el formato de Emacs', () => {
    expect(createdLine(new Date(2026, 9, 3, 19, 55))).toBe(':Created: [2026-10-03 Sat 19:55]');
  });

  test('una tarea nueva lleva :Created: y sus notas', () => {
    const store = makeStore();
    store.dispatch(gtdAddTask({ path: P }, { title: 'Nueva', keyword: 'TODO', created: true, notes: 'algo' }));
    const out = textOf(store.state());
    expect(out).toMatch(/\* TODO Nueva\n:Created: \[\d{4}-\d\d-\d\d \w{3} \d\d:\d\d\]\nalgo/);
  });

  test('con fecha programada, la planificación va antes de :Created:', () => {
    const store = makeStore();
    store.dispatch(
      gtdAddTask(
        { path: P },
        { title: 'Con fecha', keyword: 'TODO', created: true, scheduled: new Date(2026, 9, 20) }
      )
    );
    const out = textOf(store.state());
    expect(out).toMatch(/\* TODO Con fecha\n\s*SCHEDULED: <2026-10-20 Tue>\n:Created:/);
  });

  test('sin created no se añade nada', () => {
    const store = makeStore();
    store.dispatch(gtdAddTask({ path: P }, { title: 'Sin', keyword: 'TODO' }));
    expect(textOf(store.state())).not.toMatch(/:Created:/);
  });
});
