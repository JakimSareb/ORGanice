// ORG Mode para Eli (2.12): almacén en el dispositivo para usar la app sin conexión.
//
// Usa IndexedDB (mucho más espacio que los ~5 MB de localStorage). Al arrancar se carga todo
// el almacén de textos en memoria (initOfflineStore), así el resto de la app puede leerlo de
// forma síncrona; cada escritura va a memoria y, en segundo plano, a IndexedDB.
//
// Claves del almacén de textos (kv):
//   plain:<ruta>  copia local de un fichero sin cifrar (con los cambios aún sin subir)
//   file:<ruta>   última versión del servidor tal como llegó (los .gpg/.asc, cifrados), o una
//                 versión cifrada con cambios pendientes de subir ({ pending: true })
//   list:<qué>    últimas listas de ficheros (para el modo «todos los ficheros» sin conexión)
//   meta:<qué>    estado (p. ej. cuándo se preparó la app para usarla sin conexión)
// Almacén aparte (blobs): blob:<ruta> → { blob, size, savedAt } para los adjuntos.
//
// Si IndexedDB no está disponible, todo sigue como antes (localStorage, solo copia local).

const DB_NAME = 'organice-eli';
const KV = 'kv';
const BLOBS = 'blobs';

let db = null;
let ready = false;
// 'idle' | 'pending' | 'ready' | 'failed'. Mientras se abre (pending), no se escribe nada de la
// copia local: si la app arrancó sin esperarlo, no debe pisar lo que hay guardado.
let initState = 'idle';
export const isStoreSettling = () => initState === 'pending';
const mem = new Map();

const lsGet = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {}
};
const lsRemove = (k) => {
  try {
    window.localStorage.removeItem(k);
  } catch (e) {}
};
const lsKeys = () => {
  try {
    return Object.keys(window.localStorage);
  } catch (e) {
    return [];
  }
};

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
      if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
  });

const run = (store, mode, fn) =>
  new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Sin almacén'));
      return;
    }
    let result;
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });

const warn = (e) => {
  // eslint-disable-next-line no-console
  console.warn('ORGanice: no se pudo guardar en el dispositivo', e);
};

// Copia local de localStorage (versiones anteriores) → IndexedDB
const migrateFromLocalStorage = () => {
  lsKeys()
    .filter((k) => k.startsWith('files__'))
    .forEach((k) => {
      const path = k.substring('files__'.length);
      const contents = lsGet(k);
      if (contents === null) return;
      mem.set(`plain:${path}`, contents);
      run(KV, 'readwrite', (s) => s.put(contents, `plain:${path}`))
        .then(() => lsRemove(k))
        .catch(warn);
    });
};

/** Abre el almacén y lo carga en memoria. Nunca falla (sin IndexedDB, se sigue sin él). */
export const initOfflineStore = async () => {
  if (ready) return true;
  initState = 'pending';
  try {
    db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(KV, 'readonly');
      const req = t.objectStore(KV).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          mem.set(c.key, c.value);
          c.continue();
        }
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    ready = true;
    initState = 'ready';
    migrateFromLocalStorage();
    // Pedir al navegador que no borre estos datos por falta de espacio
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch (e) {
    db = null;
    ready = false;
    initState = 'failed';
  }
  return ready;
};

export const isOfflineStoreReady = () => ready;

export const kvGet = (key) => mem.get(key);
export const kvKeys = (prefix = '') => Array.from(mem.keys()).filter((k) => k.startsWith(prefix));
// Otras copias de la app abiertas (pantalla dividida, otra pestaña): se avisan de los cambios
// para que su copia en memoria no se quede atrás
let channel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('organice-eli-kv');
    // En Node (pruebas) no debe mantener vivo el proceso
    if (typeof channel.unref === 'function') channel.unref();
    channel.onmessage = (e) => {
      const m = e.data || {};
      if (!m.key) return;
      if (m.deleted) mem.delete(m.key);
      else mem.set(m.key, m.value);
    };
  }
} catch (e) {
  channel = null;
}
const announce = (msg) => {
  try {
    if (channel) channel.postMessage(msg);
  } catch (e) {}
};

export const kvSet = (key, value) => {
  mem.set(key, value);
  if (db) run(KV, 'readwrite', (s) => s.put(value, key)).catch(warn);
  announce({ key, value });
};
export const kvDelete = (key) => {
  mem.delete(key);
  if (db) run(KV, 'readwrite', (s) => s.delete(key)).catch(warn);
  announce({ key, deleted: true });
};

// --- Copia local de ficheros sin cifrar (antes, localStorage «files__<ruta>») ----------------

export const getPlainCopy = (path) => (ready ? mem.get(`plain:${path}`) : lsGet(`files__${path}`));
export const setPlainCopy = (path, contents) => {
  if (initState === 'pending') return;
  if (ready) kvSet(`plain:${path}`, contents);
  else lsSet(`files__${path}`, contents);
};
export const removePlainCopy = (path) => {
  if (initState === 'pending') return;
  if (ready) kvDelete(`plain:${path}`);
  lsRemove(`files__${path}`);
};
export const plainCopyPaths = () =>
  ready
    ? kvKeys('plain:').map((k) => k.substring('plain:'.length))
    : lsKeys()
        .filter((k) => k.startsWith('files__'))
        .map((k) => k.substring('files__'.length));

// --- Versiones del servidor (y versiones cifradas pendientes de subir) -----------------------

export const getServerCopy = (path) => mem.get(`file:${path}`);
export const setServerCopy = (path, entry) => ready && kvSet(`file:${path}`, entry);
export const removeServerCopy = (path) => ready && kvDelete(`file:${path}`);
export const serverCopyPaths = () => kvKeys('file:').map((k) => k.substring('file:'.length));

export const pendingLocalVersion = (path) => {
  const e = mem.get(`file:${path}`);
  return e && e.pending ? e : null;
};
export const clearPendingLocalVersion = (path) => {
  const e = mem.get(`file:${path}`);
  if (e && e.pending) kvDelete(`file:${path}`);
};

// --- Adjuntos ----------------------------------------------------------------------------

export const getOfflineBlob = (path) =>
  db
    ? run(BLOBS, 'readonly', (s) => s.get(`blob:${path}`)).then((e) => (e ? e.blob : null))
    : Promise.resolve(null);
export const putOfflineBlob = (path, blob) =>
  db
    ? run(BLOBS, 'readwrite', (s) =>
        s.put({ blob, size: blob.size, savedAt: new Date().toISOString() }, `blob:${path}`)
      )
    : Promise.reject(new Error('Este navegador no permite guardar adjuntos'));
export const deleteOfflineBlob = (path) =>
  db ? run(BLOBS, 'readwrite', (s) => s.delete(`blob:${path}`)).catch(warn) : Promise.resolve();
export const offlineBlobPaths = () =>
  db
    ? run(BLOBS, 'readonly', (s) => s.getAllKeys()).then((keys) =>
        (keys || []).map((k) => String(k).substring('blob:'.length))
      )
    : Promise.resolve([]);
export const clearOfflineBlobs = () =>
  db ? run(BLOBS, 'readwrite', (s) => s.clear()).catch(warn) : Promise.resolve();

// Borra todo lo guardado (al cerrar sesión)
export const clearOfflineStore = () => {
  Array.from(mem.keys()).forEach((key) => announce({ key, deleted: true }));
  mem.clear();
  if (db) {
    run(KV, 'readwrite', (s) => s.clear()).catch(warn);
    clearOfflineBlobs();
  }
};

// Solo para las pruebas
export const _resetForTests = () => {
  mem.clear();
  db = null;
  ready = false;
  initState = 'idle';
};
