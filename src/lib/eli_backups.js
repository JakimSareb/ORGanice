// ORG Mode para Eli (4.58): copias de seguridad ROTATIVAS (abuelo-padre-hijo).
// Una copia = un .zip con todos los ficheros .org del usuario, guardado en `/backups/` con el
// nombre `AAAA-MM-DD_HHMM_<firma>.zip` (hora local; la firma resume qué ficheros había, así se sabe
// si algo cambió desde la última copia sin descargar nada). Aquí solo hay lógica pura: nombres,
// retención y zip. Quien habla con Dropbox / la carpeta del ordenador es `actions/eli_backups.js`.

export const BACKUPS_DIR = '/backups';
export const MIN_INTERVAL_MS = 60 * 60 * 1000; // como máximo 1 copia por hora

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Retención: cuánto tiempo se guarda la copia más antigua de cada hora / día / semana / mes / año
export const RETENTION = {
  hourly: 24 * HOUR,
  daily: 7 * DAY,
  weekly: 28 * DAY,
  monthly: 366 * DAY,
  yearly: Infinity,
};

// ---------------------------------------------------------------------------------------------
// Ajuste (activar / desactivar). Encendido por defecto; 'off' = apagado. Viaja entre dispositivos.
// ---------------------------------------------------------------------------------------------
const KEY = 'eliBackups';
const listeners = new Set();
const read = () => {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch (e) {
    return true;
  }
};
let on = read();
try {
  window.addEventListener('eli:prefs-applied', () => {
    on = read();
    listeners.forEach((l) => l(on));
  });
} catch (e) {}

export const getBackupsOn = () => on;
export const setBackupsOn = (v) => {
  on = !!v;
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch (e) {}
  listeners.forEach((l) => l(on));
};
export const subscribeBackupsOn = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Última comprobación de ESTE dispositivo (para no listar `/backups` cada pocos minutos)
export const LAST_RUN_KEY = 'eliBackupLastRun';
export const getLastRun = () => {
  try {
    return Number(window.localStorage.getItem(LAST_RUN_KEY)) || 0;
  } catch (e) {
    return 0;
  }
};
export const setLastRun = (ms) => {
  try {
    window.localStorage.setItem(LAST_RUN_KEY, String(ms));
  } catch (e) {}
};

// ---------------------------------------------------------------------------------------------
// Qué se copia
// ---------------------------------------------------------------------------------------------
// .org, .org.gpg, .org.asc y .org_archive; nunca lo que ya está en `backups/`
export const isBackupSource = (path) =>
  /\.org(\.gpg|\.asc)?$|\.org_archive$/i.test(path || '') && !/(^|\/)backups\//i.test(path || '');

// ---------------------------------------------------------------------------------------------
// Hash sencillo (cyrb53): no es criptográfico, solo sirve para detectar cambios
// ---------------------------------------------------------------------------------------------
export const hashString = (str) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0').slice(-10);
};

// Firma del conjunto de ficheros a partir del listado (ruta + tamaño + marca de cambio del
// servidor). Devuelve null si algún fichero no trae marca: hay que descargar para firmar.
export const signatureFromEntries = (entries) => {
  if (!entries.length || entries.some((e) => !e.stamp)) return null;
  const lines = entries
    .map((e) => `${e.path}|${e.size}|${e.stamp}`)
    .sort()
    .join('\n');
  return hashString(lines);
};

// Firma a partir del contenido (cuando el listado no trae marcas)
export const signatureFromFiles = (files) => {
  const lines = files
    .map((f) => {
      let h = 0;
      for (let i = 0; i < f.data.length; i++) h = (Math.imul(h, 31) + f.data[i]) | 0;
      return `${f.name}|${f.data.length}|${h}`;
    })
    .sort()
    .join('\n');
  return hashString(lines);
};

// ---------------------------------------------------------------------------------------------
// Nombres: AAAA-MM-DD_HHMM_<firma>.zip (hora local)
// ---------------------------------------------------------------------------------------------
const pad = (n, l = 2) => String(n).padStart(l, '0');
const NAME_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})_([0-9a-f]{6,16})\.zip$/;

