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
    const plain = [
      '#+TODO: TODO NEXT | DONE',
      '#+TODO: WAITING MAYBE | CANCELLED',
      '* WAITING A',
      '',
    ].join('\n');
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

  // (3.10) ahora como propiedad :CREATED: dentro del cajón
  test('una tarea nueva lleva :CREATED: y sus notas', () => {
    const store = makeStore();
    store.dispatch(
      gtdAddTask({ path: P }, { title: 'Nueva', keyword: 'TODO', created: true, notes: 'algo' })
    );
    const out = textOf(store.state());
    expect(out).toMatch(
      /\* TODO Nueva\n\s*:PROPERTIES:\n\s*:CREATED: \[\d{4}-\d\d-\d\d \w{3} \d\d:\d\d\]\n\s*:END:\nalgo/
    );
  });

  test('con fecha programada, la planificación va antes de :PROPERTIES: (:CREATED:)', () => {
    const store = makeStore();
    store.dispatch(
      gtdAddTask(
        { path: P },
        { title: 'Con fecha', keyword: 'TODO', created: true, scheduled: new Date(2026, 9, 20) }
      )
    );
    const out = textOf(store.state());
    expect(out).toMatch(
      /\* TODO Con fecha\n\s*SCHEDULED: <2026-10-20 Tue>\n\s*:PROPERTIES:\n\s*:CREATED:/
    );
  });

  test('sin created no se añade nada', () => {
    const store = makeStore();
    store.dispatch(gtdAddTask({ path: P }, { title: 'Sin', keyword: 'TODO' }));
    expect(textOf(store.state())).not.toMatch(/:Created:|:CREATED:/);
  });
});

describe('2.17: «Abrir» muestra el encabezado con los subencabezados plegados', () => {
  const nested = '* TODO Padre\n** TODO Hija\n*** Nieta\n** Otra\n* Aparte\n';
  const run = (titlesOnly) => {
    let state = Map({ path: P, files: Map({ [P]: parseOrg(nested) }), fileSettings: List() });
    const id = state.getIn(['files', P, 'headers', 0, 'id']);
    state = rootOrgReducer(state, { type: 'ELI_OPEN_SUBTREE', headerId: id, titlesOnly });
    return state
      .getIn(['files', P, 'headers'])
      .map((h) => !!h.get('opened'))
      .toJS();
  };
  test('solo títulos: se abre el padre y nada más', () => {
    expect(run(true)).toEqual([true, false, false, false, false]);
  });
  test('sin la opción, se abre todo el subárbol como antes', () => {
    expect(run(false)).toEqual([true, true, true, true, false]);
  });
});

describe('2.17: inbox.org → tasks.org al darle estado', () => {
  const { gtdRefileInbox, tasksFileForRefile } = require('./gtd_actions');
  const INBOX = '/inbox.org';
  const TASKS = '/tasks.org';
  const todo = '#+TODO: TODO NEXT | DONE\n';
  const twoFiles = () => {
    let state = Map({
      path: null,
      files: Map({
        [INBOX]: parseOrg(`${todo}* Sin estado\n* Otra sin estado\n* Con hijos\n** TODO hija\n`),
        [TASKS]: parseOrg(`${todo}* TODO Existente\n`),
      }),
      fileSettings: List(),
    });
    const getState = () => ({ org: { present: state }, base: Map() });
    const dispatch = (a) => {
      if (typeof a === 'function') return a(dispatch, getState);
      state = rootOrgReducer(state, a);
      return a;
    };
    const tasks = () => buildTasks(state.get('files'), [INBOX]);
    const titles = (p) =>
      state
        .getIn(['files', p, 'headers'])
        .map((h) => h.getIn(['titleLine', 'rawTitle']))
        .toJS();
    return { dispatch, tasks, titles, state: () => state };
  };

  test('el fichero de tareas se encuentra por nombre', () => {
    const s = twoFiles();
    expect(tasksFileForRefile({ org: { present: s.state() } })).toBe(TASKS);
  });

  test('dar estado a una tarea sin estado de inbox.org la pasa a tasks.org', () => {
    const s = twoFiles();
    const t = s.tasks().find((x) => x.title === 'Sin estado');
    s.dispatch(gtdSaveTask(t, { list: 'next' }));
    expect(s.titles(INBOX)).not.toContain('Sin estado');
    expect(s.titles(TASKS)).toContain('Sin estado');
    const moved = s.tasks().find((x) => x.title === 'Sin estado');
    expect(moved.path).toBe(TASKS);
    expect(moved.keyword).toBe('NEXT');
  });

  test('un cambio sin estado (p. ej. una etiqueta) la deja en inbox.org', () => {
    const s = twoFiles();
    const t = s.tasks().find((x) => x.title === 'Otra sin estado');
    s.dispatch(gtdSaveTask(t, { tags: ['casa'] }));
    const after = s.tasks().find((x) => x.title === 'Otra sin estado');
    expect(after.path).toBe(INBOX);
    expect(after.ownTags).toEqual(['casa']);
  });

  test('una tarea de tasks.org no se mueve al cambiar de estado', () => {
    const s = twoFiles();
    const t = s.tasks().find((x) => x.title === 'Existente');
    s.dispatch(gtdSaveTask(t, { list: 'next' }));
    expect(s.tasks().find((x) => x.title === 'Existente').path).toBe(TASKS);
  });

  test('«Refile» pasa a tasks.org las de primer nivel con estado y deja las demás', () => {
    const s = twoFiles();
    // una con estado en el fichero de entrada
    const t = s.tasks().find((x) => x.title === 'Con hijos');
    // darle estado a mano sin moverla: se escribe el estado directamente en el fichero
    s.dispatch({
      type: 'ELI_IN_FILE',
      path: INBOX,
      inner: [{ type: 'SET_TODO_STATE', headerId: t.id, newTodoState: 'TODO', dirtying: true }],
      dirtying: true,
    });
    const n = s.dispatch(gtdRefileInbox(s.tasks()));
    expect(n).toBe(1);
    expect(s.titles(INBOX)).toEqual(['Sin estado', 'Otra sin estado']);
    expect(s.titles(TASKS)).toEqual(['Existente', 'Con hijos', 'hija']);
  });
});

