import { phasesBetween, moonState } from './lunar';

// Referencias (UTC) de efemérides publicadas (USNO / timeanddate)
const refs = [
  ['new', '2024-01-11T11:57Z'],
  ['full', '2024-01-25T17:54Z'],
  ['first', '2024-01-18T03:53Z'],
  ['last', '2024-02-02T23:18Z'],
  ['full', '2025-03-14T06:55Z'],
  ['new', '2025-03-29T10:58Z'],
];

test('fases dentro de ±2 minutos de las efemérides', () => {
  refs.forEach(([id, iso]) => {
    const ref = new Date(iso);
    const found = phasesBetween(new Date(ref - 3 * 86400000), new Date(+ref + 3 * 86400000)).find(
      (p) => p.id === id
    );
    expect(found).toBeTruthy();
    expect(Math.abs(found.date - ref) / 60000).toBeLessThan(2.5);
  });
});

test('estado de la Luna', () => {
  const full = moonState(new Date('2024-01-25T17:54Z'));
  expect(full.name).toBe('Luna llena');
  expect(full.illumination).toBeGreaterThan(0.99);
  const nw = moonState(new Date('2024-01-11T13:00Z'));
  expect(nw.illumination).toBeLessThan(0.01);
});
