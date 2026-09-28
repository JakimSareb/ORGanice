import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { exportOrg } from '../export_org';
import rootOrgReducer from '../../reducers/org';
import { setGtdConfig } from './gtd_sections';
import { buildTasks, projectSections, groupByProject, dueFirstFileOrder } from './gtd_model';
import { gtdSaveTask, gtdMoveNextTo } from './gtd_actions';

const TODAY = new Date(2026, 8, 28);
const P = '/p.org';
const text = [
  '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED',
  '* PROJECT Casa',
  '** TODO Uno',
  '** NEXT Dos',
  '** TODO Tres',
  'SCHEDULED: <2026-09-20 Sun>',
  '** TODO Cuatro',
  'SCHEDULED: <2026-10-20 Tue>',
  '** WAITING Cinco',
  '** MAYBE Seis',
  '** DONE Siete',
  'CLOSED: [2026-09-24 Thu 10:00]',
  '** Fase',
  '*** NEXT Ocho',
  '* TODO Suelta A',
  '* TODO Suelta B',
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

describe('2.15: proyecto por secciones, agrupar y reordenar', () => {
  test('secciones del proyecto', () => {
    const tasks = tasksOf(makeStore().state());
    const project = tasks.find((t) => t.title === 'Casa');
    const secs = projectSections(tasks, project.key, {}, TODAY);
    const get = (id) => secs.find((s) => s.id === id).tasks.map((t) => t.title);
    expect(get('next')).toEqual(['Dos', 'Ocho']);
    // «Tres» ya ha llegado su fecha: primero
    expect(get('later')).toEqual(['Tres', 'Uno']);
    expect(get('scheduled')).toEqual(['Cuatro']);
    expect(get('waiting')).toEqual(['Cinco']);
    expect(get('someday')).toEqual(['Seis']);
    expect(get('done')).toEqual(['Siete']);
  });

  test('agrupar por proyecto: sueltas primero', () => {
    const tasks = tasksOf(makeStore().state());
    const list = tasks.filter((t) => ['Suelta A', 'Uno', 'Suelta B', 'Tres'].includes(t.title));
    const { loose, groups } = groupByProject(list, TODAY);
    expect(loose.map((t) => t.title)).toEqual(['Suelta A', 'Suelta B']);
    expect(groups.length).toBe(1);
    expect(groups[0].tasks.map((t) => t.title)).toEqual(['Tres', 'Uno']);
    expect(dueFirstFileOrder([], TODAY)).toEqual([]);
  });

  test('reordenar: antes/después y adoptando el nivel', () => {
    const store = makeStore();
    let tasks = tasksOf(store.state());
    const t = (x) => tasks.find((y) => y.title === x);
    store.dispatch(gtdMoveNextTo(t('Uno'), t('Cinco').id, 'after'));
    tasks = tasksOf(store.state());
    let lines = textOf(store.state())
      .split('\n')
      .filter((l) => l.startsWith('*'));
    expect(lines.indexOf('** TODO Uno')).toBe(lines.indexOf('** WAITING Cinco') + 1);
    // A un nivel más profundo (dentro de «Fase»)
    store.dispatch(gtdMoveNextTo(t('Dos'), t('Ocho').id, 'before'));
    lines = textOf(store.state())
      .split('\n')
      .filter((l) => l.startsWith('*'));
    expect(lines).toContain('*** NEXT Dos');
    expect(lines.indexOf('*** NEXT Dos')).toBe(lines.indexOf('*** NEXT Ocho') - 1);
    // Cambiar de estado y colocar, en un solo paso
    tasks = tasksOf(store.state());
    store.dispatch(
      gtdSaveTask(t('Seis'), {
        list: 'next',
        moveNextTo: { targetId: t('Casa').id, position: 'before' },
      })
    );
    lines = textOf(store.state())
      .split('\n')
      .filter((l) => l.startsWith('*'));
    expect(lines[0]).toBe('* NEXT Seis');
    // Dentro de sí mismo: no hace nada
    tasks = tasksOf(store.state());
    const before = textOf(store.state());
    store.dispatch(gtdMoveNextTo(t('Fase'), t('Ocho').id, 'after'));
    expect(textOf(store.state())).toBe(before);
  });
});

describe('2.15: movimientos que no cambian nada', () => {
  test('no se escribe nada', () => {
    const store = makeStore();
    const tasks = tasksOf(store.state());
    const t = (x) => tasks.find((y) => y.title === x);
    const before = store.state();
    store.dispatch(gtdMoveNextTo(t('Uno'), t('Dos').id, 'before'));
    store.dispatch(gtdMoveNextTo(t('Dos'), t('Uno').id, 'after'));
    expect(store.state()).toBe(before);
  });
});

describe('2.16: secciones propias y nombres', () => {
  test('una sección propia es una vista: la tarea sigue en su lista', () => {
    const { normalizeGtdSections, sectionLabel } = require('./gtd_sections');
    const { tasksForView } = require('./gtd_model');
    const cfgRaw = {
      custom: [{ id: 'c_x', label: 'Casa', icon: 'fas fa-home' }],
      sections: { c_x: { states: 'WAITING, MAYBE' }, next: { label: 'Siguiente' } },
    };
    setGtdConfig(cfgRaw);
    const cfg = normalizeGtdSections(cfgRaw);
    expect(cfg.order).toContain('c_x');
    expect(sectionLabel('next', cfg)).toBe('Siguiente');
    expect(sectionLabel('c_x', cfg)).toBe('Casa');
    const tasks = tasksOf(makeStore().state());
    const titles = (id) =>
      tasksForView(tasks, { id }, {}, TODAY)
        .map((t) => t.title)
        .sort();
    expect(titles('c_x')).toEqual(['Cinco', 'Seis']);
    expect(titles('waiting')).toEqual(['Cinco']);
    // sin reglas: todas las abiertas
    setGtdConfig({ custom: [{ id: 'c_y', label: 'Todo' }] });
    expect(titles('c_y').length).toBeGreaterThan(5);
    setGtdConfig(null);
  });
});
