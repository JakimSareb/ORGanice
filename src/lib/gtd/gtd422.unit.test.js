import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map, Set, fromJS, List } from 'immutable';

import rootReducer from '../../reducers';
import { parseFile } from '../../actions/org';
import { gtdSaveTask, gtdAssignProject, linksInsteadOfMoves } from './gtd_actions';
import {
  buildTasks,
  tagsForList,
  listOf,
  tasksForView,
  projectSections,
  nestProjects,
  projectsOf,
  collapseRefs,
  taskByOrgId,
} from './gtd_model';
import { exportOrg } from '../export_org';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';

const makeStore = (files) => {
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
  Object.keys(files).forEach((p) => store.dispatch(parseFile(p, files[p])));
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

const tasksOf = (store) =>
  buildTasks(
    store
      .getState()
      .org.present.get('files')
      .filter((f) => f && f.get('headers')),
    []
  );

const today = new Date(2026, 9, 24);

describe('4.22: tarea de un proyecto → Referencia', () => {
  test('pierde el estado, SIGUE en el proyecto y sale en la lista Referencia', () => {
    const store = makeStore({
      '/tasks.org': `${HEAD}* PROJECT Reforma\n** NEXT Pintar\n** TODO Comprar\n`,
    });
    const task = tasksOf(store).find((t) => t.title === 'Pintar');
    store.dispatch(gtdSaveTask(task, { list: 'reference', tags: tagsForList(task, 'reference') }));
    expect(fileText(store, '/tasks.org')).toMatch(/\*\* Pintar\n/);
    const tasks = tasksOf(store);
    const after = tasks.find((t) => t.title === 'Pintar');
    expect(after.keyword).toBeNull();
    expect(after.project && after.project.title).toBe('Reforma');
    expect(listOf(after, today)).toBe('reference');
    expect(tasksForView(tasks, { id: 'reference' }, {}, today).map((t) => t.title)).toEqual([
      'Pintar',
    ]);
    // …y en la sección «Referencias» del proyecto
    const project = tasks.find((t) => t.title === 'Reforma');
    const refs = projectSections(tasks, project.key, {}, today).find((s) => s.id === 'refs');
    expect(refs.tasks.map((t) => t.title)).toEqual(['Pintar']);
  });

  test('un encabezado sin estado debajo de una tarea NO es referencia', () => {
    const store = makeStore({
      '/tasks.org': `${HEAD}* PROJECT Reforma\n** NEXT Pintar\n*** Colores\n`,
    });
    const colores = tasksOf(store).find((t) => t.title === 'Colores');
    expect(listOf(colores, today)).toBeNull();
  });
});

describe('4.22: referencias con su contenido', () => {
  const text = `${HEAD}* PROJECT Casa\n** Presupuestos\nNotas del presupuesto\n*** Oferta A\nPrecio 100\n** NEXT Comprar\n*** Detalle de la compra\n`;
  const tasks = buildTasks(Map({ '/tasks.org': require('../parse_org').parseOrg(text) }), []);
  const project = tasks.find((t) => t.title === 'Casa');
  const refs = projectSections(tasks, project.key, {}, today).find((s) => s.id === 'refs').tasks;

  test('la anidada no sale aparte y su contenido va en el de la madre', () => {
    const out = collapseRefs(tasks, refs);
    // «Detalle de la compra» cuelga de una tarea (no de una referencia): sigue saliendo aparte
    expect(out.map((t) => t.title)).toEqual(['Presupuestos', 'Detalle de la compra']);
    expect(out[0].refAggregated).toBe(true);
    expect(out[0].description).toContain('Notas del presupuesto');
    expect(out[0].description).toContain('*Oferta A*');
    expect(out[0].description).toContain('Precio 100');
    // lo que cuelga de una tarea con estado no se cuela en la referencia
    expect(out[0].description).not.toContain('Detalle de la compra');
    expect(out[1].refAggregated).toBeUndefined();
  });

  test('una referencia sin hijas queda tal cual', () => {
    const solo = refs.filter((t) => t.title === 'Oferta A');
    const out = collapseRefs(tasks, solo);
    expect(out).toHaveLength(1);
    expect(out[0].refAggregated).toBeUndefined();
  });
});

describe('4.22: proyecto dentro de otro', () => {
  const text = `${HEAD}* PROJECT Casa\n** NEXT Pintar\n** PROJECT Cocina\n*** NEXT Azulejos\n* PROJECT Viaje\n`;
  const tasks = buildTasks(Map({ '/tasks.org': require('../parse_org').parseOrg(text) }), []);
  const casa = tasks.find((t) => t.title === 'Casa');

  test('sale en el proyecto padre como una fila más', () => {
    const secs = projectSections(tasks, casa.key, {}, today);
    const titles = secs.filter((s) => s.id !== 'refs').flatMap((s) => s.tasks.map((t) => t.title));
    expect(titles.sort()).toEqual(['Cocina', 'Pintar']);
    // las acciones del subproyecto siguen siendo suyas, no de la madre
    expect(titles).not.toContain('Azulejos');
  });

  test('en el menú lateral cuelga de su madre (con sangría)', () => {
    const list = projectsOf(tasks, {});
    const nested = nestProjects(
      list
        .slice()
        .reverse()
        .sort((a, b) => a.index - b.index)
    );
    expect(nested.map((x) => [x.p.title, x.depth])).toEqual([
      ['Casa', 0],
      ['Cocina', 1],
      ['Viaje', 0],
    ]);
  });

  test('si la madre no está en la lista, el subproyecto va al nivel superior', () => {
    const cocina = tasks.find((t) => t.title === 'Cocina');
    expect(nestProjects([cocina]).map((x) => x.depth)).toEqual([0]);
  });
});

describe('4.22: tarea de otro fichero → se enlaza, no se mueve', () => {
  const opts = { tasksPath: '/tasks.org', inboxPaths: ['/inbox.org'] };
  const project = { path: '/tasks.org', id: 3 };
  test('decide moverla o enlazarla según su fichero', () => {
    expect(linksInsteadOfMoves({ path: '/otro.org' }, project, opts)).toBe(true);
    expect(linksInsteadOfMoves({ path: '/inbox.org' }, project, opts)).toBe(false);
    expect(linksInsteadOfMoves({ path: '/tasks.org' }, project, opts)).toBe(false);
    expect(linksInsteadOfMoves({ path: '/otro.org' }, null, opts)).toBe(false);
    // proyecto en otro fichero y tarea en uno que no es ni el de tareas ni el Inbox
    expect(linksInsteadOfMoves({ path: '/b.org' }, { path: '/a.org', id: 1 }, opts)).toBe(true);
    // la tarea ya está en el fichero del proyecto: es movimiento interno
    expect(linksInsteadOfMoves({ path: '/a.org' }, { path: '/a.org', id: 1 }, opts)).toBe(false);
  });

  test('gtdAssignProject pone :PROYECTO: (y :ID: al proyecto) y la tarea no se mueve', () => {
    const store = makeStore({
      '/tasks.org': `${HEAD}* PROJECT Reforma\n`,
      '/otro.org': `${HEAD}* NEXT Llamar al fontanero\n`,
    });
    const tasks = tasksOf(store);
    const t = tasks.find((x) => x.title === 'Llamar al fontanero');
    const p = tasks.find((x) => x.title === 'Reforma');
    store.dispatch(gtdAssignProject([t], p));
    expect(fileText(store, '/otro.org')).toMatch(/\* NEXT Llamar al fontanero/);
    expect(fileText(store, '/otro.org')).toMatch(/:PROYECTO: \[\[id:[^\]]+\]\[Reforma\]\]/);
    expect(fileText(store, '/tasks.org')).toMatch(/:ID: /);
    expect(fileText(store, '/tasks.org')).not.toMatch(/fontanero/);
    const after = tasksOf(store).find((x) => x.title === 'Llamar al fontanero');
    expect(after.project.title).toBe('Reforma');
    expect(after.projectExternal).toBe(true);
  });
});

describe('4.22: enlaces [[id:…]] en GTD', () => {
  const text = `${HEAD}* NEXT Llamar\n:PROPERTIES:\n:ID: ABC-123\n:END:\n* TODO Papelera :trash:\n:PROPERTIES:\n:ID: ZZZ\n:END:\n`;
  const tasks = buildTasks(Map({ '/tasks.org': require('../parse_org').parseOrg(text) }), []);
  test('taskByOrgId encuentra la tarea (sin mirar mayúsculas) y no las de la Papelera', () => {
    expect(taskByOrgId(tasks, 'abc-123').title).toBe('Llamar');
    expect(taskByOrgId(tasks, 'ZZZ')).toBeNull();
    expect(taskByOrgId(tasks, 'no-existe')).toBeNull();
    expect(taskByOrgId(tasks, '')).toBeNull();
  });
});
