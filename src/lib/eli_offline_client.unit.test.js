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

describe('carpetas sin conexión (3.31)', () => {
  const { listingFromPaths, mergeListings } = require('./eli_offline_client');
  const store = require('./eli_offline_store');
  const setOnline = (v) =>
    Object.defineProperty(window.navigator, 'onLine', { value: v, configurable: true });
  afterEach(() => setOnline(true));

  test('deduce carpetas y ficheros directos de rutas conocidas', () => {
    const paths = [
      '/Notas/a.org',
      '/Notas/Sub/b.org.gpg',
      '/Notas/Sub/foto.jpg',
      '/Notas/guion.fountain',
      '/Notas/foto.png',
      '/notas/backups/x.org',
      '/Otra/c.org',
    ];
    const root = listingFromPaths('/', paths).map((e) => e.name);
    expect(root).toEqual(['Notas', 'Otra']);
    const notas = listingFromPaths('/Notas', paths);
    expect(notas.map((e) => [e.name, e.isDirectory])).toEqual([
      ['Sub', true],
      ['a.org', false],
      ['guion.fountain', false],
    ]);
    expect(listingFromPaths('/Notas/Sub/', paths).map((e) => e.path)).toEqual([
      '/Notas/Sub/b.org.gpg',
    ]);
    expect(
      mergeListings([{ path: '/A/x.org', name: 'x.org' }], [{ path: '/a/X.org', name: 'X.org' }])
    ).toHaveLength(1);
  });

  test('guarda la lista de cada carpeta y la usa sin conexión', async () => {
    const { fromJS, Map } = require('immutable');
    const client = {
      getDirectoryListing: jest.fn(() =>
        Promise.resolve({
          listing: fromJS([{ id: '1', name: 'd.org', isDirectory: false, path: '/Docs/d.org' }]),
          hasMore: false,
          additionalSyncBackendState: Map(),
        })
      ),
    };
    const wrapped = withOfflineCache(client);
    await wrapped.getDirectoryListing('/Docs');
    setOnline(false);
    const offline = await wrapped.getDirectoryListing('/docs/');
    expect(offline.listing.toJS().map((e) => e.name)).toEqual(['d.org']);
    expect(client.getDirectoryListing).toHaveBeenCalledTimes(1);
    // De la lista completa de ficheros (la que usa la lupa)
    store.kvSet('list:listAllFileEntries', [{ path: '/Lejos/e.org', size: 1 }]);
    const lejos = await wrapped.getDirectoryListing('/Lejos');
    expect(lejos.listing.toJS().map((e) => e.name)).toEqual(['e.org']);
    await expect(wrapped.getDirectoryListing('/Nada')).rejects.toThrow(/Sin conexión/);
  });

  test('con conexión, si falla la red usa lo guardado', async () => {
    const { fromJS, Map } = require('immutable');
    let fail = false;
    const client = {
      getDirectoryListing: jest.fn(() =>
        fail
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve({
              listing: fromJS([{ id: '1', name: 'f.org', isDirectory: false, path: '/R/f.org' }]),
              hasMore: false,
              additionalSyncBackendState: Map(),
            })
      ),
    };
    const wrapped = withOfflineCache(client);
    await wrapped.getDirectoryListing('/R');
    fail = true;
    const r = await wrapped.getDirectoryListing('/R');
    expect(r.eliFromCache).toBe(true);
    expect(r.listing.toJS()[0].name).toBe('f.org');
  });
});
