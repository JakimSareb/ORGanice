// 4.19: atajos de GTD — Mayús+B (filtrar la sección) distinto de B (buscar).
import { Map } from 'immutable';
import { calculateGtdKeybindings } from '../keybindings';
import { gtdMatchesBinding } from '../eli_hotkeys';

const hit = (key, shiftKey) => {
  const ev = { key: shiftKey ? key.toUpperCase() : key, code: `Key${key.toUpperCase()}`, shiftKey };
  return calculateGtdKeybindings(Map()).filter((b) => gtdMatchesBinding(ev, b.binding));
};

describe('4.19 atajos GTD', () => {
  it('Mayús+B filtra la sección y B sigue buscando', () => {
    expect(hit('b', true).map((b) => b.action)).toEqual(['gtdFilterSection']);
    expect(hit('b', false).map((b) => b.action)).toEqual(['gtdSearch2']);
  });
  it('el atajo es configurable como los demás', () => {
    const b = calculateGtdKeybindings(Map()).find((x) => x.action === 'gtdFilterSection');
    expect(b.name).toBe('GTD: filtrar esta sección');
    expect(b.group).toBe('Más');
  });
});
