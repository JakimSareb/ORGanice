// 3.40: Procesar Inbox (partes puras)
import {
  ticklerPlan,
  ticklerYearTitle,
  parseTagsInput,
  personTag,
  mergeTags,
  ticklerPathNear,
  isTicklerPath,
} from './gtd_process';

const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};
const h = (id, level, title) => ({ id, nestingLevel: level, title });

describe('3.40 tickler', () => {
  test('fichero vacío: crea año y mes', () => {
    const p = ticklerPlan([], new Date(2027, 11, 3), ids());
    expect(p.create).toEqual([
      { kind: 'add', id: 'n1', title: '*[ TICKLER 2027 ]*', parentId: null },
      { kind: 'add', id: 'n2', title: 'DICIEMBRE', parentId: 'n1' },
    ]);
    expect(p.monthId).toBe('n2');
  });
  test('año y mes existentes: no crea nada', () => {
    const hs = [h('y', 1, ticklerYearTitle(2027)), h('d', 2, 'DICIEMBRE'), h('x', 3, 'algo')];
    const p = ticklerPlan(hs, new Date(2027, 11, 20), ids());
    expect(p.create).toEqual([]);
    expect(p.monthId).toBe('d');
  });
  test('mes nuevo entre otros: de diciembre a enero', () => {
    const hs = [
      h('y', 1, '*[ TICKLER 2027 ]*'),
      h('d', 2, 'DICIEMBRE'),
      h('x', 3, 'algo'),
      h('mar', 2, 'MARZO'),
    ];
    const p = ticklerPlan(hs, new Date(2027, 5, 1), ids());
    expect(p.create).toEqual([
      { kind: 'add', id: 'n1', title: 'JUNIO', parentId: 'y' },
      { kind: 'move', id: 'n1', targetId: 'mar', position: 'before' },
    ]);
  });
  test('año nuevo: del más nuevo al más viejo (por defecto)', () => {
    const hs = [h('y7', 1, '*[ TICKLER 2027 ]*'), h('d', 2, 'DICIEMBRE')];
    const p = ticklerPlan(hs, new Date(2028, 0, 1), ids());
    expect(p.create.slice(0, 2)).toEqual([
      { kind: 'add', id: 'n1', title: '*[ TICKLER 2028 ]*', parentId: null },
      { kind: 'move', id: 'n1', targetId: 'y7', position: 'before' },
    ]);
  });
  test('años en orden ascendente: se respeta', () => {
    const hs = [h('a', 1, '*[ TICKLER 2026 ]*'), h('b', 1, '*[ TICKLER 2028 ]*')];
    const p = ticklerPlan(hs, new Date(2027, 0, 1), ids());
    expect(p.create[1]).toEqual({ kind: 'move', id: 'n1', targetId: 'b', position: 'before' });
  });
  test('rutas', () => {
    expect(ticklerPathNear('/org/inbox.org')).toBe('/org/tickler.org');
    expect(ticklerPathNear('inbox.org')).toBe('/tickler.org');
    expect(isTicklerPath('/a/Tickler.org')).toBe(true);
  });
});

describe('3.40 etiquetas', () => {
  test('parseTagsInput', () => {
    expect(parseTagsInput('casa @tel')).toEqual(['casa', '@tel']);
    expect(parseTagsInput('Ana López, casa')).toEqual(['Ana_López', 'casa']);
    expect(parseTagsInput('  ')).toEqual([]);
  });
  test('personTag y mergeTags', () => {
    expect(personTag(' Ana  López ')).toBe('Ana_López');
    expect(personTag('')).toBe(null);
    expect(mergeTags(['a'], ['A', 'b'])).toEqual(['a', 'b']);
  });
});