describe('2.17: «Archivar todas» limitado a ficheros', () => {
  const { archivableDone } = require('./gtd_model');
  const text = '#+TODO: TODO | DONE\n* DONE Hecha\n';
  const files = Map({ '/a.org': parseOrg(text), '/b.org': parseOrg(text) });
  const tasks = buildTasks(files, []);
  test('sin lista, de todos los ficheros', () => {
    expect(archivableDone(tasks).ok).toHaveLength(2);
    expect(archivableDone(tasks, []).ok).toHaveLength(2);
  });
  test('con lista, solo de esos', () => {
    const r = archivableDone(tasks, ['/b.org']).ok;
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe('/b.org');
  });
});

describe('2.17: subtareas asociadas (anidado visual)', () => {
  const { nestSubtasks } = require('./gtd_model');
  const nested = [
    '#+TODO: TODO NEXT | DONE',
    '* TODO A',
    '** TODO A1',
    '*** TODO A1a',
    '** TODO A2',
    '* TODO B',
    '',
  ].join('\n');
  const tasks = buildTasks(Map({ [P]: parseOrg(nested) }), []);
  const item = (t, section = 'list') => ({ kind: 'task', task: t, section });
  const by = (title) => tasks.find((t) => t.title === title);
  const names = (list) =>
    list.map((i) => `${'-'.repeat(i.depth || 0)}${i.task ? i.task.title : i.header}`);

  test('las hijas van justo debajo de su tarea, con su profundidad', () => {
    // orden «desordenado»: B primero, las hijas separadas del padre
    const items = [item(by('A1a')), item(by('B')), item(by('A2')), item(by('A')), item(by('A1'))];
    expect(names(nestSubtasks(items))).toEqual(['B', 'A', '-A2', '-A1', '--A1a']);
  });

  test('si el padre no está en la lista, la tarea queda como estaba (sin sangría)', () => {
    const items = [item(by('A1')), item(by('B'))];
    expect(names(nestSubtasks(items))).toEqual(['A1', 'B']);
  });

  test('las cabeceras de sección separan los tramos', () => {
    const items = [item(by('A'), 's1'), { kind: 'header', header: 'H' }, item(by('A1'), 's2')];
    expect(names(nestSubtasks(items))).toEqual(['A', 'H', 'A1']);
  });

  test('skip deja fuera a las que no deben moverse', () => {
    const items = [item(by('A1')), item(by('A'))];
    expect(names(nestSubtasks(items, (t) => t.title === 'A1'))).toEqual(['A1', 'A']);
  });
});

describe('2.17: Referencias de un proyecto', () => {
  const { projectSections } = require('./gtd_model');
  const proj = [
    '#+TODO: TODO NEXT PROJECT | DONE',
    '* PROJECT Casa',
    '** TODO Pintar',
    '** Presupuestos',
    '*** Oferta A',
    '** NEXT Comprar',
    '* Fuera del proyecto',
    '',
  ].join('\n');
  const tasks = buildTasks(Map({ [P]: parseOrg(proj) }), []);
  const project = tasks.find((t) => t.title === 'Casa');

  test('las cabeceras sin estado del proyecto salen en «Referencias», en orden de fichero', () => {
    const secs = projectSections(tasks, project.key, {}, new Date(2026, 9, 11));
    const refs = secs.find((s) => s.id === 'refs');
    expect(refs.tasks.map((t) => t.title)).toEqual(['Presupuestos', 'Oferta A']);
    expect(secs[secs.length - 1].id).toBe('refs');
  });

  test('no se cuelan como tareas de ninguna otra sección', () => {
    const secs = projectSections(tasks, project.key, {}, new Date(2026, 9, 11));
    const titles = secs.filter((s) => s.id !== 'refs').flatMap((s) => s.tasks.map((t) => t.title));
    expect(titles.sort()).toEqual(['Comprar', 'Pintar']);
  });
});
