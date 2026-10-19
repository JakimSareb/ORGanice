import { dampPull, pullReady, PULL_MAX, PULL_THRESHOLD } from './eli_pull_refresh';

describe('eli_pull_refresh (3.26)', () => {
  test('amortigua y limita el tirón', () => {
    expect(dampPull(-20)).toBe(0);
    expect(dampPull(100)).toBeGreaterThan(35);
    expect(dampPull(100)).toBeLessThan(50);
    // 3.27: goma: cada vez cuesta más y nunca pasa del límite
    expect(dampPull(200) - dampPull(100)).toBeLessThan(dampPull(100));
    expect(dampPull(1000)).toBeLessThan(PULL_MAX);
    expect(dampPull(1000)).toBeGreaterThan(80);
  });
  test('umbral', () => {
    expect(pullReady(PULL_THRESHOLD - 1)).toBe(false);
    expect(pullReady(dampPull(PULL_THRESHOLD * 3))).toBe(true);
    expect(pullReady(dampPull(220))).toBe(true);
  });
});
