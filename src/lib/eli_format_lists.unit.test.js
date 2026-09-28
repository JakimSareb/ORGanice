import { applyListMarker, continueListOnEnter } from './eli_format';

describe('2.16: marcadores de lista', () => {
  test('poner, cambiar y quitar', () => {
    expect(applyListMarker('hola', 2, 2, 'check').value).toBe('- [ ] hola');
    expect(applyListMarker('- hola', 3, 3, 'plus').value).toBe('+ hola');
    expect(applyListMarker('- [ ] hola', 3, 3, 'check').value).toBe('hola');
    expect(applyListMarker('a\nb\n\nc', 0, 6, 'num').value).toBe('1. a\n2. b\n\n3. c');
    expect(applyListMarker('  - x', 4, 4, 'none').value).toBe('  x');
    expect(applyListMarker('* Título', 2, 2, 'dash').value).toBe('- * Título');
  });
  test('Intro continúa la lista', () => {
    expect(continueListOnEnter('- [X] pan', 9)).toEqual({ value: '- [X] pan\n- [ ] ', pos: 16 });
    expect(continueListOnEnter('3. tres', 7)).toEqual({ value: '3. tres\n4. ', pos: 11 });
    expect(continueListOnEnter('  + a', 5)).toEqual({ value: '  + a\n  + ', pos: 10 });
    expect(continueListOnEnter('x\n- ', 4)).toEqual({ value: 'x\n', pos: 2 });
    expect(continueListOnEnter('texto', 5)).toBe(null);
    expect(continueListOnEnter('- [ ] a\n- [X]', 13)).toEqual({ value: '- [ ] a\n', pos: 8 });
    expect(continueListOnEnter('* Encabezado', 12)).toBe(null);
  });
});
