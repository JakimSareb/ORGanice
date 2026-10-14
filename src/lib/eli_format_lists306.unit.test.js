import { applyListMarker, cycleListType, sortList, emptyOrgTable } from './eli_format';

describe('listas en las notas (3.06)', () => {
  test('numerar varias líneas respeta los niveles', () => {
    const v = 'a\n  b\n  c\nd';
    const r = applyListMarker(v, 0, v.length, 'num');
    expect(r.value).toBe('1. a\n  1. b\n  2. c\n2. d');
  });
  test('cambiar tipo cíclico - → + → 1. → 1) → -', () => {
    let v = 'x\n- uno\n  sub\n- dos\nfin';
    let r = cycleListType(v, 4);
    expect(r.value).toBe('x\n+ uno\n  sub\n+ dos\nfin');
    r = cycleListType(r.value, 4);
    expect(r.value).toBe('x\n1. uno\n  sub\n2. dos\nfin');
    r = cycleListType(r.value, 4);
    expect(r.value).toBe('x\n1) uno\n  sub\n2) dos\nfin');
    r = cycleListType(r.value, 4);
    expect(r.value).toBe('x\n- uno\n  sub\n- dos\nfin');
    expect(cycleListType('nada', 2)).toBe(null);
  });
  test('ordenar: A→Z con lo que cuelga, casillas hechas al final, numerada renumerada', () => {
    const v = '1. pera\n   nota pera\n2. Árbol\n3. manzana';
    expect(sortList(v, 3, 'alpha').value).toBe('1. Árbol\n2. manzana\n3. pera\n   nota pera');
    const c = '- [X] hecho\n- [ ] a\n- [ ] b';
    expect(sortList(c, 2, 'check').value).toBe('- [ ] a\n- [ ] b\n- [X] hecho');
    const n = '- 10 diez\n- 2 dos';
    expect(sortList(n, 1, 'num').value).toBe('- 2 dos\n- 10 diez');
  });
  test('tabla vacía', () => {
    expect(emptyOrgTable().split('\n')).toHaveLength(4);
  });
});
