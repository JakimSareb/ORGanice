// ORG Mode para Eli (3.01): proyectos con tareas de otros ficheros, «secuenciales», filtros con
// etiquetas tachadas, cabeceras sin tarea y Entrada rápida con «>proyecto».
import { Map, List } from 'immutable';
import { parseOrg } from '../parse_org';
import { exportOrg } from '../export_org';
import rootOrgReducer from '../../reducers/org';
import { setGtdConfig } from './gtd_sections';
import {
  buildTasks,
  tasksForView,
  projectSections,
  projectsOverview,
  firstPerProject,
  matchesFilters,
  parseProjectLink,
  facetsFor,
} from './gtd_model';
import { gtdAssignProject, gtdUnassignProject } from './gtd_actions';
import {
  parseRapidEntry,
  findProjectByName,
  rapidTokenAt,
  rapidSuggestions,
  applyRapidSuggestion,
} from './gtd_rapid';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 13);
const A = '/a.org';
const B = '/b.org';

const makeStore = (files) => {
  let state = Map({
    path: null,
    files: Map(Object.keys(files).map((p) => [p, parseOrg(HEAD + files[p])])),
    fileSettings: List(),
  });
  const getState = () => ({ org: { present: state }, base: Map() });
  const dispatch = (a) => {
    if (typeof a === 'function') return a(dispatch, getState);
    state = rootOrgReducer(state, a);
    return a;
  };
  return { dispatch, state: () => state };
};
const tasksOf = (st) => buildTasks(st.get('files'), []);
const textOf = (st, p) =>
  exportOrg({
    headers: st.getIn(['files', p, 'headers']),
    linesBeforeHeadings: st.getIn(['files', p, 'linesBeforeHeadings']) || List(),
    dontIndent: true,
  });
const titles = (list) => list.map((t) => t.title);

beforeAll(() => setGtdConfig(null));

describe('3.01: tareas de otros ficheros asignadas a un proyecto', () => {
  const files = {
    [A]: '* PROJECT Casa\n:PROPERTIES:\n:ID: ABC-1\n:END:\n** NEXT Pintar\n** TODO Lijar\n',
    [B]:
      '* NEXT Comprar pintura\n:PROPERTIES:\n:PROYECTO: [[id:ABC-1][Casa]]\n:END:\n' +
      '** TODO Elegir color\n' +
      '* Catálogo de colores\n:PROPERTIES:\n:PROYECTO: [[id:ABC-1][Casa]]\n:END:\n' +
      '* NEXT Llamar\n:PROPERTIES:\n:PROYECTO: [[id:NO-EXISTE][Viejo]]\n:END:\n',
  };

  test('el enlace se lee', () => {
    expect(parseProjectLink('[[id:ABC-1][Casa]]')).toEqual({ id: 'ABC-1', title: 'Casa' });
    expect(parseProjectLink('nada')).toBe(null);
  });

  test('cuentan como las del proyecto: primero las suyas y luego las de fuera', () => {
    const st = makeStore(files).state();
    const tasks = tasksOf(st);
    const key = `${A}::${tasks.find((t) => t.title === 'Casa').id}`;
    expect(titles(tasksForView(tasks, { type: 'project', key }, {}, TODAY))).toEqual([
      'Pintar',
      'Lijar',
      'Comprar pintura',
      'Elegir color',
    ]);
    const secs = projectSections(tasks, key, {}, TODAY);
    expect(titles(secs.find((s) => s.id === 'next').tasks)).toEqual(['Pintar', 'Comprar pintura']);
    // la referencia (sin estado), en «Referencias»; no cuenta como acción
    expect(titles(secs.find((s) => s.id === 'refs').tasks)).toEqual(['Catálogo de colores']);
    const ov = projectsOverview(tasks, {}, TODAY);
    expect(ov.active[0].pending).toBe(4);
  });

  test('Next secuencial: solo la primera de cada proyecto (las de fuera, detrás)', () => {
    const st = makeStore(files).state();
    const next = tasksForView(tasksOf(st), { id: 'next' }, {}, TODAY);
    expect(titles(firstPerProject(next)).sort()).toEqual(['Llamar', 'Pintar']);
  });

  test('proyecto no encontrado: marca, suelta (sigue en Next) y filtro', () => {
    const st = makeStore(files).state();
    const tasks = tasksOf(st);
    const llamar = tasks.find((t) => t.title === 'Llamar');
    expect(llamar.badProject).toBe(true);
    expect(llamar.project).toBe(null);
    expect(titles(tasksForView(tasks, { id: 'next' }, {}, TODAY))).toContain('Llamar');
    expect(facetsFor(tasks).hasBadProject).toBe(true);
    expect(matchesFilters(llamar, { badProject: true })).toBe(true);
    expect(matchesFilters(tasks.find((t) => t.title === 'Pintar'), { badProject: true })).toBe(false);
  });

  test('asignar pone :ID: al proyecto (si no lo tiene) y :PROYECTO: a la tarea; quitar la borra', () => {
    const s = makeStore({ [A]: '* PROJECT Jardín\n** NEXT Regar\n', [B]: '* TODO Comprar abono\n' });
    let tasks = tasksOf(s.state());
    const project = tasks.find((t) => t.title === 'Jardín');
    s.dispatch(gtdAssignProject([tasks.find((t) => t.title === 'Comprar abono')], project));
    expect(textOf(s.state(), A)).toMatch(/:ID: [0-9A-F-]{36}/);
    expect(textOf(s.state(), B)).toMatch(/:PROYECTO: \[\[id:[0-9A-F-]{36}\]\[Jardín\]\]/);
    tasks = tasksOf(s.state());
    const abono = tasks.find((t) => t.title === 'Comprar abono');
    expect(abono.projectExternal).toBe(true);
    expect(abono.project.title).toBe('Jardín');
    s.dispatch(gtdUnassignProject([abono]));
    expect(textOf(s.state(), B)).not.toMatch(/PROYECTO/);
    expect(tasksOf(s.state()).find((t) => t.title === 'Comprar abono').project).toBe(null);
  });
});

