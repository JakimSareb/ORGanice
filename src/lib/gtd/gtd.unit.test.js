import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { exportOrg } from '../export_org';
import rootOrgReducer from '../../reducers/org';
import {
  buildTasks,
  listOf,
  isFocus,
  tasksForView,
  countsFor,
  projectsOf,
  areasOf,
  effortMinutes,
  facetsFor,
  needsAutoPriority,
  autoPriorityKey,
} from './gtd_model';
import {
  gtdSaveTask,
  gtdToggleDone,
  gtdToggleStar,
  gtdAddTask,
  gtdDeleteTask,
  gtdMoveToProject,
} from './gtd_actions';

const TODAY = new Date(2026, 8, 25);
const INBOX = '/inbox.org';
const GTD = '/gtd.org';

const inboxText = [
  '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED',
  '* Llamar a Juan',
  '* Idea suelta',
  'con notas',
  '',
].join('\n');
const gtdText = [
  '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED',
  '* Casa',
  ':PROPERTIES:',
  ':AREA: Hogar',
  ':END:',
  '** PROJECT Pintar salón',
  '*** NEXT Comprar pintura :@calle:',
  ':PROPERTIES:',
  ':EFFORT: 0:30',
  ':ENERGY: baja',
  ':END:',
  '*** TODO Mover muebles',
  '** WAITING Presupuesto fontanero',
  '* TODO [#A] Declaración renta :@ordenador:',
  '* TODO Revisar coche',
  'SCHEDULED: <2026-10-10 Sat>',
  '* TODO Pagar seguro',
  'DEADLINE: <2026-09-20 Sun>',
  '* MAYBE Aprender alemán',
  '* DONE Hecho ya',
  'CLOSED: [2026-09-24 Thu 10:00]',
  '* Referencia: recetas',
  '',
].join('\n');

const makeState = () =>
  Map({
    path: null,
    files: Map({ [INBOX]: parseOrg(inboxText), [GTD]: parseOrg(gtdText) }),
    fileSettings: List(),
  });

// Mini "store": aplica las acciones planas al reductor e ignora los thunks (sync/setDirty)
const makeStore = () => {
  let state = makeState();
  const getState = () => ({ org: { present: state }, base: Map() });
  const dispatch = (a) => {
    if (typeof a === 'function') return a(dispatch, getState);
    state = rootOrgReducer(state, a);
    return a;
  };
  return { dispatch, getState, state: () => state };
};

const tasksOf = (state) => buildTasks(state.get('files'), [INBOX]);
const byTitle = (tasks, t) => tasks.find((x) => x.title === t);
const textOf = (state, path) =>
  exportOrg({
    headers: state.getIn(['files', path, 'headers']),
    linesBeforeHeadings: state.getIn(['files', path, 'linesBeforeHeadings']) || List(),
    dontIndent: false,
  });

