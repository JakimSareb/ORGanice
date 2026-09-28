import { clearOfflineStore } from '../lib/eli_offline_store';
import { lastSyncAtFor } from '../lib/eli_offline_client';
import { backupPathFor } from '../lib/eli_media';
import { forgetRootHandle } from '../sync_backend_clients/local_folder_sync_backend_client';
import { ActionCreators } from 'redux-undo';

import { setLoadingMessage, hideLoadingMessage, clearModalStack, setIsLoading } from './base';
import {
  parseFile,
  setDirty,
  setLastSyncAt,
  setOrgFileErrorMessage,
  sync,
  eliApplyPendingLocalVersion,
} from './org';
import { localStorageAvailable, persistField } from '../util/settings_persister';
import { createGitlabOAuth } from '../sync_backend_clients/gitlab_sync_backend_client';

import { addSeconds } from 'date-fns';

import _ from 'lodash';

import pathParse from 'path-parse';

export const signOut = () => (dispatch, getState) => {
  switch (getState().syncBackend.get('client', {}).type) {
    case 'WebDAV':
      ['Endpoint', 'Username', 'Password'].forEach((e) => {
        persistField('webdav' + e, null);
      });
      break;
    case 'Dropbox':
      // `dropboxAccessToken` is a legacy token that was relevant
      // prior to switching to OAuth 2 and PKCE. Still deleting it
      // here for a consistent state in users localStorage.
      persistField('dropboxAccessToken', null);
      persistField('dropboxRefreshToken', null);
      persistField('codeVerifier', null);
      break;
    case 'GitLab':
      persistField('gitLabProject', null);
      createGitlabOAuth().reset();
      break;
    case 'LocalFolder':
      // ORG Mode para Eli: olvidar la carpeta elegida
      forgetRootHandle().catch(() => {});
      break;
    default:
  }

  persistField('authenticatedSyncService', null);

  dispatch({ type: 'SIGN_OUT' });
  dispatch(clearModalStack());
  dispatch(hideLoadingMessage());

  if (localStorageAvailable) {
    localStorage.clear();
  }
  // ORG Mode para Eli (2.12): y lo guardado para usar sin conexión
  clearOfflineStore();
};

export const setCurrentFileBrowserDirectoryListing = (
  directoryListing,
  hasMore,
  additionalSyncBackendState,
  path
) => ({
  type: 'SET_CURRENT_FILE_BROWSER_DIRECTORY_LISTING',
  directoryListing,
  hasMore,
  additionalSyncBackendState,
  path,
});

export const setIsLoadingMoreDirectoryListing = (isLoadingMore) => ({
  type: 'SET_IS_LOADING_MORE_DIRECTORY_LISTING',
  isLoadingMore,
});

export const getDirectoryListing = (path) => (dispatch, getState) => {
  dispatch(setLoadingMessage('Obteniendo la lista de ficheros…'));

  const client = getState().syncBackend.get('client');
  client
    .getDirectoryListing(path)
    .then(({ listing, hasMore, additionalSyncBackendState }) => {
      dispatch(
        setCurrentFileBrowserDirectoryListing(listing, hasMore, additionalSyncBackendState, path)
      );
      dispatch(hideLoadingMessage());
    })
    .catch((error) => {
      dispatch(hideLoadingMessage());
      const error_summary = _.get(error, 'error.error_summary') || '';
      // ORG Mode para Eli (2.15): cerrar la sesión solo si Dropbox no acepta la sesión (un 400
      // por otra causa, p. ej. una ruta mala, ya no saca de la app)
      const status = error && (error.status || (error.dropboxError && error.dropboxError.status));
      const text = JSON.stringify((error && (error.error || error.dropboxError)) || '');
      if (
        status === 401 ||
        error_summary.includes('expired_access_token') ||
        /expired_access_token|invalid_access_token/.test(text)
      ) {
        dispatch(signOut());
      } else {
        alert('¡Error al obtener los ficheros!');
        console.error(error);
      }
    });
};

