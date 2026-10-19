import { dampPull, pullReady, PULL_MAX, PULL_THRESHOLD } from './eli_pull_refresh';

describe('eli_pull_refresh (3.26)', () => {
  test('amortigua y limita el tirón', () => {
    expect(dampPull(-20)).toBe(0);
    expect(dampPull(100)).toBe(50);
    expect(dampPull(1000)).toBe(PULL_MAX);
  });
  test('umbral', () => {
    expect(pullReady(PULL_THRESHOLD - 1)).toBe(false);
    expect(pullReady(dampPull(PULL_THRESHOLD * 2))).toBe(true);
  });
});
