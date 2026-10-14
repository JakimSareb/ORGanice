import { matchesAllSectionRules } from './gtd_sections';
import { openSubtasksOf } from './gtd_actions';

const prop = (t, n) => (t.props || {})[n] || null;
const sec = (x) => ({ states: [], tags: [], props: [], ...x });

describe('3.06: secciones propias con Y (AND)', () => {
  const t = { keyword: 'NEXT', tags: ['@casa', 'llamadas'], props: { ENERGY: 'baja' } };
  test('todas las condiciones a la vez', () => {
    expect(matchesAllSectionRules(t, sec({ states: ['NEXT'], tags: ['@casa'] }), prop)).toBe(true);
    expect(matchesAllSectionRules(t, sec({ states: ['TODO'], tags: ['@casa'] }), prop)).toBe(false);
    expect(matchesAllSectionRules(t, sec({ tags: ['@casa', 'llamadas'] }), prop)).toBe(true);
    expect(matchesAllSectionRules(t, sec({ tags: ['@casa', '@oficina'] }), prop)).toBe(false);
    expect(matchesAllSectionRules(t, sec({ tags: ['@casa'], props: ['ENERGY=baja'] }), prop)).toBe(
      true
    );
    expect(matchesAllSectionRules(t, sec({ tags: ['@casa'], props: ['ENERGY=alta'] }), prop)).toBe(
      false
    );
    expect(matchesAllSectionRules(t, sec({ props: ['EFFORT'] }), prop)).toBe(false);
    expect(matchesAllSectionRules(t, sec({ states: ['WAITING', 'NEXT'] }), prop)).toBe(true);
  });
});

describe('3.06: subtareas abiertas', () => {
  test('recursivo y solo con estado sin terminar', () => {
    const mk = (index, level, keyword, isDone = false) => ({
      key: `p::${index}`,
      path: 'p',
      index,
      level,
      keyword,
      isDone,
    });
    const tasks = [
      mk(0, 1, 'NEXT'),
      mk(1, 2, 'TODO'),
      mk(2, 2, 'DONE', true),
      mk(3, 2, null),
      mk(4, 3, 'TODO'),
      mk(5, 1, 'TODO'),
    ];
    expect(openSubtasksOf(tasks, tasks[0]).map((x) => x.index)).toEqual([1, 4]);
    expect(openSubtasksOf(tasks, tasks[5])).toEqual([]);
  });
});
