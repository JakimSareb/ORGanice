import { TextEncoder, TextDecoder } from 'util';

// jsdom no trae estas APIs del navegador
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
import { runBackup, restoreBackup, listBackups } from './eli_backups';
import { formatBackupName, parseBackupName, readZip } from '../lib/eli_backups';

const blobBytes = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = reject;
    r.readAsArrayBuffer(blob);
  });

// Cliente en memoria con lo mínimo que usa la app
const makeClient = (initial = {}, opts = {}) => {
  const files = { ...initial }; // ruta -> texto
  const zips = {}; // ruta -> Uint8Array
  const client = {
    files,
    zips,
    uploads: 0,
    deleted: [],
    listAllFileEntries: async () =>
      Object.keys(files).map((path) => ({
        path,
        size: files[path].length,
        stamp: opts.noStamp ? '' : String(files[path].length) + files[path].slice(0, 3),
      })),
    getFileBlob: async (path) => ({
      arrayBuffer: async () => {
        const u8 = zips[path] || new TextEncoder().encode(files[path]);
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      },
    }),
    listBackupZips: async () =>
      Object.keys(zips).map((path) => ({
        path,
        name: path.split('/').pop(),
        // `shortWrite` simula una subida incompleta
        size: opts.shortWrite ? 1 : zips[path].length,
      })),
    uploadBinaryFile: async (path, blob) => {
      client.uploads++;
      zips[path] = await blobBytes(blob);
      return path;
    },
    deleteFile: async (path) => {
      client.deleted.push(path);
      delete zips[path];
    },
    updateFile: async (path, contents) => {
      files[path] = contents;
    },
  };
  return client;
};

const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m);
const NO_ZIP = { deflateRaw: null };

test('crea la primera copia, verificada, con todos los .org', async () => {
  const c = makeClient({ '/gtd.org': '* TODO a\n', '/Notas/x.org': '* x\n', '/foto.png': 'png' });
  const r = await runBackup(c, { now: at(31, 10, 5), ...NO_ZIP });
  expect(r.status).toBe('created');
  expect(r.files).toBe(2);
  expect(Object.keys(c.zips)).toHaveLength(1);
  const list = await listBackups(c);
  expect(list).toHaveLength(1);
  expect(list[0].date.getTime()).toBe(at(31, 10, 5).getTime());
});

test('no repite la copia en menos de una hora ni si no ha cambiado nada', async () => {
  const c = makeClient({ '/gtd.org': '* TODO a\n' });
  await runBackup(c, { now: at(31, 10, 0), ...NO_ZIP });
  expect((await runBackup(c, { now: at(31, 10, 30) })).status).toBe('recent');
  expect((await runBackup(c, { now: at(31, 11, 30) })).status).toBe('unchanged');
  expect(c.uploads).toBe(1);
  c.files['/gtd.org'] = '* TODO a cambiado\n';
  const r = await runBackup(c, { now: at(31, 12, 30), ...NO_ZIP });
  expect(r.status).toBe('created');
  expect(c.uploads).toBe(2);
});

test('sin marcas en el listado firma por contenido y también detecta lo que no cambió', async () => {
  const c = makeClient({ '/gtd.org': '* TODO a\n' }, { noStamp: true });
  expect((await runBackup(c, { now: at(31, 10, 0), ...NO_ZIP })).status).toBe('created');
  expect((await runBackup(c, { now: at(31, 12, 0), ...NO_ZIP })).status).toBe('unchanged');
  c.files['/gtd.org'] = '* DONE a\n';
  expect((await runBackup(c, { now: at(31, 14, 0), ...NO_ZIP })).status).toBe('created');
});

test('poda las copias que ya no tocan, pero solo tras verificar la nueva', async () => {
  const c = makeClient({ '/gtd.org': '* a\n' });
  // 3 copias antiguas del mismo día de hace 4 días: solo debe quedar la primera
  [8, 14, 20].forEach((h) => {
    const name = formatBackupName(at(27, h), `00000000${h}`.slice(-8));
    c.zips[`/backups/${name}`] = new Uint8Array([1]);
  });
  const r = await runBackup(c, { now: at(31, 12, 0), ...NO_ZIP });
  expect(r.status).toBe('created');
  const names = (await listBackups(c)).map((b) => b.date.getDate() + ':' + b.date.getHours());
  expect(names).toEqual(['27:8', '31:12']);
});

test('si la subida no se puede comprobar, NO se poda nada', async () => {
  const c = makeClient({ '/gtd.org': '* a\n' }, { shortWrite: true });
  [8, 14].forEach((h) => {
    c.zips[`/backups/${formatBackupName(at(27, h), 'abcdef')}`] = new Uint8Array([1]);
  });
  const r = await runBackup(c, { now: at(31, 12, 0), ...NO_ZIP });
  expect(r.status).toBe('unverified');
  expect(c.deleted).toEqual([]);
  expect(Object.keys(c.zips)).toHaveLength(3);
});

test('un fallo al subir lanza el error y no borra nada', async () => {
  const c = makeClient({ '/gtd.org': '* a\n' });
  c.zips[`/backups/${formatBackupName(at(27, 8), 'abcdef')}`] = new Uint8Array([1]);
  c.uploadBinaryFile = async () => {
    throw new Error('sin conexión');
  };
  await expect(runBackup(c, { now: at(31, 12, 0), ...NO_ZIP })).rejects.toThrow('sin conexión');
  expect(c.deleted).toEqual([]);
});

test('cliente sin soporte (p. ej. WebDAV): no hace nada', async () => {
  expect((await runBackup({ type: 'WebDAV' })).status).toBe('unsupported');
});

test('restaurar: guarda antes el estado actual, reescribe lo de la copia y no borra nada', async () => {
  const c = makeClient({ '/gtd.org': '* TODO original\n', '/Notas/x.org': '* x\n' });
  await runBackup(c, { now: at(30, 9, 0), ...NO_ZIP });
  const [backup] = await listBackups(c);
  // el usuario estropea el fichero y crea otro nuevo
  c.files['/gtd.org'] = '* roto\n';
  c.files['/nuevo.org'] = '* nuevo\n';
  const r = await restoreBackup(c, backup, { now: at(31, 12, 0) });
  expect(r).toMatchObject({ status: 'restored' });
  expect(r.restored).toBe(2);
  expect(c.files['/gtd.org']).toBe('* TODO original\n');
  expect(c.files['/nuevo.org']).toBe('* nuevo\n'); // no se borra
  // y antes se guardó una copia del estado «roto»
  const after = await listBackups(c);
  expect(after).toHaveLength(2);
  expect(parseBackupName(after[1].name).date.getTime()).toBe(at(31, 12, 0).getTime());
  // …y esa copia previa contiene el fichero tal como estaba justo antes de restaurar
  const prev = await readZip(c.zips[after[1].path]);
  expect(new TextDecoder().decode(prev.find((f) => f.name === 'gtd.org').data)).toBe('* roto\n');
});

test('restaurar una copia dañada falla sin tocar nada', async () => {
  const c = makeClient({ '/gtd.org': '* a\n' });
  const name = formatBackupName(at(30, 9), 'abcdef');
  c.zips[`/backups/${name}`] = new Uint8Array([1, 2, 3]);
  const [backup] = await listBackups(c);
  const r = await restoreBackup(c, backup, { now: at(31, 12, 0) });
  expect(r.status).toBe('error');
  expect(c.files['/gtd.org']).toBe('* a\n');
  expect(c.uploads).toBe(0);
});
