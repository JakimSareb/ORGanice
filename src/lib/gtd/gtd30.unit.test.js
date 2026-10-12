import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { exportOrg } from '../export_org';
import rootOrgReducer from '../../reducers/org';
import { setGtdConfig } from './gtd_sections';
import {
  buildTasks,
  tasksForView,
  doneForView,
  dueInfo,
  tasksToMarkdown,
  totalEffort,
  listOf,
  countsFor,
} from './gtd_model';
import {
  gtdToggleDone,
  gtdCleanup,
  gtdTrash,
  gtdEmptyTrash,
  gtdDuplicate,
  gtdSaveMany,
  gtdRenameTag,
  untrashChanges,
} from './gtd_actions';
import { parseRapidEntry, parseRapidDate } from './gtd_rapid';

const P = '/p.org';
const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 13); // martes 13-oct-2026

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
const titles = (list) => list.map((t) => t.title);

beforeAll(() => setGtdConfig(null));
beforeEach(() => {
  try {
    window.localStorage.removeItem('eliGtdAutoCollect');
  } catch (e) {}
});

describe('3.0: grupo «Hecho» y Limpieza', () => {
  test('al terminarla queda en el «Hecho» de su lista; la Limpieza la pasa al Logbook', () => {
    const store = makeStore('* NEXT Llamar\n* NEXT Otra\n');
    store.dispatch(gtdToggleDone(find(store.state(), 'Llamar')));
    let all = tasksOf(store.state());
    expect(textOf(store.state())).toMatch(/:DONE_IN: next/);
    expect(titles(tasksForView(all, { id: 'next' }, {}, TODAY))).toEqual(['Otra']);
    expect(titles(doneForView(all, { id: 'next' }))).toEqual(['Llamar']);
    expect(titles(tasksForView(all, { id: 'logbook' }, {}, TODAY))).toEqual([]);
    store.dispatch(gtdCleanup(tasksOf(store.state())));
    all = tasksOf(store.state());
    expect(textOf(store.state())).not.toMatch(/DONE_IN/);
    expect(titles(doneForView(all, { id: 'next' }))).toEqual([]);
    expect(titles(tasksForView(all, { id: 'logbook' }, {}, TODAY))).toEqual(['Llamar']);
  });

  test('con ★: también en el «Hecho» de Focus, y al reabrirla recupera lista y ★', () => {
    const store = makeStore('* WAITING [#A] Respuesta\n');
    store.dispatch(gtdToggleDone(find(store.state(), 'Respuesta')));
    const t = find(store.state(), 'Respuesta');
    expect(t.isDone).toBe(true);
    expect(titles(doneForView(tasksOf(store.state()), { id: 'focus' }))).toEqual(['Respuesta']);
    store.dispatch(gtdToggleDone(t));
    const back = find(store.state(), 'Respuesta');
    expect(back.keyword).toBe('WAITING');
    expect(back.priority).toBe('A');
    expect(back.doneIn).toBe(null);
  });

  test('con «pasar al Logbook al momento» no se pone DONE_IN', () => {
    window.localStorage.setItem('eliGtdAutoCollect', 'true');
    const store = makeStore('* NEXT Algo\n');
    store.dispatch(gtdToggleDone(find(store.state(), 'Algo')));
    expect(textOf(store.state())).not.toMatch(/DONE_IN/);
    expect(listOf(find(store.state(), 'Algo'), TODAY)).toBe('logbook');
  });

  test('la Limpieza es un solo paso para varias tareas', () => {
    const store = makeStore('* NEXT A\n* NEXT B\n');
    store.dispatch(gtdToggleDone(find(store.state(), 'A')));
    store.dispatch(gtdToggleDone(find(store.state(), 'B')));
    const n = store.dispatch(gtdCleanup(tasksOf(store.state())));
    expect(n).toBe(2);
  });
});

describe('3.0: Papelera', () => {
  test('tirar: sale de todas las listas (con lo que cuelga) y entra en la Papelera', () => {
    const store = makeStore(
      '* PROJECT Proy\n** NEXT Paso\n* NEXT Suelta\n* TODO Queda\n'
    );
    store.dispatch(gtdTrash([find(store.state(), 'Proy'), find(store.state(), 'Suelta')]));
    const all = tasksOf(store.state());
    expect(textOf(store.state())).toMatch(/\* PROJECT Proy +:trash:/);
    expect(titles(tasksForView(all, { id: 'next' }, {}, TODAY))).toEqual([]);
    expect(titles(tasksForView(all, { id: 'trash' }, {}, TODAY))).toEqual(['Proy', 'Suelta']);
    expect(countsFor(all, {}, TODAY).trash).toBe(2);
    expect(listOf(find(store.state(), 'Paso'), TODAY)).toBe('trash');
  });

  test('sacarla de la papelera y vaciarla', () => {
    const store = makeStore('* NEXT Uno\n* NEXT Dos\n** TODO Hija\n');
    store.dispatch(gtdTrash([find(store.state(), 'Uno'), find(store.state(), 'Dos')]));
    const uno = find(store.state(), 'Uno');
    store.dispatch(gtdSaveMany([[uno, untrashChanges(uno)]]));
    expect(listOf(find(store.state(), 'Uno'), TODAY)).toBe('next');
    store.dispatch(gtdEmptyTrash(tasksOf(store.state())));
    const out = textOf(store.state());
    expect(out).toContain('* NEXT Uno');
    expect(out).not.toContain('Dos');
    expect(out).not.toContain('Hija');
  });
});

