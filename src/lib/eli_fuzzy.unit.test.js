import { fuzzyScore } from './eli_fuzzy';

describe('fuzzyScore', () => {
  test('letras en orden', () => {
    expect(fuzzyScore('cmppnt', 'Comprar pintura')).not.toBeNull();
    expect(fuzzyScore('pntcmp', 'Comprar pintura')).toBeNull();
  });
  test('sin tildes ni mayúsculas', () => {
    expect(fuzzyScore('japon', 'Viaje a Japón')).not.toBeNull();
    expect(fuzzyScore('SALON', 'Pintar el salón')).not.toBeNull();
  });
  test('varias palabras: todas deben encajar', () => {
    expect(fuzzyScore('pint sal', 'Pintar el salón')).not.toBeNull();
    expect(fuzzyScore('pint coche', 'Pintar el salón')).toBeNull();
  });
  test('lo exacto y al principio puntúa más', () => {
    expect(fuzzyScore('agenda', 'Agenda de hoy')).toBeGreaterThan(fuzzyScore('agenda', 'Ajustes de la agenda'));
    expect(fuzzyScore('pin', 'Pintar')).toBeGreaterThan(fuzzyScore('pin', 'Paso intermedio'));
  });
});
