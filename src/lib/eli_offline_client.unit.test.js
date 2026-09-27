import { withOfflineCache, isNetworkError } from './eli_offline_client';

describe('uso sin conexión (2.12)', () => {
  const setOnline = (v) =>
    Object.defineProperty(window.navigator, 'onLine', { value: v, configurable: true });
  afterEach(() => setOnline(true));

  test('distingue un fallo de red de un «no existe»', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ eliTimeout: true })).toBe(true);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError({ status: 409 })).toBe(false);
  });

  test('con conexión pasa al cliente; sin conexión y sin copia, avisa', async () => {
    const client = {
      getFileContentsAndMetadata: jest.fn(() =>
        Promise.resolve({ contents: '* A', lastModifiedAt: '2026-01-01T00:00:00Z' })
      ),
      updateFile: jest.fn(() => Promise.resolve({})),
    };
    const wrapped = withOfflineCache(client);
    expect(await wrapped.getFileContents('/a.org')).toBe('* A');
    setOnline(false);
    await expect(wrapped.getFileContents('/b.org')).rejects.toThrow(/Sin conexión/);
    expect(client.getFileContentsAndMetadata).toHaveBeenCalledTimes(1);
    expect(withOfflineCache(wrapped)).toBe(wrapped);
  });
});
