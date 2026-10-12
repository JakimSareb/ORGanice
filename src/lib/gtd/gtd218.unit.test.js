import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { exportOrg } from '../export_org';
import rootOrgReducer from '../../reducers/org';
import { setGtdConfig, normalizeGtdSections, matchesSectionRules } from './gtd_sections';
import { buildTasks, displayTitle, cookieOf } from './gtd_model';
import { gtdSaveTask, gtdSetParent, canBeParentOf } from './gtd_actions';
import { notesLineFor } from '../../components/EliCommandPalette';

const P = '/p.org';
const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';

const makeStore = (text) => {
  let state = Map({ path: null, files: Map({ [P]: parseOrg(HEAD + text) }), fileSettings: List() });
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
const find = (st, title) => tasksOf(st).find((t) => t.title === title);

beforeAll(() => setGtdConfig(null));

describe('2.18: tarea ⇄ subtarea', () => {
  const text = '* TODO Pintar salón\n* TODO Comprar pintura\n** TODO Ir a la tienda\n* TODO Otra\n';

  test('hacerla subtarea: se lleva sus subtareas y la madre recibe el contador', () => {
    const store = makeStore(text);
    const madre = find(store.state(), 'Pintar salón');
    store.dispatch(gtdSetParent(find(store.state(), 'Comprar pintura'), madre.id));
    const out = textOf(store.state());
    expect(out).toContain(
      '* TODO Pintar salón [0/1]\n** TODO Comprar pintura\n*** TODO Ir a la tienda'
    );
    expect(out).toContain('* TODO Otra');
  });

  test('sacarla un nivel: queda justo debajo de su antigua madre', () => {
    const store = makeStore('* TODO Madre [0/2]\n** TODO Uno\n** TODO Dos\n* TODO Después\n');
    store.dispatch(gtdSetParent(find(store.state(), 'Uno'), null));
    const out = textOf(store.state());
    expect(out).toMatch(/\* TODO Madre \[0\/1\]\n\*\* TODO Dos\n\* TODO Uno\n\* TODO Después/);
  });

  test('desde el editor (parentTaskId) y el contador cuenta las terminadas', () => {
    const store = makeStore('* TODO Madre\n** DONE Hecha\n* TODO Suelta\n');
    // la madre ya tiene una subtarea con estado, pero aún sin contador
    const madre = find(store.state(), 'Madre');
    store.dispatch(gtdSaveTask(find(store.state(), 'Suelta'), { parentTaskId: madre.id }));
    expect(textOf(store.state())).toContain('* TODO Madre [1/2]\n** DONE Hecha\n** TODO Suelta');
  });

  test('no puede ser madre un proyecto, una terminada, ella misma ni una de sus subtareas', () => {
    const store = makeStore(
      '* PROJECT Proy\n** TODO A\n*** TODO A1\n** TODO B\n* DONE Hecha\n* TODO Fuera\n'
    );
    const all = tasksOf(store.state());
    const t = (x) => all.find((y) => y.title === x);
    expect(canBeParentOf(t('Proy'), t('B'), all)).toBe(false);
    expect(canBeParentOf(t('Hecha'), t('Fuera'), all)).toBe(false);
    expect(canBeParentOf(t('A'), t('A'), all)).toBe(false);
    expect(canBeParentOf(t('A1'), t('A'), all)).toBe(false);
    expect(canBeParentOf(t('A'), t('B'), all)).toBe(true);
    // de otro proyecto (o suelta) no
    expect(canBeParentOf(t('A'), t('Fuera'), all)).toBe(false);
  });

  test('dar estado a la primera subtarea añade el contador a la madre', () => {
    const store = makeStore('* TODO Madre\n** Nota sin estado\n');
    const h = store.state().getIn(['files', P, 'headers', 1]);
    store.dispatch({
      type: 'ELI_IN_FILE',
      path: P,
      inner: [
        {
          type: 'SET_TODO_STATE',
          headerId: h.get('id'),
          newTodoState: 'TODO',
          eliEnsureCookie: true,
        },
      ],
    });
    expect(textOf(store.state())).toContain('* TODO Madre [0/1]');
  });

  test('en el editor de siempre (sin la marca de GTD) el título no cambia', () => {
    const store = makeStore('* TODO Madre\n** Nota sin estado\n');
    const h = store.state().getIn(['files', P, 'headers', 1]);
    store.dispatch({
      type: 'ELI_IN_FILE',
      path: P,
      inner: [{ type: 'SET_TODO_STATE', headerId: h.get('id'), newTodoState: 'TODO' }],
    });
    expect(textOf(store.state())).toContain('* TODO Madre\n');
  });
});

describe('2.18: contador en el título', () => {
  test('se ve aparte del título', () => {
    expect(displayTitle('Pintar salón [1/6]')).toBe('Pintar salón');
    expect(cookieOf('Pintar salón [1/6]')).toBe('1/6');
    expect(cookieOf('Algo [66%]')).toBe('66%');
    expect(cookieOf('Sin contador')).toBe(null);
  });
});

describe('2.18: repetidoras: casillas a cero', () => {
  test('al completarla se desmarcan las casillas y los contadores de sus notas', () => {
    const store = makeStore(
      [
        '* TODO Limpiar',
        'SCHEDULED: <2026-10-05 Mon +1w>',
        'Lista [2/3] [66%]',
        '- [X] uno',
        '- [-] dos',
        '  - [X] dos.a',
        '1. [ ] tres',
        '',
      ].join('\n')
    );
    store.dispatch(gtdSaveTask(find(store.state(), 'Limpiar'), { list: 'done' }));
    const out = textOf(store.state());
    expect(out).toContain('* TODO Limpiar');
    expect(out).toContain('<2026-10-12 Mon +1w>');
    expect(out).toContain('Lista [0/3] [0%]');
    expect(out).not.toMatch(/\[X\]|\[-\]/);
    expect(out).toContain('- [ ] uno');
    expect(out).toContain('[ ] tres');
  });

  test('una tarea sin repetición conserva sus casillas', () => {
    const store = makeStore('* TODO Una vez\n- [X] hecho\n');
    store.dispatch(gtdSaveTask(find(store.state(), 'Una vez'), { list: 'done' }));
    expect(textOf(store.state())).toContain('- [X] hecho');
  });
});

describe('2.18: secciones por etiqueta con etiquetas heredadas', () => {
  test('una subtarea sale en la sección de la etiqueta de su madre (no en Inbox)', () => {
    const store = makeStore('* TODO Madre :casa:\n** TODO Hija\n');
    const hija = find(store.state(), 'Hija');
    const cfg = normalizeGtdSections(null);
    expect(matchesSectionRules(hija, { ...cfg.sections.next, tags: ['casa'], states: [] })).toBe(
      true
    );
    const inbox = { ...cfg.sections.inbox, tags: ['casa'], states: [] };
    expect(matchesSectionRules(hija, inbox)).toBe(false);
  });
});

describe('2.18: búsqueda: línea de las notas', () => {
  test('solo si lo buscado sale en las notas', () => {
    expect(notesLineFor('primera\nllamar al fontanero\n', 'fontanero')).toBe('llamar al fontanero');
    expect(notesLineFor('nada que ver', 'fontanero')).toBe(null);
    expect(notesLineFor('', 'x')).toBe(null);
  });
});

describe('2.18: sin contador vacío', () => {
  test('al sacar la última subtarea, la madre pierde el «[0/0]»', () => {
    const store = makeStore('* TODO Madre [0/1]\n** TODO Única\n');
    store.dispatch(gtdSetParent(find(store.state(), 'Única'), null));
    expect(textOf(store.state())).toContain('* TODO Madre\n* TODO Única');
  });
});

describe('2.18: reinicio de casillas sin reescribir las notas', () => {
  test('respeta sangrías, tablas, bloques y texto', () => {
    const store = makeStore(
      [
        '* TODO Rep [1/2]',
        'SCHEDULED: <2026-10-05 Mon +1w>',
        'Pantalla [16/9] y nada más.',
        'Lista [1/2]',
        '  - [X] uno',
        '  - [ ] dos',
        '| a  | bb |',
        '#+BEGIN_SRC js',
        'const x = [1/2]; // - [X] no',
        '#+END_SRC',
        '',
      ].join('\n')
    );
    store.dispatch(gtdSaveTask(find(store.state(), 'Rep'), { list: 'done' }));
    const out = textOf(store.state());
    expect(out).toContain('* TODO Rep [0/2]');
    expect(out).toContain('Pantalla [16/9] y nada más.');
    expect(out).toContain('Lista [0/2]\n  - [ ] uno\n  - [ ] dos');
    expect(out).toContain('| a  | bb |');
    expect(out).toContain('const x = [1/2]; // - [X] no');
  });
});
