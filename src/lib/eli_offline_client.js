// ORG Mode para Eli (2.12): uso sin conexión.
//
// Envoltorio del cliente de sincronización (Dropbox, WebDAV, GitLab). Va DEBAJO del cifrado,
// así que ve los ficheros tal como están en el servidor (los .gpg/.asc, cifrados):
// - Cada fichero que se descarga se guarda en el dispositivo (si está permitido: copia local
//   para los que no están cifrados; «ficheros cifrados sin conexión» para los cifrados).
// - Sin conexión (o si el servidor no responde), se entrega esa copia.
// - Igual con las listas de ficheros y, si se han guardado, con los adjuntos.
import { isEncryptedPath } from './eli_crypto';
import { getPersistPlainFiles, getOfflineEncrypted } from './eli_security';
import {
  getServerCopy,
  setServerCopy,
  removeServerCopy,
  kvGet,
  kvSet,
  getOfflineBlob,
} from './eli_offline_store';

export const canKeepOffline = (path) =>
  isEncryptedPath(path) ? getOfflineEncrypted() : getPersistPlainFiles();

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const timeoutError = () => {
  const e = new Error('El servidor no responde');
  e.eliTimeout = true;
  return e;
};
const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(timeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

// ¿Fallo de red (no «no existe»)?
export const isNetworkError = (e) =>
  !isOnline() ||
  (!!e &&
    (e.eliTimeout ||
      e.eliOffline ||
      e.name === 'TypeError' ||
      /failed to fetch|networkerror|network error|load failed|internet/i.test(e.message || '')));

export const offlineError = (path) => {
  const e = new Error(
    `Sin conexión y sin copia de ${path} en este dispositivo. ` +
      'Ajustes → Usar sin conexión → «Preparar» guarda tus ficheros para la próxima vez.'
  );
  e.eliOffline = true;
  return e;
};

// Tiempo máximo esperando al servidor cuando hay copia (después se usa la copia)
const WAIT_WITH_COPY = 12000;
// …y cuando no la hay (Dropbox a veces no responde nunca sin conexión)
const WAIT_WITHOUT_COPY = 60000;

export const withOfflineCache = (client) => {
  if (!client || client.__eliOffline) return client;

  const fromCopy = (path, copy) => ({
    contents: copy.contents,
    lastModifiedAt: copy.lastModifiedAt,
    eliFromCache: true,
    eliPending: !!copy.pending,
  });

  const remember = (path, result) => {
    const copy = getServerCopy(path);
    if (copy && copy.pending) return; // hay cambios propios sin subir: no se pisan
    if (canKeepOffline(path)) {
      setServerCopy(path, {
        contents: result.contents,
        lastModifiedAt: result.lastModifiedAt,
        savedAt: new Date().toISOString(),
      });
    } else if (copy) {
      removeServerCopy(path);
    }
  };

  const getFileContentsAndMetadata = async (path) => {
    const copy = getServerCopy(path);
    if (!isOnline()) {
      if (copy) return fromCopy(path, copy);
      throw offlineError(path);
    }
    try {
      const result = await withTimeout(
        client.getFileContentsAndMetadata(path),
        copy ? WAIT_WITH_COPY : WAIT_WITHOUT_COPY
      );
      remember(path, result);
      return result;
    } catch (e) {
      if (copy && isNetworkError(e)) return fromCopy(path, copy);
      throw e;
    }
  };

  const afterUpload = (path, contents) => {
    if (canKeepOffline(path)) {
      setServerCopy(path, {
        contents,
        lastModifiedAt: new Date().toISOString(),
        savedAt: new Date().toISOString(),
      });
    } else {
      removeServerCopy(path); // también una versión pendiente: ya está subida
    }
  };

  // Listas de ficheros: la última conocida sirve sin conexión
  const cachedList = (name, fn) =>
    fn &&
    (async (...args) => {
      const key = `list:${name}`;
      const last = kvGet(key);
      if (!isOnline() && last) return last;
      try {
        const list = await (last ? withTimeout(fn(...args), WAIT_WITH_COPY) : fn(...args));
        if (Array.isArray(list)) kvSet(key, list);
        return list;
      } catch (e) {
        if (last && isNetworkError(e)) return last;
        throw e;
      }
    });

  // Adjuntos guardados: sin conexión se usan desde el dispositivo
  const offlineBlob = async (path) => {
    const blob = await getOfflineBlob(path);
    if (!blob) throw offlineError(path);
    return blob;
  };
  const blobWithFallback = (fn) =>
    fn &&
    (async (path, ...rest) => {
      if (!isOnline()) return offlineBlob(path);
      try {
        return await fn(path, ...rest);
      } catch (e) {
        if (isNetworkError(e)) {
          const blob = await getOfflineBlob(path);
          if (blob) return blob;
        }
        throw e;
      }
    });

  const wrapped = {
    ...client,
    __eliOffline: true,
    getFileContentsAndMetadata,
    getFileContents: async (path) => (await getFileContentsAndMetadata(path)).contents,
    updateFile: async (path, contents, ...rest) => {
      const result = await client.updateFile(path, contents, ...rest);
      afterUpload(path, contents);
      return result;
    },
    createFile: async (path, contents, ...rest) => {
      const result = await client.createFile(path, contents, ...rest);
      afterUpload(path, contents);
      return result;
    },
    // Para «Preparar para usar sin conexión»: descarga (sin descifrar) y guarda
    eliPrefetch: async (path) => {
      const result = await withTimeout(client.getFileContentsAndMetadata(path), WAIT_WITHOUT_COPY);
      if (!canKeepOffline(path)) return false;
      remember(path, result);
      return true;
    },
    eliRawClient: client,
  };
  ['listOrgFiles', 'listAllFiles', 'listAllFileEntries'].forEach((name) => {
    if (client[name]) wrapped[name] = cachedList(name, client[name]);
  });
  if (client.getFileBlob) wrapped.getFileBlob = blobWithFallback(client.getFileBlob);
  if (client.getThumbnailBlob) wrapped.getThumbnailBlob = blobWithFallback(client.getThumbnailBlob);
  return wrapped;
};