describe('modelo GTD', () => {
  const tasks = tasksOf(makeState());
  const list = (id) => tasksForView(tasks, { id }, {}, TODAY).map((t) => t.title);

  test('listas', () => {
    expect(list('inbox')).toEqual(['Llamar a Juan', 'Idea suelta']);
    expect(list('next')).toEqual(['Comprar pintura']);
    expect(list('later').sort()).toEqual(
      ['Declaración renta', 'Mover muebles', 'Pagar seguro'].sort()
    );
    expect(list('waiting')).toEqual(['Presupuesto fontanero']);
    expect(list('scheduled')).toEqual(['Revisar coche']);
    expect(list('someday')).toEqual(['Aprender alemán']);
    expect(list('deadline')).toEqual(['Pagar seguro']);
    expect(list('logbook')).toEqual(['Hecho ya']);
    expect(list('reference')).toEqual(['Referencia: recetas']);
    expect(list('focus').sort()).toEqual(['Declaración renta', 'Pagar seguro'].sort());
  });

  test('@inbox, programadas ocultas y ★ automática', () => {
    const extra = buildTasks(
      Map({
        '/t.org': parseOrg(
          [
            '#+TODO: TODO NEXT PROJECT | DONE',
            '* NEXT Leer artículo :@inbox:',
            '* TODO [#A] Futura con estrella',
            'SCHEDULED: <2026-10-01 Thu>',
            '* TODO Llega hoy',
            'SCHEDULED: <2026-09-25 Fri>',
            '* TODO Hábito',
            'SCHEDULED: <2026-09-20 Sun .+1d>',
            ':PROPERTIES:',
            ':STYLE: habit',
            ':END:',
            '* PROJECT P',
            '** NEXT Dentro futura',
            'SCHEDULED: <2026-10-01 Thu> DEADLINE: <2026-10-05 Mon>',
            '** NEXT Dentro ya',
            '',
          ].join('\n')
        ),
      }),
      []
    );
    const t = (title) => byTitle(extra, title);
    expect(listOf(t('Leer artículo'), TODAY)).toBe('inbox');
    expect(listOf(t('Futura con estrella'), TODAY)).toBe('scheduled');
    expect(isFocus(t('Futura con estrella'), TODAY)).toBe(false);
    // Con DEADLINE: se ve en su lista, en Deadline y en Scheduled aunque esté programada a futuro
    expect(tasksForView(extra, { id: 'deadline' }, {}, TODAY).map((x) => x.title)).toEqual([
      'Dentro futura',
    ]);
    expect(listOf(t('Dentro futura'), TODAY)).toBe('next');
    expect(tasksForView(extra, { id: 'scheduled' }, {}, TODAY).map((x) => x.title)).toEqual([
      'Futura con estrella',
      'Dentro futura',
    ]);
    const p = t('P');
    expect(
      tasksForView(extra, { type: 'project', key: p.key }, {}, TODAY).map((x) => x.title)
    ).toEqual(['Dentro futura', 'Dentro ya']);
    expect(needsAutoPriority(t('Llega hoy'), TODAY)).toBe(true);
    expect(needsAutoPriority(t('Hábito'), TODAY)).toBe(false);
    expect(needsAutoPriority(t('Futura con estrella'), new Date(2026, 9, 2))).toBe(false);
    expect(needsAutoPriority(t('Dentro futura'), TODAY)).toBe(false);
    expect(needsAutoPriority(t('Dentro futura'), new Date(2026, 9, 1))).toBe(true);
    expect(autoPriorityKey(t('Llega hoy'), TODAY)).toBe(autoPriorityKey(t('Llega hoy'), TODAY));
    // DEADLINE: también al llegar su fecha; la clave cambia cuando llega la segunda fecha
    const d = t('Dentro futura');
    expect(needsAutoPriority(d, new Date(2026, 9, 1))).toBe(true);
    expect(autoPriorityKey(d, new Date(2026, 9, 1))).not.toBe(
      autoPriorityKey(d, new Date(2026, 9, 5))
    );
    expect(
      tasksForView(extra, { id: 'next' }, {}, new Date(2026, 9, 1)).map((x) => x.title)
    ).toContain('Dentro futura');
  });

  test('herencia de área y etiquetas, proyectos, propiedades', () => {
    const c = byTitle(tasks, 'Comprar pintura');
    expect(c.area).toBe('Hogar');
    expect(c.ownArea).toBe(null);
    expect(c.project.title).toBe('Pintar salón');
    expect(c.energy).toBe('baja');
    expect(c.effort).toBe('0:30');
    expect(projectsOf(tasks).map((p) => p.title)).toEqual(['Pintar salón']);
    expect(projectsOf(tasks, { area: '-' })).toEqual([]);
    expect(areasOf(tasks)).toEqual(['Hogar']);
    const project = byTitle(tasks, 'Pintar salón');
    expect(
      tasksForView(tasks, { type: 'project', key: project.key }, {}, TODAY).map((t) => t.title)
    ).toEqual(['Comprar pintura', 'Mover muebles']);
    // "Casa" tiene tareas debajo: no es referencia
    expect(listOf(byTitle(tasks, 'Casa'), TODAY)).toBe(null);
    expect(isFocus(byTitle(tasks, 'Revisar coche'), TODAY)).toBe(false);
  });

  test('filtros y contadores', () => {
    expect(
      tasksForView(tasks, { id: 'later' }, { area: 'Hogar' }, TODAY).map((t) => t.title)
    ).toEqual(['Mover muebles']);
    expect(tasksForView(tasks, { id: 'later' }, { area: '-' }, TODAY).length).toBe(2);
    expect(tasksForView(tasks, { id: 'next' }, { tags: ['@calle'] }, TODAY).length).toBe(1);
    expect(tasksForView(tasks, { id: 'next' }, { energy: 'alta' }, TODAY).length).toBe(0);
    expect(tasksForView(tasks, { id: 'next' }, { time: '30' }, TODAY).length).toBe(1);
    expect(tasksForView(tasks, { id: 'next' }, { time: '15' }, TODAY).length).toBe(0);
    expect(
      tasksForView(tasks, { id: 'later' }, { dated: true }, TODAY).map((t) => t.title)
    ).toEqual(['Pagar seguro']);
    expect(
      tasksForView(tasks, { id: 'inbox' }, { text: 'NOTAS' }, TODAY).map((t) => t.title)
    ).toEqual(['Idea suelta']);
    const counts = countsFor(tasks, {}, TODAY);
    expect(counts.inbox).toBe(2);
    expect(counts.focus).toBe(2);
    expect(facetsFor(tasksForView(tasks, { id: 'next' }, {}, TODAY)).tags).toEqual(['@calle']);
    expect(effortMinutes('1:30')).toBe(90);
    expect(effortMinutes('2h')).toBe(120);
    expect(effortMinutes('45')).toBe(45);
    expect(effortMinutes('x')).toBe(null);
  });
});

