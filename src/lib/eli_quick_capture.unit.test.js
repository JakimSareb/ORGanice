import {
  parseQuickCapture,
  isCapturePath,
  stashQuickCapture,
  takeQuickCapture,
  peekQuickCapture,
} from './eli_quick_capture';

describe('(3.22) captura rápida', () => {
  test('texto simple', () => {
    expect(parseQuickCapture('?text=Comprar%20pan')).toEqual({
      title: 'Comprar pan',
      notes: '',
      edit: false,
    });
  });
  test('varias líneas: la primera es el título', () => {
    const c = parseQuickCapture('?text=' + encodeURIComponent('Llamar\nantes de las 5'));
    expect(c.title).toBe('Llamar');
    expect(c.notes).toBe('antes de las 5');
  });
  test('url va a las notas; sin texto, la url es el título', () => {
    expect(parseQuickCapture('?text=Leer&url=https%3A%2F%2Fa.es').notes).toBe('https://a.es');
    expect(parseQuickCapture('?url=https%3A%2F%2Fa.es').title).toBe('https://a.es');
  });
  test('editar=1 y vacío', () => {
    expect(parseQuickCapture('?text=x&editar=1').edit).toBe(true);
    expect(parseQuickCapture('?text=%20')).toBeNull();
    expect(parseQuickCapture('')).toBeNull();
  });
  test('ruta y almacenamiento (se usa una vez)', () => {
    expect(isCapturePath('/capture')).toBe(true);
    expect(isCapturePath('/capture/')).toBe(true);
    expect(isCapturePath('/gtd')).toBe(false);
    stashQuickCapture({ title: 'A', notes: '' });
    expect(peekQuickCapture().title).toBe('A');
    expect(takeQuickCapture().title).toBe('A');
    expect(takeQuickCapture()).toBeNull();
  });
});
