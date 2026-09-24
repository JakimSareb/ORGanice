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
          dbx.filesListFolder({ path }).then((response) => {
            resolve({
              listing: transformDirectoryListing(response.result.entries),
              hasMore: response.result.has_more,
              additionalSyncBackendState: Map({
                cursor: response.result.cursor,
              }),
            });
          });
        })
        .catch(reject);
    });

  const getMoreDirectoryListing = (additionalSyncBackendState) => {
    const cursor = additionalSyncBackendState.get('cursor');
    return new Promise((resolve, reject) =>
      dbxPromise.then((dbx) => {
        dbx.filesListFolderContinue({ cursor }).then((response) =>
          resolve({
            listing: transformDirectoryListing(response.result.entries),
            hasMore: response.result.has_more,
            additionalSyncBackendState: Map({
              cursor: response.result.cursor,
            }),
          })
        );
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

  const getFileContentsAndMetadata = (path) =>
    new Promise((resolve, reject) =>
      dbxPromise.then((dbx) => {
        dbx
          .filesDownload({ path })
          .then((response) => {
            const reader = new FileReader();
            reader.addEventListener('loadend', () =>
              resolve({
                contents: reader.result,
                lastModifiedAt: response.result.server_modified,
              })
            );
            if (/\.gpg$/i.test(path)) {
              // ORG Mode para Eli: .gpg es binario, se entrega como Uint8Array
              response.result.fileBlob.arrayBuffer().then((buf) =>
                resolve({
                  contents: new Uint8Array(buf),
                  lastModifiedAt: response.result.server_modified,
                })
              );
            } else {
              reader.readAsText(response.result.fileBlob);
            }
          })
          .catch((error) => {
            // INFO: It's possible organice is using the Dropbox API
            // wrongly. In any case, for some files and only sometimes,
            // when a file is requested, there's either:
            //   - a 400 with a plain text error or
            //   - a 409 with an embedded JSON error
            //   - a 409 with a plain text error under `.error`
            // coming back. Sometimes, there's even two API calls to
            // `/download` happening at the same time (of types `json`
            // and `octet-stream`) where one might fail and the other
            // might prevail.
            // More debug information in this issue:
            // https://github.com/200ok-ch/organice/issues/108
            const objectContainsTagErrorP = (function () {
              try {
                return JSON.parse(error.error).error.path['.tag'] === 'not_found';
              } catch (e) {
                return false;
              }
            })();
            if (
              (typeof error === 'string' && error.match(/missing required field 'path'/)) ||
              objectContainsTagErrorP
            ) {
              reject();
            }
          });
      })
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
    withDbx((dbx) => dbx.filesDownload({ path })).then((response) => response.result.fileBlob);

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
  const listOrgFiles = () =>
    withDbx(async (dbx) => {
      let response = await dbx.filesListFolder({ path: '', recursive: true, limit: 2000 });
      let entries = response.result.entries;
      while (response.result.has_more && entries.length < 20000) {
        response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
        entries = entries.concat(response.result.entries);
      }
      return entries
        .filter((e) => e['.tag'] === 'file')
        .map((e) => e.path_display)
        .filter((p) => /\.org(\.gpg|\.asc)?$/i.test(p) && !/\/backups\//i.test(p))
        .sort((a, b) => a.localeCompare(b));
    });

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
    pathExists,
    getFileBlob,
    getThumbnailBlob,
    getTemporaryLink,
    uploadBinaryFile,
    listOrgFiles,
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
