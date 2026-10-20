// (3.46) desplazamiento automático al arrastrar: se mide sobre la parte visible de la caja
import { edgeDir, visibleSpan } from './useRowDrag';

describe('useRowDrag (3.46)', () => {
  test('la franja de abajo cuenta desde el borde de la pantalla, no desde el del menú', () => {
    // menú que sigue 40 px por debajo de la pantalla (zona segura del iPhone)
    const span = visibleSpan({ top: 44, bottom: 820 }, 780);
    expect(span).toEqual({ top: 44, bottom: 780 });
    expect(edgeDir(740, span, 90)).toBe(1);
    expect(edgeDir(100, span, 90)).toBe(-1);
    expect(edgeDir(400, span, 90)).toBe(0);
  });
  test('caja baja: la franja no ocupa más de un tercio', () => {
    const span = { top: 0, bottom: 150 };
    expect(edgeDir(75, span, 90)).toBe(0);
    expect(edgeDir(10, span, 90)).toBe(-1);
    expect(edgeDir(140, span, 90)).toBe(1);
  });
});
