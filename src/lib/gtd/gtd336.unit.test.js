// ORG Mode para Eli (3.36): filtro de etiquetas con o sin las heredadas
import { Map } from 'immutable';
import { parseOrg } from '../parse_org';
import { setGtdConfig } from './gtd_sections';
import { buildTasks, tasksForView, matchesFilters, facetsFor } from './gtd_model';

const HEAD = '#+TODO: TODO NEXT WAITING MAYBE PROJECT | DONE CANCELLED\n';
const TODAY = new Date(2026, 9, 20);
const tasksFrom = (text) => buildTasks(Map([['/a.org', parseOrg(HEAD + text)]]), []);
const titles = (list) => list.map((t) => t.title).sort();

beforeAll(() => setGtdConfig(null));

describe('3.36: etiquetas heredadas en los filtros', () => {
  const tasks = tasksFrom(
    '* PROJECT Casa :@casa:\n** NEXT Pintar\n** NEXT Lijar :@casa:\n* NEXT Llamar :@casa:\n* NEXT Otra\n'
  );
  const next = tasksForView(tasks, { id: 'next' }, {}, TODAY);

  test('por defecto cuentan las heredadas', () => {
    expect(titles(next.filter((t) => matchesFilters(t, { tags: ['@casa'] })))).toEqual([
      'Lijar',
      'Llamar',
      'Pintar',
    ]);
    expect(facetsFor(next).hasInherited).toBe(true);
  });

  test('ownTagsOnly: solo las asignadas directamente', () => {
    const f = { tags: ['@casa'], ownTagsOnly: true };
    expect(titles(next.filter((t) => matchesFilters(t, f)))).toEqual(['Lijar', 'Llamar']);
    const fn = { notTags: ['@casa'], ownTagsOnly: true };
    expect(titles(next.filter((t) => matchesFilters(t, fn)))).toEqual(['Otra', 'Pintar']);
    expect(facetsFor(next, { ownOnly: true }).hasInherited).toBe(true);
  });

  test('3.39 noInherited: fuera las que tienen alguna heredada', () => {
    const f = { noInherited: true, ownTagsOnly: true };
    expect(titles(next.filter((t) => matchesFilters(t, f)))).toEqual(['Lijar', 'Llamar', 'Otra']);
  });

  test('sin heredadas en la lista, no hace falta el botón', () => {
    const loose = tasksFrom('* NEXT Llamar :@casa:\n* NEXT Otra\n');
    expect(facetsFor(tasksForView(loose, { id: 'next' }, {}, TODAY)).hasInherited).toBe(false);
  });
});