export const loadMoreDirectoryListing = () => (dispatch, getState) => {
  dispatch(setIsLoadingMoreDirectoryListing(true));

  const client = getState().syncBackend.get('client');
  const currentFileBrowserDirectoryListing = getState().syncBackend.get(
    'currentFileBrowserDirectoryListing'
  );
  client
    .getMoreDirectoryListing(currentFileBrowserDirectoryListing.get('additionalSyncBackendState'))
    .then(({ listing, hasMore, additionalSyncBackendState }) => {
      const extendedListing = currentFileBrowserDirectoryListing.get('listing').concat(listing);
      dispatch(
        setCurrentFileBrowserDirectoryListing(extendedListing, hasMore, additionalSyncBackendState)
      );
      dispatch(setIsLoadingMoreDirectoryListing(false));
    })
    .catch((error) => {
      // (2.15) antes el error quedaba sin atender y el «cargando» no terminaba
      dispatch(setIsLoadingMoreDirectoryListing(false));
      console.error(error);
    });
};

export const pushBackup = (pathOrFileId, contents) => {
  return (dispatch, getState) => {
    const client = getState().syncBackend.get('client');
    switch (client.type) {
      case 'Dropbox':
      case 'WebDAV':
      case 'LocalFolder':
        // ORG Mode para Eli: las copias se guardan en la subcarpeta "backups"
        Promise.resolve(client.createFile(backupPathFor(pathOrFileId), contents)).catch(() => {});
        break;
      case 'GitLab':
        // No-op for GitLab, because the beauty of version control makes backup files redundant.
        break;
      default:
    }
  };
};

export const downloadFile = (path) => {
  return (dispatch, getState) => {
    dispatch(setLoadingMessage(`Descargando fichero…`));
    dispatch(setOrgFileErrorMessage(null, path));
    getState()
      .syncBackend.get('client')
      .getFileContentsAndMetadata(path)
      .then((result) => {
        const fileContents = result.contents;
        dispatch(hideLoadingMessage());
        // ORG Mode para Eli (2.13): sin copia de seguridad de una copia del dispositivo
        if (!result.eliFromCache) dispatch(pushBackup(path, fileContents));
        // ORG Mode para Eli: si mientras se descargaba el fichero ya se había cargado y cambiado
        // (p. ej. desde la vista GTD), no se pisa ese cambio: se sincroniza como siempre
        if (getState().org.present.getIn(['files', path, 'isDirty'])) {
          dispatch(sync({ path, shouldSuppressMessages: true }));
          return;
        }
        dispatch(parseFile(path, fileContents));
        dispatch(setLastSyncAt(lastSyncAtFor(result), path));
        dispatch(setDirty(false, path));
        dispatch(ActionCreators.clearHistory());
        // ORG Mode para Eli (2.12): cambios cifrados hechos sin conexión y aún sin subir
        dispatch(eliApplyPendingLocalVersion(path));
      })
      .catch((error) => {
        dispatch(hideLoadingMessage());
        dispatch(setIsLoading(false, path));
        dispatch(
          setOrgFileErrorMessage(
            error && error.message
              ? `${path}: ${error.message}`
              : `No se encuentra el fichero ${path}`,
            path
          )
        );
      });
  };
};

/**
 * @param {String} path Returns the directory name of `path`.
 */
function dirName(path) {
  return pathParse(path).dir;
}

export const createFile = (path, content) => {
  return (dispatch, getState) => {
    dispatch(setLoadingMessage(`Creando fichero: ${path}`));
    getState()
      .syncBackend.get('client')
      .createFile(path, content)
      .then(() => {
        dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
        dispatch(hideLoadingMessage());
        dispatch(getDirectoryListing(dirName(path)));
        // ORG Mode para Eli: con «todos los ficheros .org», el nuevo entra solo
        if (getState().base.get('eliAllOrgFiles') && /\.org(\.gpg|\.asc)?$/i.test(path)) {
          dispatch({ type: 'ELI_ADD_ALL_FILE_SETTINGS', paths: [path] });
        }
      })
      .catch(() => {
        dispatch(hideLoadingMessage());
        dispatch(setIsLoading(false, path));
        dispatch(setOrgFileErrorMessage(`No se encuentra el fichero ${path}`, path));
      });
  };
};
