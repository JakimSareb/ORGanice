// ORG Mode para Eli: "sincronización" con una carpeta local del ordenador (File System Access
// API; Edge y Chrome en Windows/Mac/Linux). Los ficheros nunca salen del ordenador.
//
// La carpeta elegida se guarda (como identificador, no su contenido) en IndexedDB para no tener
// que elegirla cada vez. El navegador puede pedir de nuevo permiso al volver a abrir la app:
// eso lo gestiona EliLocalFolderGate con un botón.
import { fromJS } from 'immutable';

const DB = 'eliLocalFolder';
const STORE = 'handles';
const KEY = 'root';

const idb = () =>
  new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbRun = async (mode, fn) => {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
};

export const saveRootHandle = (handle) => idbRun('readwrite', (s) => s.put(handle, KEY));
export const loadRootHandle = () => idbRun('readonly', (s) => s.get(KEY));
export const forgetRootHandle = () => idbRun('readwrite', (s) => s.delete(KEY));

export const isLocalFolderSupported = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

// Elegir la carpeta (tiene que llamarse desde un clic del usuario)
export const pickLocalFolder = async () => {
  const handle = await window.showDirectoryPicker({ id: 'organice', mode: 'readwrite' });
  await saveRootHandle(handle);
  return handle;
};

export const permissionState = async (handle) => {
  if (!handle) return 'missing';
  if (!handle.queryPermission) return 'granted';
  return handle.queryPermission({ mode: 'readwrite' });
};

export const requestFolderPermission = async () => {
  const handle = await loadRootHandle();
  if (!handle) return 'missing';
  if (!handle.requestPermission) return 'granted';
  return handle.requestPermission({ mode: 'readwrite' });
};

const ORG_FILE = /\.(org|org_archive)(\.gpg|\.asc)?$/i;

const splitPath = (path) =>
  String(path || '')
    .split('/')
    .filter((p) => p && p !== '.');

const notFound = (path) => {
  const e = new Error(`No existe: ${path}`);
  e.status = 409;
  e.error = { error_summary: 'path/not_found/' };
  e.notFound = true;
  return e;
};

export default () => {
  // Si el navegador aún no ha dado permiso (p. ej. al volver a abrir la app), las operaciones
  // esperan a que el usuario lo conceda en la ventana de EliLocalFolderGate.
  const waitForPermission = () =>
    new Promise((resolve) =>
      window.addEventListener('eli:local-permission', () => resolve(), { once: true })
    );
  const root = async () => {
    for (;;) {
      const handle = await loadRootHandle();
      if (handle && (await permissionState(handle)) === 'granted') return handle;
      window.dispatchEvent(new CustomEvent('eli:local-permission-needed'));
      await waitForPermission();
    }
  };

  const dirHandle = async (parts, create = false) => {
    let dir = await root();
    for (const part of parts) {
      try {
        dir = await dir.getDirectoryHandle(part, { create });
      } catch (e) {
        if (e && e.name === 'NotFoundError') throw notFound('/' + parts.join('/'));
        throw e;
      }
    }
    return dir;
  };

  const fileHandle = async (path, create = false) => {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) throw notFound(path);
    const dir = await dirHandle(parts, create);
    try {
      return await dir.getFileHandle(name, { create });
    } catch (e) {
      if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) throw notFound(path);
      throw e;
    }
  };

  const isSignedIn = async () => {
    try {
      return !!(await loadRootHandle());
    } catch (e) {
      return false;
    }
  };

  const getDirectoryListing = async (path) => {
    const dir = await dirHandle(splitPath(path));
    const entries = [];
    for await (const [name, handle] of dir.entries()) {
      if (name.startsWith('.')) continue;
      const isDirectory = handle.kind === 'directory';
      if (!isDirectory && !ORG_FILE.test(name)) continue;
      const full = `${splitPath(path).length ? '/' + splitPath(path).join('/') : ''}/${name}`;
      entries.push({ id: full, name, isDirectory, path: full });
    }
    entries.sort((a, b) =>
      a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name)
    );
    return { listing: fromJS(entries), hasMore: false };
  };

  const getMoreDirectoryListing = async () => ({ listing: fromJS([]), hasMore: false });

  const getFileContentsAndMetadata = async (path) => {
    const file = await (await fileHandle(path)).getFile();
    const contents = /\.gpg$/i.test(path)
      ? new Uint8Array(await file.arrayBuffer())
      : await file.text();
    return { contents, lastModifiedAt: new Date(file.lastModified).toISOString() };
  };

  const getFileContents = async (path) => (await getFileContentsAndMetadata(path)).contents;

  const writeFile = async (path, contents) => {
    const handle = await fileHandle(path, true);
    const writable = await handle.createWritable();
    await writable.write(contents instanceof Uint8Array ? new Blob([contents]) : contents);
    await writable.close();
  };

  const updateFile = (path, contents) => writeFile(path, contents);
  const createFile = (path, contents) => writeFile(path, contents);

  const deleteFile = async (path) => {
    const parts = splitPath(path);
    const name = parts.pop();
    const dir = await dirHandle(parts);
    try {
      await dir.removeEntry(name);
    } catch (e) {
      if (e && e.name === 'NotFoundError') {
        // Como en Dropbox: rechaza indicando que no existía
        return Promise.reject(true);
      }
      throw e;
    }
  };

  const pathExists = async (path) => {
    try {
      await fileHandle(path);
      return true;
    } catch (e) {
      if (e && e.notFound) return false;
      throw e;
    }
  };

  // Multimedia: el propio fichero (no hay miniaturas ni enlaces temporales)
  const getFileBlob = async (path) => (await fileHandle(path)).getFile();
  const getThumbnailBlob = (path) => getFileBlob(path);
  const getTemporaryLink = async (path) => URL.createObjectURL(await getFileBlob(path));

  // Nunca sobrescribe: si existe, "nombre (1).ext", "nombre (2).ext"…
  const uploadBinaryFile = async (path, blob) => {
    let target = path;
    const m = /^(.*?)(\.[^./]*)?$/.exec(path);
    for (let n = 1; await pathExists(target); n++) target = `${m[1]} (${n})${m[2] || ''}`;
    await writeFile(target, blob);
    return target;
  };

  // Todos los .org de la carpeta (sin backups/ ni carpetas ocultas)
  const listOrgFiles = async () => {
    const out = [];
    const walk = async (dir, prefix, depth) => {
      if (depth > 8 || out.length > 5000) return;
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith('.')) continue;
        const full = `${prefix}/${name}`;
        if (handle.kind === 'directory') {
          if (name.toLowerCase() !== 'backups') await walk(handle, full, depth + 1);
        } else if (/\.org(\.gpg|\.asc)?$/i.test(name)) {
          out.push(full);
        }
      }
    };
    await walk(await root(), '', 0);
    return out.sort((a, b) => a.localeCompare(b));
  };

  return {
    type: 'LocalFolder',
    isSignedIn,
    getDirectoryListing,
    getMoreDirectoryListing,
    updateFile,
    createFile,
    getFileContentsAndMetadata,
    getFileContents,
    deleteFile,
    pathExists,
    getFileBlob,
    getThumbnailBlob,
    getTemporaryLink,
    uploadBinaryFile,
    listOrgFiles,
  };
};