export const formatBackupName = (date, sig) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}_${sig}.zip`;

// -> { name, date, sig } o null si no es una copia nuestra
export const parseBackupName = (name) => {
  const m = NAME_RE.exec(name || '');
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  if (isNaN(date.getTime())) return null;
  return { name, date, sig: m[6] };
};

// ---------------------------------------------------------------------------------------------
// Retención. Se conserva la copia MÁS ANTIGUA de cada tramo (hora, día, semana ISO, mes, año)
// mientras no haya caducado el tramo; la más reciente de todas nunca se borra.
// ---------------------------------------------------------------------------------------------
const isoWeekKey = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
};

const BUCKETS = {
  hourly: (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`,
  daily: (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
  weekly: isoWeekKey,
  monthly: (d) => `${d.getFullYear()}-${d.getMonth()}`,
  yearly: (d) => `${d.getFullYear()}`,
};

// items: [{ name, date, … }] -> { keep: [...], remove: [...] } (cada lista en orden cronológico)
export const planRetention = (items, now = new Date()) => {
  const sorted = [...items].sort((a, b) => a.date - b.date);
  if (!sorted.length) return { keep: [], remove: [] };
  const first = {};
  Object.keys(BUCKETS).forEach((tier) => {
    first[tier] = new Map();
    sorted.forEach((it) => {
      const k = BUCKETS[tier](it.date);
      if (!first[tier].has(k)) first[tier].set(k, it);
    });
  });
  const newest = sorted[sorted.length - 1];
  const keep = [];
  const remove = [];
  sorted.forEach((it) => {
    const age = now - it.date;
    const keepIt =
      it === newest ||
      Object.keys(BUCKETS).some(
        (tier) => first[tier].get(BUCKETS[tier](it.date)) === it && age < RETENTION[tier]
      );
    (keepIt ? keep : remove).push(it);
  });
  return { keep, remove };
};

// ---------------------------------------------------------------------------------------------
// Zip (sin dependencias): método 0 (sin comprimir) y 8 (deflate), nombres UTF-8
// ---------------------------------------------------------------------------------------------
let crcTable = null;
export const crc32 = (data) => {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const streamThrough = async (data, stream) => {
  const out = new Response(new Blob([data]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
};

// Compresión del navegador (CompressionStream); null si no existe
export const browserDeflateRaw =
  typeof CompressionStream === 'function' &&
  typeof Blob === 'function' &&
  typeof Blob.prototype.stream === 'function' &&
  typeof Response === 'function'
    ? (data) => streamThrough(data, new CompressionStream('deflate-raw'))
    : null;
export const browserInflateRaw =
  typeof DecompressionStream === 'function' &&
  typeof Blob === 'function' &&
  typeof Blob.prototype.stream === 'function' &&
  typeof Response === 'function'
    ? (data) => streamThrough(data, new DecompressionStream('deflate-raw'))
    : null;

const dosDateTime = (d) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

// files: [{ name, data: Uint8Array }] -> Uint8Array con el zip
export const makeZip = async (
  files,
  { date = new Date(), deflateRaw = browserDeflateRaw } = {}
) => {
  const enc = new TextEncoder();
  const { time, date: dosDate } = dosDateTime(date);
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (u8) => {
    chunks.push(u8);
    offset += u8.length;
  };
  for (const f of files) {
    const name = enc.encode(f.name.replace(/^\/+/, ''));
    const crc = crc32(f.data);
    let method = 0;
    let body = f.data;
    if (deflateRaw && f.data.length > 64) {
      try {
        const packed = await deflateRaw(f.data);
        if (packed.length < f.data.length) {
          method = 8;
          body = packed;
        }
      } catch (e) {}
    }
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    const localOffset = offset;
    push(new Uint8Array(local.buffer));
    push(name);
    push(body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, method, true);
    c.setUint16(12, time, true);
    c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, localOffset, true);
    central.push(new Uint8Array(c.buffer), name);
  }
  const centralStart = offset;
  central.forEach(push);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, offset - centralStart, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset);
  let p = 0;
  chunks.forEach((u8) => {
    out.set(u8, p);
    p += u8.length;
  });
  return out;
};

// bytes -> [{ name, data: Uint8Array }]. Lanza Error si el zip está dañado.
export const readZip = async (bytes, { inflateRaw = browserInflateRaw } = {}) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('La copia no es un zip válido');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('La copia está dañada');
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('La copia está dañada');
    const start =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const body = bytes.subarray(start, start + compSize);
    let data;
    if (method === 0) data = new Uint8Array(body);
    else if (method === 8 && inflateRaw) data = await inflateRaw(body);
    else throw new Error('Este navegador no puede descomprimir la copia');
    if (crc32(data) !== crc) throw new Error(`La copia está dañada (${name})`);
    if (!name.endsWith('/')) out.push({ name, data });
  }
  return out;
};
