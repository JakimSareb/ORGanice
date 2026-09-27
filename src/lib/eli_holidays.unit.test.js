import {
  easterSunday,
  holidaysForYear,
  parseCustomHolidays,
  workingDaysBetween,
  keyOfDate,
} from './eli_holidays';

describe('festivos (2.13)', () => {
  test('domingo de Pascua', () => {
    expect(keyOfDate(easterSunday(2026))).toBe('2026-04-05');
    expect(keyOfDate(easterSunday(2027))).toBe('2027-03-28');
    expect(keyOfDate(easterSunday(2024))).toBe('2024-03-31');
  });

  test('2026 según el BOE: Cataluña', () => {
    const { map, exact } = holidaysForYear(2026, 'CT');
    expect(exact).toBe(true);
    ['2026-04-03', '2026-04-06', '2026-06-24', '2026-09-11', '2026-12-26'].forEach((k) =>
      expect(map.has(k)).toBe(true)
    );
    expect(map.has('2026-04-02')).toBe(false); // sin Jueves Santo
  });

  test('otros años, aproximados con las reglas', () => {
    const { map, exact } = holidaysForYear(2027, 'MD');
    expect(exact).toBe(false);
    expect(map.get('2027-03-26')).toEqual(['Viernes Santo']);
    expect(map.get('2027-03-25')).toEqual(['Jueves Santo']);
    expect(map.has('2027-05-02')).toBe(true);
  });

  test('festivos propios', () => {
    expect(
      parseCustomHolidays('15/05 San Isidro\n24/09/2026 La Mercè\n2027-01-02 Otro\nbasura')
    ).toEqual([
      { year: null, month: 5, day: 15, name: 'San Isidro' },
      { year: 2026, month: 9, day: 24, name: 'La Mercè' },
      { year: 2027, month: 1, day: 2, name: 'Otro' },
    ]);
    const { map } = holidaysForYear(2026, '', '15/05 San Isidro\n24/09/2025 No');
    expect(map.get('2026-05-15')).toEqual(['San Isidro']);
    expect(map.has('2026-09-24')).toBe(false);
  });

  test('días laborables entre dos fechas', () => {
    const { map } = holidaysForYear(2026, 'CT');
    const of = (d) => map.get(keyOfDate(d));
    // Semana Santa 2026 en Cataluña: del lunes 30/3 al domingo 12/4
    expect(workingDaysBetween(new Date(2026, 2, 30), new Date(2026, 3, 12), of)).toBe(8);
  });
});
