import { eliWordCase } from './eli_word_case';
import {
  normalizeLayout,
  layoutRows,
  moveRow,
  splitMenuLayout,
  TOPBAR_LINE,
} from './eli_menu_layout';
import { addEntry } from './eli_diary';
import { projectSections } from './gtd/gtd_model';
import { bindingFromEvent } from './eli_binding_capture';
import { calculateDocKeybindings } from './keybindings';
import { Map as IMap } from 'immutable';

const apply = (text, start, end, mode) => {
  const c = eliWordCase(text, start, end, mode);
  if (!c) return null;
  return {
    text: text.slice(0, c.from) + c.replacement + text.slice(c.to),
    cursor: c.cursor,
  };
};

describe('4.45 C3 eliWordCase (M-u / M-c)', () => {
  test('palabra siguiente en MAYÚSCULAS y cursor tras ella', () => {
    expect(apply('hola mundo', 0, 0, 'upper')).toEqual({ text: 'HOLA mundo', cursor: 4 });
    expect(apply('hola mundo', 4, 4, 'upper')).toEqual({ text: 'hola MUNDO', cursor: 10 });
  });
  test('a mitad de palabra actúa desde el cursor', () => {
    expect(apply('hola', 2, 2, 'upper')).toEqual({ text: 'hoLA', cursor: 4 });
    expect(apply('hOLA', 2, 2, 'capital')).toEqual({ text: 'hOLa', cursor: 4 });
  });
  test('inicial en mayúscula y resto en minúscula', () => {
    expect(apply('hOLA mUNDO', 0, 0, 'capital')).toEqual({ text: 'Hola mUNDO', cursor: 4 });
  });
  test('acentos y eñes', () => {
    expect(apply('canción ñu', 0, 0, 'upper').text).toBe('CANCIÓN ñu');
    expect(apply('ñandú', 0, 0, 'capital').text).toBe('Ñandú');
  });
  test('con selección se aplica a la selección', () => {
    expect(apply('uno dos tres', 4, 12, 'capital')).toEqual({ text: 'uno Dos Tres', cursor: 12 });
    expect(apply('uno dos tres', 0, 3, 'upper').text).toBe('UNO dos tres');
  });
  test('al final del texto no hay nada que cambiar', () => {
    expect(eliWordCase('hola ', 5, 5, 'upper')).toBe(null);
    expect(eliWordCase('', 0, 0, 'upper')).toBe(null);
  });
});

describe('4.45 B línea «Barra superior»', () => {
  test('por defecto la línea está arriba del todo y nada sale en la barra', () => {
    const l = normalizeLayout(null);
    expect(l.bar).toBe(0);
    expect(layoutRows(l)[0]).toBe(TOPBAR_LINE);
    const items = [
      { menuId: 'find', label: 'a' },
      { menuId: 'agenda', label: 'b' },
      { label: 'Ajustes' },
    ];
    const s = splitMenuLayout(items, l, 99);
    expect(s.bar).toEqual([]);
    expect(s.menu.map((x) => x.label)).toEqual(['a', 'b', 'Ajustes']);
  });
  test('bajar la línea sube herramientas a la barra, en su orden', () => {
    let l = normalizeLayout(null);
    l = moveRow(l, TOPBAR_LINE, 1);
    l = moveRow(l, TOPBAR_LINE, 1);
    expect(l.bar).toBe(2);
    const items = [
      { menuId: 'agenda', label: 'agenda' },
      { menuId: 'find', label: 'buscar' },
      { menuId: 'diary', label: 'diario' },
      { label: 'Ajustes' },
    ];
    const s = splitMenuLayout(items, l, 99);
    expect(s.bar.map((x) => x.label)).toEqual(['buscar', 'agenda']);
    expect(s.menu.map((x) => x.label)).toEqual(['diario', 'Ajustes']);
  });
  test('mover una herramienta cruzando la línea', () => {
    let l = normalizeLayout({ order: normalizeLayout(null).order, bar: 1 });
    const first = l.order[0];
    l = moveRow(l, first, 1); // cruza la línea: pasa al menú
    expect(l.bar).toBe(0);
    expect(l.order[0]).toBe(first);
  });
  test('las que no caben se quedan en el menú y las ocultas no salen', () => {
    const l = normalizeLayout({ bar: 3, hidden: ['agenda'] });
    const items = [
      { menuId: 'find', label: 'buscar' },
      { menuId: 'agenda', label: 'agenda' },
      { menuId: 'capture', label: 'capturar' },
    ];
    const s = splitMenuLayout(items, l, 1);
    expect(s.bar.map((x) => x.label)).toEqual(['buscar']);
    expect(s.menu.map((x) => x.label)).toEqual(['capturar']);
  });
});

describe('4.45 A2 apunte con la hora elegida', () => {
  test('queda ordenado por hora entre los demás', () => {
    const d = new Date(2026, 9, 27);
    let t = addEntry('', d, { text: 'tarde', mark: '-', time: '18:00' }, [], undefined);
    t = addEntry(t, d, { text: 'mañana', mark: '-', time: '08:30' }, [], undefined);
    t = addEntry(t, d, { text: 'mediodía', mark: '-', time: '12:00' }, [], undefined);
    const hours = (t.match(/\d\d:\d\d/g) || []).filter((h) =>
      ['08:30', '12:00', '18:00'].includes(h)
    );
    expect(hours).toEqual(['08:30', '12:00', '18:00']);
  });
});

describe('4.45 D2 «Next Up» en proyectos secuenciales', () => {
  const tasks = [{ key: 'p', isProject: true, ordered: true, keyword: 'PROJECT' }];
  test('rótulo según la vista secuencial', () => {
    const seq = projectSections(tasks, 'p', {}, new Date(), { sequential: true });
    const par = projectSections(tasks, 'p', {}, new Date(), { sequential: false });
    expect(seq.find((s) => s.id === 'next').label).toBe('Next Up');
    expect(par.find((s) => s.id === 'next').label).toBe('Next');
  });
});

describe('4.45 E atajos', () => {
  test('bindingFromEvent', () => {
    expect(bindingFromEvent({ key: 'u', code: 'KeyU', altKey: true })).toBe('alt+u');
    expect(bindingFromEvent({ key: ',', code: 'Comma' })).toBe(',');
    expect(bindingFromEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })).toBe(null);
  });
  test('Documentos incluye «,», «j», Alt+U y Alt+C con su grupo', () => {
    const docs = calculateDocKeybindings(IMap());
    const by = (a) => docs.find((d) => d.action === a);
    expect(by('openSettings').binding).toBe(',');
    expect(by('openDiary').binding).toBe('j');
    expect(by('eliWordUpper').binding).toBe('alt+u');
    expect(by('eliWordCapital').binding).toBe('alt+c');
    expect(by('eliWordUpper').group).toBe('Texto');
    // sin teclas repetidas entre los atajos de Documentos
    const keys = docs.map((d) => d.binding);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
