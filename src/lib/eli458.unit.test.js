import zlib from 'zlib';
import { TextEncoder, TextDecoder } from 'util';

// jsdom no trae estas APIs del navegador
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
import {
  formatBackupName,
  parseBackupName,
  planRetention,
  makeZip,
  readZip,
  crc32,
  isBackupSource,
  signatureFromEntries,
  signatureFromFiles,
  hashString,
} from './eli_backups';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const items = (dates) => dates.map((d) => ({ name: formatBackupName(d, 'abcdef'), date: d }));

test('el nombre de una copia se escribe y se lee de vuelta', () => {
  const d = new Date(2026, 9, 31, 17, 5);
  const name = formatBackupName(d, '0123456789');
  expect(name).toBe('2026-10-31_1705_0123456789.zip');
  const p = parseBackupName(name);
  expect(p.date.getTime()).toBe(d.getTime());
  expect(p.sig).toBe('0123456789');
  expect(parseBackupName('gtd.org.organice-bak')).toBe(null);
  expect(parseBackupName('2026-13-45_9999_zz.zip')).toBe(null);
});

test('qué ficheros se copian', () => {
  expect(isBackupSource('/gtd.org')).toBe(true);
  expect(isBackupSource('/Notas/diario.org.gpg')).toBe(true);
  expect(isBackupSource('/Notas/diario.org_archive')).toBe(true);
  expect(isBackupSource('/backups/gtd.org.organice-bak')).toBe(false);
  expect(isBackupSource('/Notas/backups/gtd.org')).toBe(false);
  expect(isBackupSource('/foto.png')).toBe(false);
});

test('la firma cambia si cambia algo y exige marcas en todos los ficheros', () => {
  const a = [{ path: '/a.org', size: 3, stamp: 'x' }];
  expect(signatureFromEntries(a)).toBe(signatureFromEntries([{ ...a[0] }]));
  expect(signatureFromEntries(a)).not.toBe(signatureFromEntries([{ ...a[0], stamp: 'y' }]));
  expect(signatureFromEntries([{ path: '/a.org', size: 3 }])).toBe(null);
  const f = (t) => [{ name: 'a.org', data: new TextEncoder().encode(t) }];
  expect(signatureFromFiles(f('hola'))).toBe(signatureFromFiles(f('hola')));
  expect(signatureFromFiles(f('hola'))).not.toBe(signatureFromFiles(f('holA')));
  expect(hashString('x')).toHaveLength(10);
});

describe('retención', () => {
  test('con una copia por hora durante dos años queda un número pequeño y acotado', () => {
    const start = new Date(2024, 9, 31, 0, 30);
    let list = [];
    let max = 0;
    for (let t = start.getTime(); t <= new Date(2026, 9, 31, 12, 30).getTime(); t += HOUR) {
      const now = new Date(t);
      list.push({ name: formatBackupName(now, 'abcdef'), date: now });
      list = planRetention(list, now).keep;
      max = Math.max(max, list.length);
    }
    // 24 horas + 7 días + 5 semanas + 13 meses + 3 años, con algo de margen de solape
    expect(max).toBeLessThanOrEqual(60);
    const now = new Date(2026, 9, 31, 12, 30);
    const age = (it) => (now - it.date) / DAY;
    // hay de todos los tramos
    expect(list.some((it) => age(it) < 1)).toBe(true);
    expect(list.some((it) => age(it) > 300 && age(it) < 366)).toBe(true);
    // los anuales no caducan: 2024 sigue ahí
    expect(list.some((it) => it.date.getFullYear() === 2024)).toBe(true);
    // la más reciente siempre se conserva
    expect(list[list.length - 1].date.getTime()).toBe(now.getTime());
  });

  test('conserva la más antigua de cada día y borra las demás de esa semana pasada', () => {
    const now = new Date(2026, 9, 31, 12, 0);
    // 3 copias el 27-oct (hace 4 días): solo se queda la primera del día
    const list = items([
      new Date(2026, 9, 27, 8, 0),
      new Date(2026, 9, 27, 14, 0),
      new Date(2026, 9, 27, 20, 0),
      new Date(2026, 9, 31, 11, 0),
    ]);
    const { keep, remove } = planRetention(list, now);
    expect(keep.map((i) => i.date.getHours())).toEqual([8, 11]);
    expect(remove.map((i) => i.date.getHours())).toEqual([14, 20]);
  });

  test('las horarias de hace más de un día caducan pero la diaria sigue', () => {
    const now = new Date(2026, 9, 31, 12, 0);
    const list = items([
      new Date(2026, 9, 30, 9, 0),
      new Date(2026, 9, 30, 10, 0),
      new Date(2026, 9, 31, 11, 0),
    ]);
    const { keep } = planRetention(list, now);
    expect(keep.map((i) => i.date.getHours())).toEqual([9, 11]);
  });

  test('nunca borra la más reciente y no falla con la lista vacía', () => {
    const now = new Date(2030, 0, 1);
    const old = items([new Date(2026, 5, 3, 10, 0), new Date(2026, 5, 3, 11, 0)]);
    const { keep } = planRetention(old, now);
    expect(keep.map((i) => i.date.getHours())).toContain(11);
    expect(planRetention([], now)).toEqual({ keep: [], remove: [] });
  });
});

describe('zip', () => {
  const files = () => [
    { name: 'gtd.org', data: new TextEncoder().encode('* TODO uno\n'.repeat(50)) },
    { name: 'Notas/ñandú.org', data: new TextEncoder().encode('* áéíóú\n') },
    { name: 'vacio.org', data: new Uint8Array(0) },
  ];
  const same = (a, b) =>
    expect(a.map((f) => [f.name, Buffer.from(f.data).toString('hex')])).toEqual(
      b.map((f) => [f.name, Buffer.from(f.data).toString('hex')])
    );

  test('sin comprimir: ida y vuelta, nombres con acentos incluidos', async () => {
    const zip = await makeZip(files(), { deflateRaw: null });
    same(await readZip(zip), files());
  });

  test('comprimido (deflate): ida y vuelta y pesa menos', async () => {
    const deflateRaw = async (d) => new Uint8Array(zlib.deflateRawSync(Buffer.from(d)));
    const inflateRaw = async (d) => new Uint8Array(zlib.inflateRawSync(Buffer.from(d)));
    const stored = await makeZip(files(), { deflateRaw: null });
    const zip = await makeZip(files(), { deflateRaw });
    expect(zip.length).toBeLessThan(stored.length);
    same(await readZip(zip, { inflateRaw }), files());
  });

  test('un zip dañado se rechaza', async () => {
    const zip = await makeZip(files(), { deflateRaw: null });
    const bad = new Uint8Array(zip);
    bad[40] ^= 0xff; // dentro de los datos del primer fichero
    await expect(readZip(bad)).rejects.toThrow();
    await expect(readZip(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  test('crc32 conocido', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