describe('3.01: filtros y secciones', () => {
  test('etiqueta tachada: fuera las que la llevan', () => {
    const t = { tags: ['@casa'], title: 'x', description: '' };
    expect(matchesFilters(t, { notTags: ['@casa'] })).toBe(false);
    expect(matchesFilters(t, { notTags: ['@calle'] })).toBe(true);
  });

  test('sección propia: «Mostrar cabeceras sin tarea»', () => {
    const s = makeStore({ [A]: '* Idea suelta :leer:\n* TODO Libro :leer:\n' });
    setGtdConfig({ custom: [{ id: 'c_leer', label: 'Leer' }], sections: { c_leer: { tags: ['leer'] } } });
    expect(titles(tasksForView(tasksOf(s.state()), { id: 'c_leer' }, {}, TODAY))).toEqual(['Libro']);
    setGtdConfig({
      custom: [{ id: 'c_leer', label: 'Leer' }],
      sections: { c_leer: { tags: ['leer'], headings: true } },
    });
    expect(titles(tasksForView(tasksOf(s.state()), { id: 'c_leer' }, {}, TODAY))).toEqual([
      'Idea suelta',
      'Libro',
    ]);
    setGtdConfig(null);
  });
});

describe('3.01: Entrada rápida con «>proyecto» y autorrelleno', () => {
  const projects = [
    { key: 'a', title: 'Casa nueva' },
    { key: 'b', title: 'Viaje a Roma' },
  ];
  test('«>Nombre» hasta el siguiente #', () => {
    const r = parseRapidEntry('Comprar pintura >Casa nueva #star', TODAY);
    expect(r.title).toBe('Comprar pintura');
    expect(r.projectName).toBe('Casa nueva');
    expect(r.focus).toBe(true);
  });
  test('buscar el proyecto sin acentos ni mayúsculas', () => {
    expect(findProjectByName(projects, 'viaje')).toBe(projects[1]);
    expect(findProjectByName(projects, 'CASA NUEVA')).toBe(projects[0]);
    expect(findProjectByName(projects, 'zzz')).toBe(null);
  });
  test('lo que se escribe tras # o >', () => {
    expect(rapidTokenAt('Hola #ca', 8)).toEqual({ kind: 'tag', query: 'ca', start: 5 });
    expect(rapidTokenAt('Hola >Via', 9)).toEqual({ kind: 'project', query: 'Via', start: 5 });
    expect(rapidTokenAt('Hola', 4)).toBe(null);
    const sug = rapidSuggestions({ kind: 'tag', query: 'd' }, { tags: ['@dentro'] });
    expect(sug.map((x) => x.value)).toEqual(['@dentro', 'due']);
    const p = rapidSuggestions({ kind: 'project', query: 'ro' }, { projects });
    expect(p.map((x) => x.value)).toEqual(['Viaje a Roma']);
    const tok = rapidTokenAt('Hola >Via', 9);
    expect(applyRapidSuggestion('Hola >Via', 9, tok, p[0])).toEqual({
      text: 'Hola >Viaje a Roma ',
      caret: 19,
    });
  });
});
