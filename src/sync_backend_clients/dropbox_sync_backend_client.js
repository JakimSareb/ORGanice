import { getDropboxClientId } from '../lib/dropbox_client_id';
import { appRootUrl } from '../lib/base_path';
import { isEmpty } from 'lodash';
import { orgFileExtensions } from '../lib/org_utils';

import { persistField, getPersistedField } from '../util/settings_persister';

import { Dropbox } from 'dropbox';

import parseQueryString from '../util/parse_query_string';

import { fromJS, Map } from 'immutable';

/**
 * Gets a directory listing ready to be rendered by organice.
 *  - Filters files from `listing` down to org files.
 *  - Sorts folders atop of files.
 *  - Sorts both folders and files alphabetically.
 * @param {Array} listing
 */
export const filterAndSortDirectoryListing = (listing) => {
  const filteredListing = listing.filter((file) => {
    // Show all folders
    if (file['.tag'] === 'folder') return true;
    // Filter out all non-org files
    return file.name.match(orgFileExtensions);
  });
  return filteredListing.sort((a, b) => {
    // Folders before files
    if (a['.tag'] === 'folder' && b['.tag'] === 'file') {
      return -1;
    } else if (a['.tag'] === 'file' && b['.tag'] === 'folder') {
      return 1;
    } else {
      // Sorth both folders and files alphabetically
      return a.name > b.name ? 1 : -1;
    }
  });
};

// ORG Mode para Eli (2.15): descargas de Dropbox más robustas.
// - Como mucho 3 descargas a la vez (con «todos los ficheros .org» se pedían decenas de golpe y
//   Dropbox respondía «429 too_many_requests»).
// - Si Dropbox pide esperar (429) o falla un momento (5xx, red), se reintenta tras la espera.
// - Si no, se rechaza con un error de verdad (antes, con cualquier error que no fuera «no existe»
//   la promesa no terminaba nunca y la app acababa diciendo «El servidor no responde»).
const MAX_PARALLEL_DOWNLOADS = 3;
let activeDownloads = 0;
const downloadQueue = [];
// Si Dropbox no contesta (pasa sin conexión), el hueco de la cola se libera igualmente
const SLOT_TIMEOUT = 60000;
export const queuedDownload = (run, onStart) =>
  new Promise((resolve, reject) => {
    const start = () => {
      activeDownloads++;
      if (onStart) {
        try {
          onStart();
        } catch (e) {}
      }
      let timer = null;
      const timeout = new Promise((_, rej) => {
        timer = setTimeout(() => {
          const e = new Error('El servidor no responde');
          e.eliTimeout = true;
          e.eliTransient = true;
          rej(e);
        }, SLOT_TIMEOUT);
      });
      Promise.race([Promise.resolve().then(run), timeout])
        .then(resolve, reject)
        .finally(() => {
          clearTimeout(timer);
          activeDownloads--;
          const next = downloadQueue.shift();
          if (next) next();
        });
    };
    if (activeDownloads < MAX_PARALLEL_DOWNLOADS) start();
    else downloadQueue.push(start);
  });

const statusOf = (error) =>
  (error && (error.status || (error.response && error.response.status))) || 0;
const errorText = (error) => {
  try {
    return typeof error === 'string'
      ? error
      : JSON.stringify((error && (error.error || error)) || '');
  } catch (e) {
    return String(error);
  }
};
export const isNotFoundError = (error) => {
  if (typeof error === 'string' && /missing required field 'path'/.test(error)) return true;
  try {
    const inner = typeof error.error === 'string' ? JSON.parse(error.error) : error.error;
    if (inner && inner.error && inner.error.path && inner.error.path['.tag'] === 'not_found') {
      return true;
    }
  } catch (e) {}
  return /path\/not_found|"not_found"/.test(errorText(error));
};
const retryAfterMs = (error, attempt) => {
  let seconds = null;
  try {
    const inner = typeof error.error === 'string' ? JSON.parse(error.error) : error.error;
    if (inner && inner.error && inner.error.retry_after) seconds = +inner.error.retry_after;
  } catch (e) {}
  const header =
    error && error.headers && (error.headers.get ? error.headers.get('Retry-After') : null);
  if (!seconds && header) seconds = +header;
  const ms = seconds ? seconds * 1000 : 1000 * 2 ** attempt;
  return Math.min(ms, 15000);
};
const isRetryable = (error) => {
  const status = statusOf(error);
  if (status === 429 || status >= 500) return true;
  if (/too_many_requests|too_many_write_operations/.test(errorText(error))) return true;
  return /failed to fetch|networkerror|network error|load failed/i.test(
    (error && error.message) || ''
  );
};
// Mensaje claro para mostrar
export const dropboxErrorMessage = (error) => {
  const status = statusOf(error);
  if (status === 401 || /expired_access_token|invalid_access_token/.test(errorText(error))) {
    return 'Dropbox no acepta la sesión (vuelve a conectar la app con Dropbox desde Ajustes)';
  }
  if (status === 429 || /too_many_requests/.test(errorText(error))) {
    return 'Dropbox está recibiendo demasiadas peticiones; prueba de nuevo en un momento';
  }
  if (status >= 500) return `Dropbox no está disponible ahora mismo (error ${status})`;
  if (
    /failed to fetch|networkerror|network error|load failed/i.test((error && error.message) || '')
  ) {
    return 'No se ha podido conectar con Dropbox';
  }
  return `Dropbox ha devuelto un error${status ? ` (${status})` : ''}`;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const withRetries = async (run, attempts = 4) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts - 1 || isNotFoundError(error) || !isRetryable(error)) throw error;
      await wait(retryAfterMs(error, attempt));
    }
  }
};