describe('acciones GTD sobre los ficheros', () => {
  test('editar: lista, área, energía, tiempo, fechas, notas, etiquetas', () => {
    const store = makeStore();
    const t = byTitle(tasksOf(store.state()), 'Llamar a Juan');
    store.dispatch(
      gtdSaveTask(t, {
        rawTitle: 'Llamar a Juan (luz)',
        notes: 'Teléfono 600',
        list: 'next',
        area: 'Hogar',
        energy: 'alta',
        effort: '0:15',
        scheduled: new Date(2026, 8, 25),
        deadline: new Date(2026, 8, 30),
        tags: ['@teléfono'],
      })
    );
    const text = textOf(store.state(), INBOX);
    expect(text).toMatch(/^\* NEXT Llamar a Juan \(luz\) +:@teléfono:$/m);
    expect(text).toMatch(/SCHEDULED: <2026-09-25 \w+>/);
    expect(text).toMatch(/DEADLINE: <2026-09-30 \w+>/);
    expect(text).toMatch(/:AREA: +Hogar/);
    expect(text).toMatch(/:ENERGY: +alta/);
    expect(text).toMatch(/:EFFORT: +0:15/);
    expect(text).toMatch(/Teléfono 600/);
    // El otro fichero no cambia y la ruta abierta tampoco
    expect(store.state().get('path')).toBe(null);
    expect(textOf(store.state(), GTD)).toBe(textOf(makeState(), GTD));
    const t2 = byTitle(tasksOf(store.state()), 'Llamar a Juan (luz)');
    expect(listOf(t2, TODAY)).toBe('next');
    expect(isFocus(t2, TODAY)).toBe(true);
    // Quitar propiedades y fecha
    store.dispatch(gtdSaveTask(t2, { area: null, energy: null, scheduled: null }));
    const text2 = textOf(store.state(), INBOX);
    expect(text2).not.toMatch(/AREA|ENERGY|SCHEDULED/);
    expect(text2).toMatch(/:EFFORT: +0:15/);
  });

  test('completar (CLOSED) y reabrir, estrella', () => {
    const store = makeStore();
    const t = byTitle(tasksOf(store.state()), 'Mover muebles');
    store.dispatch(gtdToggleDone(t));
    let text = textOf(store.state(), GTD);
    expect(text).toMatch(/\*\*\* DONE Mover muebles\n +CLOSED: \[/);
    const done = byTitle(tasksOf(store.state()), 'Mover muebles');
    expect(listOf(done, TODAY)).toBe('logbook');
    store.dispatch(gtdToggleDone(done));
    text = textOf(store.state(), GTD);
    expect(text).toMatch(/\*\*\* TODO Mover muebles\n/);
    expect(text).not.toMatch(/Mover muebles\n +CLOSED/);
    const again = byTitle(tasksOf(store.state()), 'Mover muebles');
    store.dispatch(gtdToggleStar(again));
    expect(textOf(store.state(), GTD)).toMatch(/\*\*\* TODO \[#A\] Mover muebles/);
    const starred = byTitle(tasksOf(store.state()), 'Mover muebles');
    store.dispatch(gtdToggleStar(starred));
    expect(textOf(store.state(), GTD)).toMatch(/\*\*\* TODO Mover muebles/);
  });

  test('añadir en Inbox, en un proyecto y un proyecto nuevo', () => {
    const store = makeStore();
    store.dispatch(gtdAddTask({ path: INBOX }, { title: 'Nueva', list: 'inbox' }));
    const project = byTitle(tasksOf(store.state()), 'Pintar salón');
    store.dispatch(
      gtdAddTask(
        { path: GTD, parentId: project.id },
        { title: 'Lijar', list: 'next', area: 'Hogar', tags: ['@casa'] }
      )
    );
    store.dispatch(gtdAddTask({ path: GTD }, { title: 'Viaje', list: 'project' }));
    store.dispatch(
      gtdAddTask({ path: GTD }, { title: 'Futuro', list: 'later', scheduled: new Date(2026, 9, 1) })
    );
    store.dispatch(
      gtdAddTask({ path: GTD }, { title: 'Vence', list: 'later', deadline: new Date(2026, 9, 2) })
    );
    expect(textOf(store.state(), INBOX)).toMatch(/\n\* Nueva\n?$/);
    const gtd = textOf(store.state(), GTD);
    expect(gtd).toMatch(/\*\*\* TODO Mover muebles\n\*\*\* NEXT Lijar +:@casa:\n/);
    expect(gtd).toMatch(/\* PROJECT Viaje/);
    expect(gtd).toMatch(/\* TODO Futuro\n +SCHEDULED: <2026-10-01/);
    const tasks = tasksOf(store.state());
    expect(byTitle(tasks, 'Lijar').project.title).toBe('Pintar salón');
    expect(listOf(byTitle(tasks, 'Futuro'), TODAY)).toBe('scheduled');
    expect(gtd).toMatch(/\* TODO Vence\n +DEADLINE: <2026-10-02/);
    expect(tasksForView(tasks, { id: 'deadline' }, {}, TODAY).map((t) => t.title)).toEqual([
      'Pagar seguro',
      'Vence',
    ]);
    // Fichero inexistente: no hace nada
    expect(store.dispatch(gtdAddTask({ path: '/nope.org' }, { title: 'X' }))).toBe(null);
    expect(store.state().getIn(['files', '/nope.org'])).toBe(undefined);
  });

  test('mover a un proyecto (otro fichero) y borrar', () => {
    const store = makeStore();
    const t = byTitle(tasksOf(store.state()), 'Llamar a Juan');
    const project = byTitle(tasksOf(store.state()), 'Pintar salón');
    store.dispatch(gtdSaveTask(t, { list: 'next' }));
    store.dispatch(
      gtdMoveToProject(byTitle(tasksOf(store.state()), 'Llamar a Juan'), {
        path: GTD,
        id: project.id,
      })
    );
    expect(textOf(store.state(), INBOX)).not.toMatch(/Llamar/);
    expect(textOf(store.state(), GTD)).toMatch(/\*\*\* NEXT Llamar a Juan/);
    const moved = byTitle(tasksOf(store.state()), 'Llamar a Juan');
    expect(moved.project.title).toBe('Pintar salón');
    store.dispatch(gtdDeleteTask(moved));
    expect(textOf(store.state(), GTD)).not.toMatch(/Llamar/);
  });

  test('estado que el fichero no declara: no se escribe (no se estropea el título)', () => {
    const state = makeState().setIn(
      ['files', '/solo.org'],
      parseOrg('#+TODO: TODO | DONE\n* TODO Algo\n')
    );
    let st = state;
    const getState = () => ({ org: { present: st }, base: Map() });
    const dispatch = (a) =>
      typeof a === 'function' ? a(dispatch, getState) : (st = rootOrgReducer(st, a));
    const t = buildTasks(st.get('files'), []).find((x) => x.title === 'Algo');
    dispatch(gtdSaveTask(t, { list: 'next', rawTitle: 'Algo nuevo' }));
    expect(textOf(st, '/solo.org')).toBe('#+TODO: TODO | DONE\n* TODO Algo\n');
    // sin #+TODO se usan los estados de Emacs del usuario (NEXT TODO MAYBE WAITING PROJECT)
    st = st.setIn(['files', '/sin.org'], parseOrg('* Llamar\n'));
    const plain = buildTasks(st.get('files'), ['/sin.org']).find((x) => x.path === '/sin.org');
    dispatch(gtdSaveTask(plain, { list: 'next' }));
    expect(textOf(st, '/sin.org')).toBe('* NEXT Llamar\n');
    const again = buildTasks(st.get('files'), ['/sin.org']).find((x) => x.path === '/sin.org');
    expect(again.keyword).toBe('NEXT');
    dispatch(gtdSaveTask(again, { list: 'waiting', rawTitle: 'Llamar hoy' }));
    expect(textOf(st, '/sin.org')).toBe('* WAITING Llamar hoy\n');
  });

  test('ELI_IN_FILE sin fichero no hace nada', () => {
    const s = makeState();
    expect(
      rootOrgReducer(s, { type: 'ELI_IN_FILE', path: '/x.org', inner: [{ type: 'REMOVE_HEADER' }] })
    ).toBe(s);
    expect(rootOrgReducer(s, { type: 'ELI_IN_FILE', path: null })).toBe(s);
  });
});

test('ELI_OPEN_SUBTREE despliega el encabezado y sus subencabezados', () => {
  let s = makeState().set('path', GTD);
  const headers = s.getIn(['files', GTD, 'headers']);
  const casa = headers.find((h) => h.getIn(['titleLine', 'rawTitle']) === 'Casa');
  s = rootOrgReducer(s, { type: 'ELI_OPEN_SUBTREE', headerId: casa.get('id') });
  const after = s.getIn(['files', GTD, 'headers']);
  const opened = after
    .filter((h) => h.get('opened'))
    .map((h) => h.getIn(['titleLine', 'rawTitle']).trim());
  expect(opened.toArray()).toEqual([
    'Casa',
    'Pintar salón',
    'Comprar pintura',
    'Mover muebles',
    'Presupuesto fontanero',
  ]);
});
