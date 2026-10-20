import { scrollDeltaFor } from './eli_caret_view';

describe('scrollDeltaFor (3.47)', () => {
  const band = { top: 50, bottom: 600 };

  test('cursor visible: no se mueve', () => {
    expect(scrollDeltaFor(300, 320, band)).toBe(0);
  });

  test('cursor bajo el borde de abajo: baja lo justo', () => {
    expect(scrollDeltaFor(650, 670, band)).toBe(670 - (600 - 12));
  });

  test('cursor por encima de la barra de arriba: sube', () => {
    expect(scrollDeltaFor(10, 30, band)).toBe(10 - (50 + 12));
  });

  test('franja demasiado pequeña: no hace nada', () => {
    expect(scrollDeltaFor(100, 120, { top: 0, bottom: 20 })).toBe(0);
  });
});
