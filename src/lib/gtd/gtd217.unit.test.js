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
