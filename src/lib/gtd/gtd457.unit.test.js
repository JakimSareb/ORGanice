// 4.57: Agendas y Personas — editar/borrar puntos y notas, filtro por texto, «Nueva subcabecera aquí»
// al llevar a reunión; orden de secciones (asa); jerarquía de las reuniones en secciones propias.
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map as IMap, Set as ISet, fromJS, List } from 'immutable';
import rootReducer from '../../reducers';
import { parseFile } from '../../actions/org';
import { exportOrg } from '../export_org';
import { headingIndex } from '../eli_heading_index';
import { askRefileTarget } from '../eli_refile_picker';
import { gtdAddTask, gtdRefileTo } from './gtd_actions';
import { agendaEditNode, agendaDeleteNode, agendasFromState } from './gtd_persons_actions';
import { parseOrg } from '../parse_org';
import {
  parseAgendas,
  filterWords,
  nodeMatches,
  nodeMatchesDeep,
  contactMatches,
} from './gtd_agendas';
import { dropTargetAt, reorderIds } from '../eli_list_drag';
import { buildTasks, nestMeetingRows } from './gtd_model';

jest.mock('../eli_prompt', () => ({
  ...jest.requireActual('../eli_prompt'),
  askConfirm: jest.fn(async () => true),
}));

const makeStore = (files) => {
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
      base: new fromJS({
        customKeybindings: {},
        isLoading: ISet(),
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
const AG = [
  '#+TODO: TODO NEXT | DONE',
  '* Mari Carmen',
  '- [ ] Una casilla vieja',
  '** [#A] Punto uno :casa:',
  ':PROPERTIES:',
  ':ID: P-1',
  ':END:',
  'Notas del uno.',
  '*** Sub uno',
  '** Punto dos',
  '* Quan siguem a ...',
  '** Barcelona',
  '* Final',
  '',
].join('\n');
const nodeOf = (store, title) =>
  agendasFromState(store.getState()).nodes.find((n) => n.title === title);

describe('4.57: editar una cabecera de agendas.org', () => {
  const setup = () => makeStore({ '/tasks.org': '* NEXT Pintar\n', '/agendas.org': AG });

  test('cambiar el título conserva prioridad y etiquetas; el resto queda byte a byte igual', () => {
    const store = setup();
    const p1 = nodeOf(store, 'Punto uno');
    expect(p1.rawTitle).toBe('Punto uno');
    expect(store.dispatch(agendaEditNode(p1.headerId, { title: 'Punto 1 revisado' }))).toBe(true);
    const out = fileText(store, '/agendas.org');
    // (la app alinea las etiquetas a su columna al cambiar un título, como en todas partes)
    expect(out).toMatch(/^\*\* \[#A\] Punto 1 revisado\s+:casa:$/m);
    expect(
      out.replace(/^\*\* \[#A\] Punto 1 revisado\s+:casa:$/m, '** [#A] Punto uno :casa:')
    ).toBe(AG);
  });

  test('cambiar las notas de un punto no toca nada más; añadir notas a uno sin ellas', () => {
    const store = setup();
    const p1 = nodeOf(store, 'Punto uno');
    store.dispatch(agendaEditNode(p1.headerId, { notes: 'Otras notas.\nDos líneas.' }));
    expect(fileText(store, '/agendas.org')).toBe(
      AG.replace('Notas del uno.', 'Otras notas.\nDos líneas.')
    );
    const p2 = nodeOf(store, 'Punto dos');
    store.dispatch(agendaEditNode(p2.headerId, { notes: 'Nuevas notas' }));
    expect(fileText(store, '/agendas.org')).toContain('** Punto dos\nNuevas notas\n');
  });

  test('notas de la agenda principal', () => {
    const store = setup();
    const mc = nodeOf(store, 'Mari Carmen');
    store.dispatch(agendaEditNode(mc.headerId, { notes: '- [ ] Una casilla vieja\n- [ ] Otra' }));
    expect(fileText(store, '/agendas.org')).toContain(
      '* Mari Carmen\n- [ ] Una casilla vieja\n- [ ] Otra\n** [#A] Punto uno'
    );
  });

  test('sin cambios (o título vacío) no hace nada', () => {
    const store = setup();
    const p1 = nodeOf(store, 'Punto uno');
    expect(
      store.dispatch(agendaEditNode(p1.headerId, { title: 'Punto uno', notes: p1.body }))
    ).toBe(false);
    expect(store.dispatch(agendaEditNode(p1.headerId, { title: '   ' }))).toBe(false);
    expect(fileText(store, '/agendas.org')).toBe(AG);
  });

  test('un punto tratado (DONE) sigue tratado al renombrarlo', () => {
    const store = makeStore({ '/agendas.org': AG.replace('** Punto dos', '** DONE Punto dos') });
    const p2 = nodeOf(store, 'Punto dos');
    store.dispatch(agendaEditNode(p2.headerId, { title: 'Punto dos bis' }));
    expect(fileText(store, '/agendas.org')).toContain('** DONE Punto dos bis\n');
  });
});

describe('4.57: borrar un punto', () => {
  beforeEach(() => {
    // (CRA reinicia los mocks entre tests)
    require('../eli_prompt').askConfirm.mockResolvedValue(true);
  });
  test('se borra con sus subpuntos y el resto queda igual', async () => {
    const store = makeStore({ '/agendas.org': AG });
    const p1 = nodeOf(store, 'Punto uno');
    expect(await store.dispatch(agendaDeleteNode(p1.headerId, p1.title, p1.points))).toBe(true);
    expect(fileText(store, '/agendas.org')).toBe(
      AG.replace(
        '** [#A] Punto uno :casa:\n:PROPERTIES:\n:ID: P-1\n:END:\nNotas del uno.\n*** Sub uno\n',
        ''
      )
    );
  });
  test('si no se confirma no se borra', async () => {
    const { askConfirm } = require('../eli_prompt');
    askConfirm.mockResolvedValueOnce(false);
    const store = makeStore({ '/agendas.org': AG });
    const p2 = nodeOf(store, 'Punto dos');
    expect(await store.dispatch(agendaDeleteNode(p2.headerId, p2.title, 0))).toBe(false);
    expect(fileText(store, '/agendas.org')).toBe(AG);
  });
});

describe('4.57: filtro por texto', () => {
  const ag = parseAgendas(parseOrg(AG), [], '/agendas.org');
  const mc = ag.roots[0];
  test('palabras sin mayúsculas ni acentos', () => {
    expect(filterWords('  Pünto  UNO ')).toEqual(['punto', 'uno']);
    expect(filterWords('')).toEqual([]);
  });
  test('un punto coincide por título o notas; la agenda, por lo que cuelga de ella', () => {
    const p1 = mc.children[0];
    expect(nodeMatches(p1, filterWords('notas del uno'))).toBe(true);
    expect(nodeMatches(mc, filterWords('notas del uno'))).toBe(false);
    expect(nodeMatchesDeep(mc, filterWords('notas del uno'))).toBe(true);
    expect(nodeMatchesDeep(mc, filterWords('sub uno'))).toBe(true);
    expect(nodeMatchesDeep(ag.roots[1], filterWords('sub uno'))).toBe(false);
    expect(nodeMatchesDeep(mc, [])).toBe(true);
  });
  test('contactos: nombre, alias, empresa y correo', () => {
    const c = { name: 'Mari Carmen', aliases: ['MC'], empresa: 'Acme', email: 'mc@x.org' };
    expect(contactMatches(c, filterWords('acme'))).toBe(true);
    expect(contactMatches(c, filterWords('mari carmen'))).toBe(true);
    expect(contactMatches(c, filterWords('mc@x'))).toBe(true);
    expect(contactMatches(c, filterWords('luis'))).toBe(false);
    expect(contactMatches(c, [])).toBe(true);
  });
});

describe('4.57: «Llevar a reunión…» › Nueva subcabecera aquí', () => {
  const REU = '* Reunión lunes\n** Orden del día\n';
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const q = (id) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const open = (store, extra = {}) =>
    askRefileTarget({
      title: 'Llevar a la reunión…',
      files: [{ path: '/reuniones.org', name: 'reuniones.org', group: 'gtd' }],
      onlyPath: '/reuniones.org',
      getIndex: () => headingIndex(store.getState().org.present.get('files'), { skipDiary: true }),
      ensureLoaded: async () => true,
      ...extra,
    });

  test('sin allowNew no sale la opción', async () => {
    const store = makeStore({ '/reuniones.org': REU });
    const p = open(store);
    await tick();
    expect(q('eli-refile-new')).toHaveLength(0);
    click(q('eli-refile-here')[0]);
    await p;
  });

  test('crear en el nivel superior: devuelve el título nuevo y la madre es el fichero', async () => {
    const store = makeStore({ '/reuniones.org': REU });
    const p = open(store, { allowNew: true });
    await tick();
    expect(document.querySelector('[data-testid="eli-refile-tip"]').textContent).toContain('›');
    click(q('eli-refile-new')[0]);
    await tick();
    expect(q('eli-refile-create')).toHaveLength(0); // aún sin título
    const input = document.querySelector('[data-testid="eli-refile-search"]');
    input.value = 'Reunión martes';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    click(q('eli-refile-create')[0]);
    const t = await p;
    expect(t).toMatchObject({ path: '/reuniones.org', headerId: null, newTitle: 'Reunión martes' });
  });

  test('crear dentro de una cabecera (entrando con ›): la madre es esa cabecera', async () => {
    const store = makeStore({ '/reuniones.org': REU, '/agendas.org': AG });
    const p = open(store, { allowNew: true });
    await tick();
    click(q('eli-refile-enter')[0]); // Reunión lunes
    await tick();
    click(q('eli-refile-new')[0]);
    await tick();
    const input = document.querySelector('[data-testid="eli-refile-search"]');
    input.value = 'Ruegos';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    document
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const t = await p;
    expect(t.title).toBe('Reunión lunes');
    expect(t.newTitle).toBe('Ruegos');
    expect(t.headerId).toBeTruthy();
    // quien llama la crea (como agendaToMeeting) y mueve el punto a ella
    const newId = store.dispatch(
      gtdAddTask({ path: t.path, parentId: t.headerId }, { title: t.newTitle, keyword: null })
    );
    expect(newId).toBeTruthy();
    const p2 = nodeOf(store, 'Punto dos');
    store.dispatch(
      gtdRefileTo([{ path: '/agendas.org', id: p2.headerId, key: 'k' }], t.path, newId)
    );
    expect(fileText(store, '/reuniones.org')).toMatch(
      /\* Reunión lunes\n\*\* Orden del día\n\*\* Ruegos\n\*\*\* Punto dos\n/
    );
    expect(fileText(store, '/agendas.org')).not.toContain('Punto dos');
  });

  test('Esc en el campo del título vuelve a la lista sin cerrar; Esc otra vez cancela', async () => {
    const store = makeStore({ '/reuniones.org': REU });
    const p = open(store, { allowNew: true });
    await tick();
    click(q('eli-refile-new')[0]);
    await tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(q('eli-refile-new')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
  });
});

describe('4.57: orden de secciones (arrastrar)', () => {
  test('reorderIds mueve junto a la fila de destino', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(reorderIds(order, 'a', { id: 'c', after: true })).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderIds(order, 'd', { id: 'a', after: false })).toEqual(['d', 'a', 'b', 'c']);
    expect(reorderIds(order, 'a', { id: 'a', after: true })).toEqual(order);
  });
  test('dropTargetAt elige la fila bajo el puntero', () => {
    document.body.innerHTML =
      '<div id="l"><div data-drag-id="a"></div><div data-drag-id="b"></div><div data-drag-id="c"></div></div>';
    const rows = Array.from(document.querySelectorAll('[data-drag-id]'));
    rows.forEach((el, i) => {
      el.getBoundingClientRect = () => ({ top: i * 20, height: 20 });
    });
    const box = document.getElementById('l');
    expect(dropTargetAt(box, 5, 'a')).toEqual({ id: 'b', after: false });
    expect(dropTargetAt(box, 55, 'a')).toEqual({ id: 'c', after: true });
    document.body.innerHTML = '';
  });
});

describe('4.57: reuniones en una sección propia con «cabeceras sin tarea»', () => {
  const FILE = [
    '#+TODO: TODO NEXT | DONE',
    '* Suelta A',
    '* Reuniones',
    ':PROPERTIES:',
    ':TYPE: meeting',
    ':END:',
    '** Lunes',
    '*** Punto 1',
    '**** Detalle',
    '** Martes',
    '* Suelta B',
    '',
  ].join('\n');
  const setup = () => {
    const store = makeStore({ '/tasks.org': FILE });
    const tasks = buildTasks(store.getState().org.present.get('files'), []);
    return { tasks, by: (title) => tasks.find((t) => t.title === title) };
  };
  test('lo que cuelga de una cabecera meeting hereda el tipo', () => {
    const { by } = setup();
    expect(by('Detalle').type).toBe('meeting');
    expect(by('Suelta A').type).toBeFalsy();
  });
  test('las meeting salen como árbol (sangría por nivel) y el resto no cambia de sitio', () => {
    const { tasks, by } = setup();
    // orden por título, como en una sección (los títulos mandan): mezcla de meeting y sueltas
    const list = ['Suelta B', 'Punto 1', 'Lunes', 'Suelta A', 'Martes', 'Reuniones', 'Detalle'].map(
      by
    );
    const { list: out, depth } = nestMeetingRows(tasks, list);
    expect(out.map((t) => t.title)).toEqual([
      'Suelta B',
      'Reuniones',
      'Lunes',
      'Punto 1',
      'Detalle',
      'Martes',
      'Suelta A',
    ]);
    const d = (title) => depth.get(by(title).key);
    expect([d('Reuniones'), d('Lunes'), d('Punto 1'), d('Detalle'), d('Martes')]).toEqual([
      0,
      1,
      2,
      3,
      1,
    ]);
  });
  test('sin cabeceras meeting, la lista queda exactamente igual', () => {
    const { tasks, by } = setup();
    const list = ['Suelta B', 'Suelta A'].map(by);
    const r = nestMeetingRows(tasks, list);
    expect(r.list).toBe(list);
    expect(r.depth.size).toBe(0);
  });
  test('una meeting cuya madre no está en la lista cuelga de la más cercana que sí (o es raíz)', () => {
    const { tasks, by } = setup();
    const list = ['Punto 1', 'Detalle'].map(by);
    const { list: out, depth } = nestMeetingRows(tasks, list);
    expect(out.map((t) => t.title)).toEqual(['Punto 1', 'Detalle']);
    expect([depth.get(by('Punto 1').key), depth.get(by('Detalle').key)]).toEqual([0, 1]);
  });
});
