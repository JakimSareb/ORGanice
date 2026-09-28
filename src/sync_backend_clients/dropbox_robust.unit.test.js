import {
  queuedDownload,
  withRetries,
  isNotFoundError,
  dropboxErrorMessage,
} from './dropbox_sync_backend_client';

describe('Dropbox (2.15): cola, reintentos y errores', () => {
  test('como mucho 3 descargas a la vez', async () => {
    let active = 0;
    let max = 0;
    const job = () =>
      queuedDownload(async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return 1;
      });
    const results = await Promise.all(Array.from({ length: 10 }, job));
    expect(results.length).toBe(10);
    expect(max).toBe(3);
  });

  test('reintenta tras un 429 y no tras un «no existe»', async () => {
    let n = 0;
    const r = await withRetries(async () => {
      n++;
      if (n < 2) {
        const e = new Error('x');
        e.status = 429;
        e.error = { error: { retry_after: 0.01 } };
        throw e;
      }
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(n).toBe(2);
    let m = 0;
    const nf = { status: 409, error: { error: { path: { '.tag': 'not_found' } } } };
    await expect(
      withRetries(async () => {
        m++;
        throw nf;
      })
    ).rejects.toBe(nf);
    expect(m).toBe(1);
    expect(isNotFoundError(nf)).toBe(true);
    expect(isNotFoundError({ status: 401 })).toBe(false);
  });

  test('mensajes claros', () => {
    expect(dropboxErrorMessage({ status: 401 })).toMatch(/sesión/);
    expect(dropboxErrorMessage({ status: 429 })).toMatch(/demasiadas/);
    expect(dropboxErrorMessage({ status: 503 })).toMatch(/503/);
  });
});