describe('3.0: copia, etiquetas, Focus de proyectos', () => {
  test('«Hacer una copia» pone una copia exacta justo debajo', () => {
    const store = makeStore('* NEXT Original :casa:\n** TODO Sub\n* TODO Después\n');
    store.dispatch(gtdDuplicate([find(store.state(), 'Original')]));
    expect(textOf(store.state())).toMatch(
      /\* NEXT Original +:casa:\n\*\* TODO Sub\n\* NEXT Original +:casa:\n\*\* TODO Sub\n\* TODO Después/
    );
  });

  test('renombrar una etiqueta en todas las tareas', () => {
    const store = makeStore('* NEXT A :@casa:\n* TODO B :@casa:otra:\n* TODO C\n');
    store.dispatch(gtdRenameTag(tasksOf(store.state()), '@casa', '@hogar'));
    const out = textOf(store.state());
    expect(out).toMatch(/A +:@hogar:/);
    expect(out).toMatch(/B +:@hogar:otra:/);
  });

  test('un proyecto con ★ sale en Focus; sin ★ o dormido, no', () => {
    const store = makeStore(
      '* PROJECT [#A] Con estrella\n* PROJECT Sin estrella\n* PROJECT [#A] Dormido :sleep:\n'
    );
    const focus = tasksForView(tasksOf(store.state()), { id: 'focus' }, {}, TODAY);
    expect(titles(focus)).toEqual(['Con estrella']);
  });

  test('vista de una etiqueta: lo abierto que la lleva (también proyectos)', () => {
    const store = makeStore(
      '* PROJECT Casa :hogar:\n** NEXT Pintar\n* TODO Suelta :hogar:\n* DONE Hecha :hogar:\n* TODO Otra\n'
    );
    const v = tasksForView(tasksOf(store.state()), { id: 'tag', tag: 'hogar' }, {}, TODAY);
    expect(titles(v).sort()).toEqual(['Casa', 'Pintar', 'Suelta']);
  });

  test('Inbox no se filtra por área', () => {
    const store = makeStore('* Idea\n:PROPERTIES:\n:AREA: Trabajo\n:END:\n');
    const all = buildTasks(store.state().get('files'), [P]);
    expect(titles(tasksForView(all, { id: 'inbox' }, { area: 'Hogar' }, TODAY))).toEqual([
      'Idea',
    ]);
  });
});

describe('3.0: fechas, Markdown y tiempo total', () => {
  test('fecha límite como Nirvana', () => {
    expect(dueInfo(new Date(2026, 9, 12), TODAY)).toMatchObject({ level: 'overdue', text: 'Atrasada' });
    expect(dueInfo(new Date(2026, 9, 13), TODAY)).toMatchObject({ level: 'today', text: 'Vence hoy' });
    expect(dueInfo(new Date(2026, 9, 14), TODAY)).toMatchObject({ level: 'soon', text: 'Mañana' });
    expect(dueInfo(new Date(2026, 9, 16), TODAY).text).toBe('en 3 días');
    expect(dueInfo(new Date(2026, 11, 1), TODAY).level).toBe('later');
  });

  test('Markdown de la lista', () => {
    const md = tasksToMarkdown('Next', [
      { title: 'Uno', isDone: false, project: { title: 'Casa' }, deadline: new Date(2026, 9, 20) },
      { title: 'Dos', isDone: true },
    ]);
    expect(md).toBe('## Next\n\n- [ ] Uno (Casa) (due: 2026-10-20)\n- [x] Dos');
  });

  test('tiempo total', () => {
    expect(totalEffort([{ effort: '0:30' }, { effort: '1:00' }, {}])).toBe('1 h 30 min');
    expect(totalEffort([{}])).toBe('');
  });
});

describe('3.0: Entrada rápida', () => {
  test('el ejemplo de Nirvana', () => {
    const r = parseRapidEntry('Comprar la compra #Personal #recado #star #due August 1', TODAY);
    expect(r.title).toBe('Comprar la compra');
    expect(r.tags).toEqual(['Personal', 'recado']);
    expect(r.focus).toBe(true);
    expect(r.deadline).toEqual(new Date(2027, 7, 1));
  });

  test('listas, proyecto y fechas en español', () => {
    expect(parseRapidEntry('Algo #someday', TODAY).list).toBe('someday');
    expect(parseRapidEntry('Reforma #proyecto', TODAY).project).toBe(true);
    expect(parseRapidDate('mañana', TODAY)).toEqual(new Date(2026, 9, 14));
    expect(parseRapidDate('hoy', TODAY)).toEqual(new Date(2026, 9, 13));
    expect(parseRapidDate('lunes', TODAY)).toEqual(new Date(2026, 9, 19));
    expect(parseRapidDate('martes', TODAY)).toEqual(new Date(2026, 9, 20));
    expect(parseRapidDate('1 de diciembre', TODAY)).toEqual(new Date(2026, 11, 1));
    expect(parseRapidDate('20/10', TODAY)).toEqual(new Date(2026, 9, 20));
    expect(parseRapidDate('2027-01-05', TODAY)).toEqual(new Date(2027, 0, 5));
    expect(parseRapidDate('mmm', TODAY)).toBe(null);
  });

  test('sin #: todo es el título', () => {
    expect(parseRapidEntry('Llamar a Ana', TODAY)).toMatchObject({ title: 'Llamar a Ana', tags: [] });
  });
});
