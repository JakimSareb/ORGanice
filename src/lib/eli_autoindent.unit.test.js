import { autoIndentEnter, isPlainEnter } from './eli_autoindent';

describe('autoIndentEnter (3.47)', () => {
  test('copia la sangría de la línea del cursor', () => {
    const v = 'Uno\n   dos';
    const r = autoIndentEnter(v, v.length);
    expect(r.value).toBe('Uno\n   dos\n   ');
    expect(r.cursor).toBe(r.value.length);
  });

  test('con tabuladores y en medio de la línea', () => {
    const v = '\tab cd';
    const r = autoIndentEnter(v, 3);
    expect(r.value).toBe('\tab\n\t cd');
    expect(r.cursor).toBe(5);
  });

  test('sustituye lo seleccionado', () => {
    const v = '  hola mundo';
    const r = autoIndentEnter(v, 6, 12);
    expect(r.value).toBe('  hola\n  ');
  });

  test('sin sangría no hace nada', () => {
    expect(autoIndentEnter('Uno\ndos', 7)).toBeNull();
    expect(autoIndentEnter('', 0)).toBeNull();
  });

  test('solo un Intro sin modificadores', () => {
    expect(isPlainEnter({ key: 'Enter' })).toBe(true);
    expect(isPlainEnter({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(isPlainEnter({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false);
    expect(isPlainEnter({ key: 'a' })).toBe(false);
  });
});