function getCodeFromUrl() {
  return parseQueryString(window.location.search).code;
}

export default () => {
  let dbxPromise;

  const isSignedIn = () => new Promise((resolve) => resolve(true));

  const transformDirectoryListing = (listing) => {
    const sortedListing = filterAndSortDirectoryListing(listing);
    return fromJS(
      sortedListing.map((entry) => ({
        id: entry.id,
        name: entry.name,
        isDirectory: entry['.tag'] === 'folder',
        path: entry.path_display,
      }))
    );
  };

  const getDirectoryListing = (path) =>
    new Promise((resolve, reject) => {
      dbxPromise
        .then((dbx) => {
          withRetries(() => dbx.filesListFolder({ path }))
            .then((response) => {
              resolve({
                listing: transformDirectoryListing(response.result.entries),
                hasMore: response.result.has_more,
                additionalSyncBackendState: Map({
                  cursor: response.result.cursor,
                }),
              });
            })
            // ORG Mode para Eli (2.15): antes un error dejaba la lista esperando para siempre
            .catch(reject);
        })
        .catch(reject);
    });

  const getMoreDirectoryListing = (additionalSyncBackendState) => {
    const cursor = additionalSyncBackendState.get('cursor');
    return new Promise((resolve, reject) =>
      dbxPromise.then((dbx) => {
        withRetries(() => dbx.filesListFolderContinue({ cursor }))
          .then((response) =>
            resolve({
              listing: transformDirectoryListing(response.result.entries),
              hasMore: response.result.has_more,
              additionalSyncBackendState: Map({
                cursor: response.result.cursor,
              }),
            })
          )
          .catch(reject);
      })
    );
  };

  const uploadFile = (path, contents) =>
    new Promise((resolve, reject) =>
      dbxPromise.then((dbx) => {
        dbx
          .filesUpload({
            path,
            // ORG Mode para Eli: los .gpg cifrados son binarios
            contents:
              contents instanceof Uint8Array
                ? new Blob([contents], { type: 'application/octet-stream' })
                : contents,
            mode: {
              '.tag': 'overwrite',
            },
            autorename: true,
          })
          .then(resolve)
          .catch(reject);
      })
    );

  const updateFile = uploadFile;
  const createFile = uploadFile;

  // opts.onStart: se llama cuando la descarga sale de la cola (para contar el tiempo de espera
  // del servidor desde ahí, no desde que se pidió)
  const getFileContentsAndMetadata = (path, opts = {}) =>
    queuedDownload(
      () => withRetries(() => dbxPromise.then((dbx) => dbx.filesDownload({ path }))),
      opts.onStart
    ).then(
      (response) =>
        new Promise((resolve, reject) => {
          const lastModifiedAt = response.result.server_modified;
          if (/\.gpg$/i.test(path)) {
            // ORG Mode para Eli: .gpg es binario, se entrega como Uint8Array
            response.result.fileBlob
              .arrayBuffer()
              .then((buf) => resolve({ contents: new Uint8Array(buf), lastModifiedAt }), reject);
            return;
          }
          const reader = new FileReader();
          reader.addEventListener('loadend', () =>
            resolve({ contents: reader.result, lastModifiedAt })
          );
          reader.addEventListener('error', () =>
            reject(new Error('No se ha podido leer el fichero'))
          );
          reader.readAsText(response.result.fileBlob);
        }),
      (error) => {
        // «No existe»: se rechaza sin motivo, como siempre (la app lo trata como fichero que no
        // está). Cualquier otro error: con su mensaje (y el original, para quien lo necesite).
        if (isNotFoundError(error)) return Promise.reject();
        const e = new Error(dropboxErrorMessage(error));
        e.status = statusOf(error);
        e.dropboxError = error;
        // Fallo pasajero (red, 429, 5xx): la capa sin conexión puede usar la copia del dispositivo
        e.eliTransient = isRetryable(error);
        return Promise.reject(e);
      }
    );

  const getFileContents = (path) => {
    if (isEmpty(path)) return Promise.reject('No path given');
    return new Promise((resolve, reject) =>
      getFileContentsAndMetadata(path)
        .then(({ contents }) => resolve(contents))
        .catch(reject)
    );
  };

  const deleteFile = (path) =>
    new Promise((resolve, reject) =>
      dbxPromise.then((dbx) => {
        dbx
          .filesDelete({ path })
          .then(resolve)
          .catch((error) => reject(error.error.error['.tag'] === 'path_lookup', error));
      })
    );

  /* Dropbox documentation on OAuth2 and PKCE:

  -  SDK Repo: https://github.com/dropbox/dropbox-sdk-js
  -  OAuth Guide: https://developers.dropbox.com/oauth-guide
  -  PKCE: What and Why?: https://dropbox.tech/developers/pkce--what-and-why-
  -  Single HTML file example: https://github.com/dropbox/dropbox-sdk-js/blob/main/examples/javascript/pkce-browser/index.html
  -  SDK Docs: https://dropbox.github.io/dropbox-sdk-js/index.html
  -  Migrating App Permissions and Access Tokens: https://dropbox.tech/developers/migrating-app-permissions-and-access-tokens */

  const REDIRECT_URI = appRootUrl();

  dbxPromise = new Promise((resolve, reject) => {
    const dbx = new Dropbox({
      clientId: getDropboxClientId(),
      fetch: fetch.bind(window),
    });
    const dbxAuth = dbx.auth;

    if (getCodeFromUrl()) {
      dbxAuth.setCodeVerifier(getPersistedField('codeVerifier'));
      dbxAuth
        .getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl())
        .then((response) => {
          dbxAuth.setRefreshToken(response.result.refresh_token);
          persistField('dropboxRefreshToken', response.result.refresh_token);

          resolve(dbx);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      dbxAuth.setCodeVerifier(getPersistedField('codeVerifier'));
      dbxAuth.setRefreshToken(getPersistedField('dropboxRefreshToken'));
      resolve(dbx);
    }
  });

  // ORG Mode para Eli: contenido multimedia (assets/AAAA)
  const withDbx = (fn) => dbxPromise.then(fn);

  const getFileBlob = (path) =>
    queuedDownload(() => withRetries(() => withDbx((dbx) => dbx.filesDownload({ path })))).then(
      (response) => response.result.fileBlob
    );

  const getThumbnailBlob = (path, size = 'w1024h768') =>
    withDbx((dbx) =>
      dbx.filesGetThumbnailV2({
        resource: { '.tag': 'path', path },
        format: { '.tag': 'jpeg' },
        size: { '.tag': size },
        mode: { '.tag': 'fitone_bestfit' },
      })
    ).then((response) => response.result.fileBlob);

  const getTemporaryLink = (path) =>
    withDbx((dbx) => dbx.filesGetTemporaryLink({ path })).then((response) => response.result.link);

  // Sube un fichero binario sin sobrescribir nunca: si el nombre existe, Dropbox lo renombra.
  const uploadBinaryFile = (path, blob) =>
    withDbx((dbx) =>
      dbx.filesUpload({ path, contents: blob, mode: { '.tag': 'add' }, autorename: true })
    ).then((response) => response.result.path_display);

  // ORG Mode para Eli: todos los ficheros .org (también .org.gpg/.org.asc) del Dropbox de la app,
  // sin copias de seguridad ni ficheros de archivo
  // ORG Mode para Eli: todos los ficheros de la carpeta (recursivo), con su tamaño
  const listAllFileEntries = () =>
    withDbx(async (dbx) => {
      let response = await dbx.filesListFolder({ path: '', recursive: true, limit: 2000 });
      let entries = response.result.entries;
      while (response.result.has_more && entries.length < 20000) {
        response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
        entries = entries.concat(response.result.entries);
      }
      return entries
        .filter((e) => e['.tag'] === 'file')
        .map((e) => ({ path: e.path_display, size: e.size || 0 }))
        .sort((a, b) => a.path.localeCompare(b.path));
    });
  const listAllFiles = () => listAllFileEntries().then((list) => list.map((e) => e.path));

  const listOrgFiles = () =>
    listAllFiles().then((paths) =>
      paths.filter((p) => /\.org(\.gpg|\.asc)?$/i.test(p) && !/\/backups\//i.test(p))
    );

  // ¿Existe el fichero? (organice no resuelve getFileContents cuando no existe)
  const pathExists = (path) =>
    withDbx((dbx) => dbx.filesGetMetadata({ path })).then(
      () => true,
      (error) => {
        const text = JSON.stringify((error && (error.error || error)) || '');
        if ((error && error.status === 409) || /not_found/.test(text)) return false;
        throw error;
      }
    );

  return {
    type: 'Dropbox',
    supportsOnStart: true,
    pathExists,
    getFileBlob,
    getThumbnailBlob,
    getTemporaryLink,
    uploadBinaryFile,
    listOrgFiles,
    listAllFiles,
    listAllFileEntries,
    isSignedIn,
    getDirectoryListing,
    getMoreDirectoryListing,
    updateFile,
    createFile,
    getFileContentsAndMetadata,
    getFileContents,
    deleteFile,
  };
};
