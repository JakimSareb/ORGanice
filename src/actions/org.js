import { ActionCreators, ActionTypes } from 'redux-undo';
import { isDocLocked } from '../lib/eli_doc_lock';
import {
  offerToDeleteAttachments,
  attachmentsOfHeader,
  removeLinksToTarget,
  confirmAndDeleteAttachment,
  chooseAttachmentToDelete,
  findFinishedAttachments,
  reviewAttachmentsDialog,
  referencedOutside,
  isArchiveFile,
} from '../lib/eli_attachments';
import { addConflict, sameContents } from '../lib/eli_conflicts';
import { announceSaved } from '../lib/eli_multi';
import {
  parseOrgLink,
  findLinkedHeader,
  findHeaderById,
  resolveLinkedPath,
} from '../lib/eli_org_links';
import { debounce } from 'lodash';
import {
  setLoadingMessage,
  hideLoadingMessage,
  setIsLoading,
  setDisappearingLoadingMessage,
  activatePopup,
  closePopup,
} from './base';
import { exportOrg, createRawDescriptionText, generateTitleLine } from '../lib/export_org';
import { tidyStateLog } from '../lib/eli_state_log';
import { uploadAssets, openInNewTab } from '../lib/eli_media';
import { getCurrentTimestampAsText } from '../lib/timestamps';
import { toggledPriorityATitle } from '../lib/eli_priority';
import {
  archiveLocationFor,
  resolveArchiveLocation,
  buildArchivedSubtree,
  newArchiveFileText,
  insertIntoArchiveText,
  targetLevelFor,
  SUBFOLDER_LOCATION,
} from '../lib/eli_archive';

// ORG Mode para Eli: destino por defecto del archivo (junto al fichero o en su subcarpeta archive)
const eliDefaultArchiveLocation = (getState) =>
  getState().base.get('eliArchiveInSubfolder') ? SUBFOLDER_LOCATION : undefined;
import { isEncryptedPath, decryptFile } from '../lib/eli_crypto';
import { pendingLocalVersion, clearPendingLocalVersion } from '../lib/eli_offline_store';
import { List } from 'immutable';
import { hasActiveClock } from '../lib/clocking';
import {
  decryptCryptEntryInText,
  encryptCryptEntries,
  inheritEncryptionMeta,
} from '../lib/eli_crypto';
import { showMessage, askConfirm } from '../lib/eli_prompt';
import substituteTemplateVariables from '../lib/capture_template_substitution';
import {
  headerWithPath,
  STATIC_FILE_PREFIX,
  createIsTodoKeywordInDoneState,
  parentIdOfHeaderWithId,
} from '../lib/org_utils';

import sampleCaptureTemplates from '../lib/sample_capture_templates';

import { isAfter, addSeconds } from 'date-fns';
import { parseISO } from 'date-fns';
import {
  persistIsDirty,
  saveFileContentsToLocalStorage,
  cancelPendingEncryption,
} from '../util/file_persister';
import { lastSyncAtFor } from '../lib/eli_offline_client';
import { localStorageAvailable, readOpennessState } from '../util/settings_persister';
import { parseExcludedFolders, withoutExcluded } from '../lib/eli_excluded_folders';
import { idLinksToText, isOnlyIdLink } from '../lib/eli_id_links';
import { dayOfOrgId, openDiary } from '../lib/eli_diary';

export const parseFile = (path, contents) => (dispatch) => {
  if (localStorageAvailable && !path.startsWith(STATIC_FILE_PREFIX)) {
    saveFileContentsToLocalStorage(path, contents);
    const opennessState = readOpennessState();
    if (!!opennessState) {
      dispatch(setOpennessState(path, opennessState[path]));
    }
  }
  dispatch({
    type: 'PARSE_FILE',
    path,
    contents,
  });
  dispatch(applyOpennessState(path));
};

export const setLastSyncAt = (lastSyncAt, path) => ({
  type: 'SET_LAST_SYNC_AT',
  path,
  lastSyncAt,
});

export const resetFileDisplay = () => {
  return (dispatch) => {
    dispatch(widenHeader());
    dispatch(closePopup());
    dispatch({ type: 'CLEAR_SEARCH' });
    dispatch(setPath(null));
    dispatch(ActionCreators.clearHistory());
  };
};

const getDebouncedSyncFunction = () =>
  debounce((dispatch, options) => dispatch(doSync(options)), 3000, {
    leading: true,
    trailing: true,
  });
const debouncedSyncFunctions = {};
const syncDebounced = (dispatch, getState, options) => {
  // to make sure no file is skipped when multiple files are dirty
  // a seperately debounced function is used per file
  let filesToSync = [];
  if (options.path) {
    filesToSync = [options.path];
  } else {
    // if no path is passed in, sync all dirty files
    const files = getState().org.present.get('files');
    filesToSync = files.keySeq().filter((path) => files.getIn([path, 'isDirty']));
  }
  filesToSync.forEach((path) => {
    let debouncedSyncFunction = debouncedSyncFunctions[path];
    if (!debouncedSyncFunction) {
      debouncedSyncFunctions[path] = getDebouncedSyncFunction();
      debouncedSyncFunction = debouncedSyncFunctions[path];
    }
    debouncedSyncFunction(dispatch, { ...options, path });
  });
};

export const sync = (options) => (dispatch, getState) => {
  // Don't do anything if the browser is not online. When it gets back
  // from an offline state, a new `sync`action will be triggered then.
  if (getState().base.get('online')) {
    // If the user hits the 'sync' button, no matter if there's a sync
    // in progress or if the sync 'should' be debounced, listen to the
    // user and start a sync.
    if (options.forceAction === 'manual') {
      console.log('forcing sync');
      const files = getState().org.present.get('files');
      // sync all files on manual sync. (2.16) Los *.org_archive leídos para verlos
      // («Archivadas») solo si tienen cambios
      const paths = files
        .keySeq()
        .filter((path) => !isArchiveFile(path) || files.getIn([path, 'isDirty']))
        .filter((path) => !path.startsWith(STATIC_FILE_PREFIX))
        .toArray();
      if (options.shouldSuppressMessages || !paths.length) {
        paths.forEach((path) => dispatch(doSync({ ...options, path })));
      } else {
        // ORG Mode para Eli 3.27: una ronda = un solo aviso. Mientras se revisan los ficheros,
        // «Sincronizando…»; al terminar todos, un único aviso con el resultado (antes salía
        // uno por fichero: «Nada que sincronizar» cuatro veces seguidas).
        dispatch(setLoadingMessage('Sincronizando…'));
        const results = [];
        let left = paths.length;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          dispatch(reportSyncRound(results, options.successMessage));
        };
        const onDone = (result) => {
          results.push(result || { kind: 'nothing' });
          left -= 1;
          if (left === 0) finish();
        };
        // si algún fichero no contesta, el aviso no se queda para siempre
        setTimeout(finish, 45000);
        paths.forEach((path) => dispatch(doSync({ ...options, path, onDone })));
      }
    } else {
      syncDebounced(dispatch, getState, options);
    }
  }
};

// ORG Mode para Eli 3.27: el aviso único al terminar una ronda de sincronización manual
export const syncRoundMessage = (results, successMessage = 'Cambios subidos') => {
  const of = (kind) => results.filter((r) => r && r.kind === kind);
  const errors = of('error');
  if (errors.length) {
    return {
      text:
        errors.length === 1
          ? errors[0].text || 'Error al sincronizar'
          : `Error al sincronizar ${errors.length} ficheros`,
      ms: 5000,
    };
  }
  if (of('conflict').length) return null; // ya sale el diálogo del conflicto
  const offline = of('offline');
  if (offline.length) return { text: offline[0].text, ms: 3000 };
  const up = of('uploaded');
  const down = of('downloaded');
  if (up.length && down.length)
    return { text: 'Sincronizado: cambios subidos y descargados', ms: 2500 };
  if (up.length) return { text: successMessage || 'Cambios subidos', ms: 2000 };
  if (down.length === 1) return { text: `Última versión descargada: ${down[0].path}`, ms: 2000 };
  if (down.length) return { text: `Última versión descargada (${down.length} ficheros)`, ms: 2000 };
  return { text: 'Nada que sincronizar', ms: 2000 };
};

const reportSyncRound = (results, successMessage) => (dispatch) => {
  const msg = syncRoundMessage(results, successMessage);
  if (msg) dispatch(setDisappearingLoadingMessage(msg.text, msg.ms));
  else dispatch(hideLoadingMessage());
};

// doSync is the actual sync action synchronizing/persisting the Org
// file. When 'live sync' is enabled, there's potentially a quick
// succession of calls to 'sync' and therefore to the sync back-end
// happening. These calls need to be debounced. If there's a really
// succession of calls, only the first and last synchronization will
// happen.
// Note: This action is a redux-thunk action (because it returns a
// function). This function is defined every time it is called. Hence,
// wrapping it in `debounce` will not be good enough. Since it would
// be a new function every time, it would be called every time. The
// solution is to define an inner function `sync` outside of the
// wrapping function `syncDebounced`. This will actually debounce
// `doSync`, because the inner function `sync` will be created only
// once.
const doSync = ({
  forceAction = null,
  successMessage = 'Cambios subidos',
  shouldSuppressMessages = false,
  path,
  onDone = null,
} = {}) => (dispatch, getState) => {
  // ORG Mode para Eli 3.27: con `onDone` (ronda manual) este fichero no muestra avisos propios:
  // devuelve el resultado y la ronda muestra uno solo al final
  const quiet = !!onDone;
  let reported = false;
  const done = (result) => {
    if (reported || !onDone) return;
    reported = true;
    onDone(result);
  };
  const client = getState().syncBackend.get('client');
  const currentPath = getState().org.present.get('path');
  path = path || currentPath;
  if (!path || path.startsWith(STATIC_FILE_PREFIX)) {
    done(null);
    return;
  }

  // Calls do `doSync` are already debounced using a timer, but on big
  // Org files or slow connections, it's still possible to have
  // concurrent requests to `doSync` which has no merit. When
  // `isLoading`, don't trigger another sync in parallel. Instead,
  // call `syncDebounced` and return immediately. This will
  // recursively enqueue the request to do a sync until the current
  // sync is finished. Since it's a debounced call, enqueueing it
  // recursively is efficient.
  // That is, unless the user manually hits the 'sync' button
  // (indicated by `forceAction === 'manual'`). Then, do what the user
  // requests.
  if (getState().base.get('isLoading').includes(path) && forceAction !== 'manual') {
    // Since there is a quick succession of debounced requests to
    // synchronize, the user likely is in a undo/redo workflow with
    // potential new changes to the Org file in between. In such a
    // situation, it is easy for the remote file to have a newer
    // `lastModifiedAt` date than the `lastSyncAt` date. Hence,
    // pushing is the right action - no need for the modal to ask the
    // user for her request to pull/push or cancel.
    dispatch(sync({ forceAction: 'push' }));
    return;
  }

  if (!shouldSuppressMessages && !quiet) {
    dispatch(setLoadingMessage(`Sincronizando…`));
  }
  dispatch(setIsLoading(true, path));
  dispatch(setOrgFileErrorMessage(null, path));

  client
    .getFileContentsAndMetadata(path)
    .then(({ contents, lastModifiedAt, eliFromCache }) => {
      // ORG Mode para Eli (2.13): si el servidor no ha respondido y llega la copia del
      // dispositivo, no se decide nada: se sincroniza al volver la conexión
      if (eliFromCache) {
        dispatch(setIsLoading(false, path));
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (quiet) {
          done({
            kind: 'offline',
            path,
            text: offline
              ? 'Sin conexión: se sincronizará al volver'
              : 'El servidor no responde: se volverá a intentar',
          });
        } else if (!shouldSuppressMessages) {
          dispatch(
            setDisappearingLoadingMessage(
              offline
                ? 'Sin conexión: se sincronizará al volver'
                : 'El servidor no responde: se volverá a intentar',
              3000
            )
          );
        } else {
          dispatch(hideLoadingMessage());
        }
        // Con conexión pero sin respuesta del servidor: otro intento dentro de un rato (sin
        // conexión se sincroniza solo al volver)
        if (!offline) {
          setTimeout(() => dispatch(sync({ path, shouldSuppressMessages: true })), 30000);
        }
        return;
      }
      const isDirty = getState().org.present.getIn(['files', path, 'isDirty']);
      const lastServerModifiedAt = parseISO(lastModifiedAt);
      const lastSyncAt = getState().org.present.getIn(['files', path, 'lastSyncAt']);

      if (isAfter(lastSyncAt, lastServerModifiedAt) || forceAction === 'push') {
        if (isDirty) {
          const contents = exportOrg({
            headers: getState().org.present.getIn(['files', path, 'headers']),
            linesBeforeHeadings: getState().org.present.getIn([
              'files',
              path,
              'linesBeforeHeadings',
            ]),
            dontIndent: getState().base.get('eliIndentOnExport') !== true,
          });
          client
            .updateFile(path, contents)
            .then(() => {
              if (quiet) {
                done({ kind: 'uploaded', path });
              } else if (!shouldSuppressMessages) {
                dispatch(setDisappearingLoadingMessage(successMessage, 2000));
              } else {
                setTimeout(() => dispatch(hideLoadingMessage()), 2000);
              }
              dispatch(setIsLoading(false, path));
              // ORG Mode para Eli (2.13): si se ha seguido escribiendo mientras se subía, el
              // fichero sigue pendiente (y se vuelve a subir); si no, queda al día
              const nowContents = exportOrg({
                headers: getState().org.present.getIn(['files', path, 'headers']),
                linesBeforeHeadings: getState().org.present.getIn([
                  'files',
                  path,
                  'linesBeforeHeadings',
                ]),
                dontIndent: getState().base.get('eliIndentOnExport') !== true,
              });
              dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
              if (nowContents !== contents) {
                dispatch(sync({ path, shouldSuppressMessages: true }));
                announceSaved(path);
                return;
              }
              dispatch(setDirty(false, path));
              // ORG Mode para Eli: avisar a las otras copias abiertas (pantalla dividida)
              announceSaved(path);
            })
            .catch((error) => {
              const err = `Error al subir el fichero ${path}: ${error.toString()}`;
              console.error(err);
              if (quiet) {
                done({ kind: 'error', path, text: err });
              } else {
                dispatch(setDisappearingLoadingMessage(err, 5000));
                dispatch(hideLoadingMessage());
              }
              dispatch(setIsLoading(false, path));
              // Re-enqueue the file to be synchronized again
              dispatch(sync({ path }));
            });
        } else {
          if (quiet) {
            done({ kind: 'nothing', path });
          } else if (!shouldSuppressMessages) {
            dispatch(setDisappearingLoadingMessage('Nada que sincronizar', 2000));
          } else {
            setTimeout(() => dispatch(hideLoadingMessage()), 2000);
          }
          dispatch(setIsLoading(false, path));
        }
      } else {
        if (isDirty && forceAction !== 'pull') {
          if (!quiet) dispatch(hideLoadingMessage());
          dispatch(setIsLoading(false, path));
          // ORG Mode para Eli: conflicto. Si las dos versiones son iguales no hay nada que
          // decidir; si no, se muestra el diálogo propio (qué fichero, cuál quedarse, diferencias)
          const localContents = exportOrg({
            headers: getState().org.present.getIn(['files', path, 'headers']),
            linesBeforeHeadings: getState().org.present.getIn([
              'files',
              path,
              'linesBeforeHeadings',
            ]),
            dontIndent: getState().base.get('eliIndentOnExport') !== true,
          });
          if (typeof contents === 'string' && sameContents(localContents, contents)) {
            dispatch(setDirty(false, path));
            dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
            done({ kind: 'nothing', path });
          } else {
            done({ kind: 'conflict', path });
            addConflict({
              path,
              mine: localContents,
              theirs: typeof contents === 'string' ? contents : '',
              lastServerModifiedAt,
              lastSyncAt,
            });
          }
        } else {
          dispatch(parseFile(path, contents));
          dispatch(setDirty(false, path));
          dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
          if (quiet) {
            done({ kind: 'downloaded', path });
          } else if (!shouldSuppressMessages) {
            dispatch(setDisappearingLoadingMessage(`Última versión descargada: ${path}`, 2000));
          } else {
            setTimeout(() => dispatch(hideLoadingMessage()), 2000);
          }
          dispatch(setIsLoading(false, path));
        }
      }
    })
    .catch((error) => {
      if (quiet) {
        done({
          kind: 'error',
          path,
          text: `No se pudo sincronizar ${path}${
            error && error.message ? `: ${error.message}` : ''
          }`,
        });
      } else {
        dispatch(hideLoadingMessage());
      }
      dispatch(setIsLoading(false, path));
      // ORG Mode para Eli: mostrar el motivo real (p. ej. frase de paso incorrecta)
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

export const openHeader = (headerId) => ({
  type: 'OPEN_HEADER',
  headerId,
});

export const toggleHeaderOpened = (headerId, closeSubheadersRecursively) => ({
  type: 'TOGGLE_HEADER_OPENED',
  headerId,
  closeSubheadersRecursively,
});

export const selectHeader = (headerId) => (dispatch) => {
  dispatch({ type: 'SELECT_HEADER', headerId });

  if (!!headerId) {
    dispatch(setSelectedTableCellId(null));
    dispatch(setSelectedListItemId(null));
  }
};

export const selectHeaderIndex = (headerIndex) => (dispatch) => {
  dispatch({ type: 'SELECT_HEADER_INDEX', headerIndex });
};

export const setPath = (path) => (dispatch) => {
  dispatch({
    type: 'SET_PATH',
    path,
  });
  dispatch({ type: ActionTypes.CLEAR_HISTORY });
};

export const selectHeaderAndOpenParents = (path, headerId, { widen = false } = {}) => (
  dispatch
) => {
  dispatch(setPath(path));
  // ORG Mode para Eli: desde la agenda o la lista de tareas se sale del modo narrow para que
  // el encabezado pulsado siempre se vea
  if (widen) dispatch(widenHeader());
  dispatch({ type: 'OPEN_PARENTS_OF_HEADER', headerId });
  // select header after the file is displayed to allow the header to scroll into view
  setTimeout(() => dispatch(selectHeader(headerId)), 0);
  // ORG Mode para Eli: centrar en pantalla el encabezado (se reintenta mientras se abre el
  // fichero y termina la animación del cajón)
  if (widen) centerHeaderInView(headerId);
};

// (3.47) Narrow → Wide: la cabecera que estaba reducida queda la primera arriba de la pantalla
// (justo bajo la barra de arriba), para no perderse en el fichero entero
export const scrollHeaderToTop = (headerId) => {
  if (typeof document === 'undefined' || !headerId) return;
  let tries = 0;
  const attempt = () => {
    tries++;
    const esc = window.CSS && window.CSS.escape ? window.CSS.escape(headerId) : headerId;
    const el = document.querySelector(`[data-header-id="${esc}"]`);
    if (el && el.scrollIntoView) {
      const bar = document.querySelector('.header-bar');
      const barBottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      el.style.scrollMarginTop = `${Math.round(barBottom) + 8}px`;
      el.scrollIntoView({ block: 'start' });
      // al pintar el fichero entero la página puede moverse: se repite
      if (tries < 4) setTimeout(attempt, 200);
      return;
    }
    if (tries < 15) setTimeout(attempt, 100);
  };
  setTimeout(attempt, 50);
};

export const widenHeaderToTop = () => (dispatch, getState) => {
  const path = getState().org.present.get('path');
  const id = getState().org.present.getIn(['files', path, 'narrowedHeaderId']);
  dispatch(widenHeader());
  scrollHeaderToTop(id);
};

export const centerHeaderInView = (headerId) => {
  if (typeof document === 'undefined' || !headerId) return;
  let tries = 0;
  const attempt = () => {
    tries++;
    const esc = window.CSS && window.CSS.escape ? window.CSS.escape(headerId) : headerId;
    const el = document.querySelector(`[data-header-id="${esc}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      // organice puede desplazar después al seleccionado: se vuelve a centrar
      if (tries < 3) setTimeout(attempt, 250);
      return;
    }
    if (tries < 20) setTimeout(attempt, 150);
  };
  setTimeout(attempt, 200);
};

/**
 * Action to advance the state, e.g. TODO -> DONE, of the header specified in headerId.
 *
 * @param {*} headerId headerId to advance, or null if you want the currently narrowed header.
 * @param {*} logIntoDrawer false to log state change into body, true to log into :LOGBOOK: drawer.
 */
export const advanceTodoState = (headerId, logIntoDrawer) => ({
  type: 'ADVANCE_TODO_STATE',
  headerId,
  logIntoDrawer,
  dirtying: true,
  timestamp: new Date(),
});

export const setTodoState = (headerId, newTodoState, logIntoDrawer) => ({
  type: 'SET_TODO_STATE',
  newTodoState,
  headerId,
  logIntoDrawer,
  dirtying: true,
  timestamp: new Date(),
});

// (3.02) con el candado de Documentos puesto no se entra en edición
export const enterEditMode = (editModeType) =>
  isDocLocked()
    ? { type: 'ELI_DOC_LOCKED', editModeType }
    : { type: 'ENTER_EDIT_MODE', editModeType };

export const exitEditMode = () => ({
  type: 'EXIT_EDIT_MODE',
});

export const updateHeaderTitle = (headerId, newRawTitle) => ({
  type: 'UPDATE_HEADER_TITLE',
  headerId,
  newRawTitle,
  dirtying: true,
});

export const updateHeaderDescription = (headerId, newRawDescription) => ({
  type: 'UPDATE_HEADER_DESCRIPTION',
  headerId,
  newRawDescription,
  dirtying: true,
});

export const addHeader = (headerId) => ({
  type: 'ADD_HEADER',
  headerId,
  // Performance optimization: Don't actually sync a whole Org file
  // for an empty header. When the user adds some data and triggers
  // UPDATE_HEADER_TITLE, then it makes sense to save it.
  dirtying: false,
});

export const duplicateHeader = (headerId) => ({
  type: 'DUPLICATE_HEADER',
  headerId,
  dirtying: true,
});

export const createFirstHeader = () => ({
  type: 'CREATE_FIRST_HEADER',
  dirtying: true,
});

export const selectNextSiblingHeader = (headerId) => ({
  type: 'SELECT_NEXT_SIBLING_HEADER',
  headerId,
});

export const addHeaderAndEdit = (headerId) => (dispatch) => {
  dispatch(addHeader(headerId));
  dispatch(selectNextSiblingHeader(headerId));
  dispatch(activatePopup('title-editor'));
};

// (4.0) «Nueva › Subcabecera»: hija nueva (al final de las suyas) y se edita su título
export const eliAddSubheaderAndEdit = (headerId) => (dispatch) => {
  dispatch({ type: 'ELI_ADD_SUBHEADER', headerId, dirtying: false });
  dispatch(activatePopup('title-editor'));
};

// (4.03) «Nueva» de la barra de abajo (arriba / debajo / subcabecera). (4.04) Sin hoja: la
// cabecera aparece en el documento con el título en edición en su sitio. Si al salir no tiene ni
// título ni notas, se borra sola (ver eliDropIfEmptyNewHeader).
let eliFreshHeaderId = null;
let eliFreshFromId = null;
export const eliGetFreshHeaderId = () => eliFreshHeaderId;
export const eliClearFreshHeader = () => {
  eliFreshHeaderId = null;
};
export const eliAddHeaderWithSheet = (headerId, where) => (dispatch, getState) => {
  if (where === 'sub') dispatch({ type: 'ELI_ADD_SUBHEADER', headerId, dirtying: false });
  else if (where === 'above') dispatch({ type: 'ELI_ADD_HEADER_ABOVE', headerId, dirtying: false });
  else {
    dispatch(addHeader(headerId));
    dispatch(selectNextSiblingHeader(headerId));
  }
  const present = getState().org.present;
  eliFreshHeaderId = present.getIn(['files', present.get('path'), 'selectedHeaderId']) || null;
  eliFreshFromId = headerId;
  dispatch(activatePopup('title-editor'));
};

// (4.04) Cabecera recién añadida con «Nueva» que se deja vacía: se quita sin dejar paso en
// deshacer (el reductor quita también el paso de «añadir», si es el último)
export const eliDropIfEmptyNewHeader = () => (dispatch, getState) => {
  const id = eliFreshHeaderId;
  if (!id) return;
  const present = getState().org.present;
  const headers = present.getIn(['files', present.get('path'), 'headers']);
  const header = headers && headers.find((h) => h.get('id') === id);
  eliFreshHeaderId = null;
  if (!header) return;
  const title = (header.getIn(['titleLine', 'rawTitle']) || '').trim();
  const desc = (header.get('rawDescription') || '').trim();
  const descParts = header.get('description');
  if (title || desc || (descParts && descParts.size)) return;
  dispatch({ type: 'ELI_DROP_NEW_HEADER', headerId: id, fromId: eliFreshFromId, dirtying: false });
};

export const selectNextVisibleHeader = (headerId) => ({
  type: 'SELECT_NEXT_VISIBLE_HEADER',
  headerId,
});

export const selectPreviousVisibleHeader = (headerId) => ({
  type: 'SELECT_PREVIOUS_VISIBLE_HEADER',
  headerId,
});

// (3.05) Herramientas › «Ordenar historial»: en el fichero abierto, las líneas «- State …»
// sueltas pasan al cajón :LOGBOOK: de su entrada (deshacible)
export const eliTidyStateLog = () => (dispatch, getState) => {
  const org = getState().org.present;
  const path = org.get('path');
  const headers = (path && org.getIn(['files', path, 'headers'])) || List();
  let moved = 0;
  let entries = 0;
  headers.forEach((h) => {
    const body = createRawDescriptionText(h, false, true);
    if (!/- State\s+"/.test(body)) return;
    const r = tidyStateLog(body);
    if (r.moved) {
      moved += r.moved;
      entries += 1;
    }
  });
  if (!moved) {
    dispatch(setDisappearingLoadingMessage('El historial ya está ordenado', 2500));
    return 0;
  }
  dispatch({ type: 'ELI_TIDY_STATE_LOG', dirtying: true });
  dispatch(
    setDisappearingLoadingMessage(
      `Historial ordenado: ${moved} línea${moved === 1 ? '' : 's'} en ${entries} entrada${
        entries === 1 ? '' : 's'
      } (se puede deshacer)`,
      3500
    )
  );
  return moved;
};

export const removeHeader = (headerId) => ({
  type: 'REMOVE_HEADER',
  headerId,
  dirtying: true,
});

export const moveHeaderUp = (headerId) => ({
  type: 'MOVE_HEADER_UP',
  headerId,
  dirtying: true,
});

export const moveHeaderDown = (headerId) => ({
  type: 'MOVE_HEADER_DOWN',
  headerId,
  dirtying: true,
});

// (4.04) arrastrar una cabecera (con sus subcabeceras) por su viñeta
export const eliDropSubtree = (headerId, { beforeId = null, afterId = null, level }) => ({
  type: 'ELI_DROP_SUBTREE',
  headerId,
  beforeId,
  afterId,
  level,
  dirtying: true,
});

export const moveHeaderToPosition = (sourceHeaderId, targetHeaderId, position) => ({
  type: 'MOVE_HEADER_TO_POSITION',
  sourceHeaderId,
  targetHeaderId,
  position,
  dirtying: true,
});

export const moveHeaderLeft = (headerId) => ({
  type: 'MOVE_HEADER_LEFT',
  headerId,
  dirtying: true,
});

export const moveHeaderRight = (headerId) => ({
  type: 'MOVE_HEADER_RIGHT',
  headerId,
  dirtying: true,
});

// ORG Mode para Eli: solo la línea del encabezado, sin sus subencabezados
export const eliMoveHeaderLine = (headerId, direction) => ({
  type: 'ELI_MOVE_HEADER_LINE',
  headerId,
  direction,
  dirtying: true,
});

export const moveSubtreeLeft = (headerId) => ({
  type: 'MOVE_SUBTREE_LEFT',
  headerId,
  dirtying: true,
});

export const moveSubtreeRight = (headerId) => ({
  type: 'MOVE_SUBTREE_RIGHT',
  headerId,
  dirtying: true,
});

export const refileSubtree = (sourcePath, sourceHeaderId, targetPath, targetHeaderId) => ({
  type: 'REFILE_SUBTREE',
  sourcePath,
  sourceHeaderId,
  targetPath,
  targetHeaderId,
  dirtying: true,
});

export const addNote = (inputText, currentDate) => ({
  type: 'HEADER_ADD_NOTE',
  inputText,
  currentDate,
  dirtying: true,
});

export const narrowHeader = (headerId) => ({
  type: 'NARROW_HEADER',
  headerId,
});

// ORG Mode para Eli: vista reducida a un encabezado.
// (3.04) Por defecto se abre «solo cabeceras»: se ven los títulos de los subencabezados (plegados)
// y no las notas; un toque en el título muestra las notas (como el ciclo de org-mode).
export const eliNarrowAndExpand = (headerId, { titlesOnly = true, hideBody = true } = {}) => (
  dispatch
) => {
  dispatch(narrowHeader(headerId));
  dispatch({ type: 'ELI_OPEN_SUBTREE', headerId, titlesOnly, hideBody });
};

// (3.04) mostrar (false) u ocultar (true) las notas de un encabezado abierto
export const eliSetHideBody = (headerId, hide) => ({ type: 'ELI_SET_HIDE_BODY', headerId, hide });

// ORG Mode para Eli (2.15): contraer (false) o expandir (true) todas las cabeceras
export const eliSetAllHeadersOpened = (opened) => ({ type: 'ELI_SET_ALL_OPENED', opened });

export const widenHeader = () => ({
  type: 'WIDEN_HEADER',
});

// (4.08) Editar en su sitio una cabecera que no está a la vista (plegada dentro de otra o fuera de
// la vista reducida): se despliega lo de encima (y se sale del narrow si hace falta) en vez de
// abrir la caja «Editar título»
export const eliRevealHeader = (headerId) => (dispatch, getState) => {
  if (!headerId) return;
  const present = getState().org.present;
  const file = present.getIn(['files', present.get('path')]);
  if (!file) return;
  const headers = file.get('headers');
  const narrowedId = file.get('narrowedHeaderId');
  if (narrowedId && narrowedId !== headerId) {
    let parent = parentIdOfHeaderWithId(headers, headerId);
    while (parent && parent !== narrowedId) parent = parentIdOfHeaderWithId(headers, parent);
    if (!parent) dispatch(widenHeader());
  }
  dispatch({ type: 'OPEN_PARENTS_OF_HEADER', headerId });
  centerHeaderInView(headerId);
};

// (4.09) Tareas con el reloj en marcha (en todos los ficheros cargados): [{ path, headerId, title }]
export const eliRunningClocks = () => (dispatch, getState) => {
  const out = [];
  const files = getState().org.present.get('files');
  if (!files) return out;
  files.forEach((f, path) => {
    if (!f || !f.get('activeClocks')) return;
    (f.get('headers') || List()).forEach((h) => {
      if (hasActiveClock(h)) {
        out.push({ path, headerId: h.get('id'), title: h.getIn(['titleLine', 'rawTitle']) || '' });
      }
    });
  });
  return out;
};

export const setOpennessState = (path, opennessState) => ({
  type: 'SET_OPENNESS_STATE',
  path,
  opennessState,
});

export const applyOpennessState = (path) => ({
  type: 'APPLY_OPENNESS_STATE',
  path,
});

export const dirtyAction = (isDirty, path) => ({
  type: 'SET_DIRTY',
  isDirty,
  path,
});

export const setDirty = (isDirty, path) => (dispatch, getState) => {
  // ORG Mode para Eli (2.12): al quedar al día (subido, o se eligió la versión del servidor),
  // la versión cifrada guardada con cambios pendientes ya no hace falta
  if (!isDirty && path && getState && getState().org.present.getIn(['files', path, 'isDirty'])) {
    cancelPendingEncryption(path);
    clearPendingLocalVersion(path);
  }
  persistIsDirty(isDirty, path);
  dispatch(dirtyAction(isDirty, path));
};

// ORG Mode para Eli (2.12): un fichero cifrado con cambios hechos sin conexión que no llegaron a
// subirse (la app se cerró): al abrirlo se recuperan esos cambios (guardados cifrados) y se
// marca como pendiente de subir. Al sincronizar se sube o, si en el servidor cambió mientras
// tanto, aparece el aviso de conflicto de siempre.
export const eliApplyPendingLocalVersion = (path) => async (dispatch) => {
  const pending = pendingLocalVersion(path);
  if (!pending) return false;
  let text;
  try {
    text = await decryptFile(path, pending.contents);
  } catch (e) {
    return false;
  }
  dispatch(parseFile(path, text));
  dispatch(setDirty(true, path));
  dispatch(setLastSyncAt(pending.baseSyncAt ? parseISO(pending.baseSyncAt) : new Date(0), path));
  dispatch(sync({ path, shouldSuppressMessages: true }));
  return true;
};

export const setSelectedDescriptionItemIndex = (itemIndex) => (dispatch) => {
  dispatch({ type: 'SET_SELECTED_DESCRIPTION_ITEM_INDEX', itemIndex });
};

export const setSelectedTableId = (tableId) => (dispatch) => {
  dispatch({ type: 'SET_SELECTED_TABLE_ID', tableId });
};

export const setSelectedTableCellId = (cellId) => (dispatch) => {
  dispatch({ type: 'SET_SELECTED_TABLE_CELL_ID', cellId });

  if (!!cellId) {
    dispatch(setSelectedListItemId(null));
  }
};

export const addNewTableRow = () => ({
  type: 'ADD_NEW_TABLE_ROW',
  dirtying: true,
});

export const removeTableRow = () => ({
  type: 'REMOVE_TABLE_ROW',
  dirtying: true,
});

export const addNewTableColumn = () => ({
  type: 'ADD_NEW_TABLE_COLUMN',
  dirtying: true,
});

export const removeTableColumn = () => ({
  type: 'REMOVE_TABLE_COLUMN',
  dirtying: true,
});

export const moveTableRowDown = () => ({
  type: 'MOVE_TABLE_ROW_DOWN',
  dirtying: true,
});

export const moveTableRowUp = () => ({
  type: 'MOVE_TABLE_ROW_UP',
  dirtying: true,
});

export const moveTableColumnLeft = () => ({
  type: 'MOVE_TABLE_COLUMN_LEFT',
  dirtying: true,
});

export const moveTableColumnRight = () => ({
  type: 'MOVE_TABLE_COLUMN_RIGHT',
  dirtying: true,
});

export const updateTableCellValue = (cellId, newValue) => ({
  type: 'UPDATE_TABLE_CELL_VALUE',
  cellId,
  newValue,
  dirtying: true,
});

// ORG Mode para Eli: si la ruta de encabezado de la plantilla no existe en el fichero, la captura
// se guarda igualmente (al principio o al final) y se avisa
const warnIfCaptureParentMissing = (getState, template, shouldPrepend) => {
  const paths = (template.get('headerPaths') || List()).filter((p) => String(p || '').trim());
  if (!paths.size) return;
  const targetPath = template.get('file') || getState().org.present.get('path');
  const headers = getState().org.present.getIn(['files', targetPath, 'headers']);
  if (headers && headerWithPath(headers, paths)) return;
  showMessage(
    'Captura guardada en otro sitio',
    `No existe el encabezado «${paths.join(' > ')}» en ${targetPath}, así que se ha guardado al ${
      shouldPrepend ? 'principio' : 'final'
    } del fichero.\n\nRevisa la ruta de encabezado de la plantilla «${template.get(
      'description'
    )}» en Ajustes → Plantillas de captura.`
  );
};

const captureTargetNeedsLoading = (getState, template) => {
  const file = template && template.get('file');
  return !!file && !getState().org.present.getIn(['files', file, 'headers']);
};

export const insertCapture = (templateId, content, shouldPrepend) => (dispatch, getState) => {
  dispatch(closePopup());

  const template = getState()
    .capture.get('captureTemplates')
    .concat(sampleCaptureTemplates)
    .find((template) => template.get('id') === templateId);
  const doInsert = () => {
    warnIfCaptureParentMissing(getState, template, shouldPrepend);
    dispatch({ type: 'INSERT_CAPTURE', template, content, shouldPrepend, dirtying: true });
  };
  // ORG Mode para Eli: si el fichero destino de la plantilla aún no está cargado, se carga antes
  // (antes la primera captura se perdía y la segunda sí funcionaba)
  if (captureTargetNeedsLoading(getState, template)) {
    return dispatch(loadFileQuietly(template.get('file'))).then(doInsert);
  }
  doInsert();
};

export const insertCaptureFromHeader = (templateId, header, shouldPrepend) => (
  dispatch,
  getState
) => {
  dispatch(closePopup());

  const template = getState()
    .capture.get('captureTemplates')
    .concat(sampleCaptureTemplates)
    .find((template) => template.get('id') === templateId);
  const targetPath = template.get('file') || getState().org.present.get('path');
  const doInsert = () => {
    warnIfCaptureParentMissing(getState, template, shouldPrepend);
    dispatch({
      type: 'INSERT_CAPTURE_FROM_HEADER',
      template,
      header,
      shouldPrepend,
      dirtying: true,
    });
    dispatch(sync({ successMessage: 'Elemento capturado', path: targetPath }));
  };
  if (captureTargetNeedsLoading(getState, template)) {
    return dispatch(loadFileQuietly(targetPath)).then(doInsert);
  }
  doInsert();
};

export const clearPendingCapture = () => ({
  type: 'CLEAR_PENDING_CAPTURE',
});

export const insertPendingCapture = () => async (dispatch, getState) => {
  const path = getState().org.present.get('path');
  const pendingCapture = getState().org.present.get('pendingCapture');
  const templateName = pendingCapture.get('captureTemplateName');
  const captureContent = pendingCapture.get('captureContent');
  const customCaptureVariables = pendingCapture.get('customCaptureVariables');

  dispatch(clearPendingCapture());
  // 3.30: replaceState conservando el estado del router (pushState a mano descuadraba las flechas)
  window.history.replaceState(window.history.state, '', window.location.pathname);

  const template = getState()
    .capture.get('captureTemplates')
    .filter(
      (template) =>
        template.get('isAvailableInAllOrgFiles') ||
        template.get('orgFilesWhereAvailable').includes(getState().org.present.get('path'))
    )
    .find((template) => template.get('description').trim() === templateName.trim());
  if (!template) {
    dispatch(
      setDisappearingLoadingMessage(
        `Error al capturar: la plantilla «${templateName}» no existe o no está disponible en este fichero`,
        8000
      )
    );
    return;
  }

  const targetPath = template.get('file') || path;
  if (captureTargetNeedsLoading(getState, template)) {
    await dispatch(loadFileQuietly(targetPath));
  }

  const headerPaths = template.get('headerPaths').filter((p) => String(p || '').trim());
  const targetHeaders = getState().org.present.getIn(['files', targetPath, 'headers']);
  const targetHeader = targetHeaders && headerWithPath(targetHeaders, headerPaths);
  if (headerPaths.size > 0 && !targetHeader) {
    dispatch(
      setDisappearingLoadingMessage(
        `Error al capturar: ruta de encabezado de «${template.get(
          'description'
        )}» no válida en ${targetPath}`,
        8000
      )
    );
    return;
  }

  const [substitutedTemplate, initialCursorIndex] = substituteTemplateVariables(
    template.get('template'),
    customCaptureVariables
  );

  const content = !!initialCursorIndex
    ? `${substitutedTemplate.substring(
        0,
        initialCursorIndex
      )}${captureContent}${substitutedTemplate.substring(initialCursorIndex)}`
    : `${substitutedTemplate}${captureContent}`;

  await dispatch(insertCapture(template.get('id'), content, template.get('shouldPrepend')));
  dispatch(sync({ successMessage: 'Elemento capturado', path: targetPath }));
};

export const advanceCheckboxState = (listItemId) =>
  isDocLocked()
    ? { type: 'ELI_DOC_LOCKED' }
    : {
        type: 'ADVANCE_CHECKBOX_STATE',
        listItemId,
        dirtying: true,
      };

export const setSelectedListItemId = (listItemId) => (dispatch) => {
  dispatch({ type: 'SET_SELECTED_LIST_ITEM_ID', listItemId });

  if (!!listItemId) {
    dispatch(selectHeader(null));
    dispatch(setSelectedTableCellId(null));
  }
};

export const updateListTitleValue = (listItemId, newValue) => ({
  type: 'UPDATE_LIST_TITLE_VALUE',
  listItemId,
  newValue,
  dirtying: true,
});

export const updateListContentsValue = (listItemId, newValue) => ({
  type: 'UPDATE_LIST_CONTENTS_VALUE',
  listItemId,
  newValue,
  dirtying: true,
});

export const addNewListItem = () => ({
  type: 'ADD_NEW_LIST_ITEM',
  dirtying: true,
});

export const selectNextSiblingListItem = () => ({
  type: 'SELECT_NEXT_SIBLING_LIST_ITEM',
});

export const addNewListItemAndEdit = () => (dispatch) => {
  dispatch(addNewListItem());
  dispatch(selectNextSiblingListItem());
  dispatch(enterEditMode('list-title'));
};

export const removeListItem = () => ({
  type: 'REMOVE_LIST_ITEM',
  dirtying: true,
});

export const moveListItemUp = () => ({
  type: 'MOVE_LIST_ITEM_UP',
  dirtying: true,
});

export const moveListItemDown = () => ({
  type: 'MOVE_LIST_ITEM_DOWN',
  dirtying: true,
});

export const moveListItemLeft = () => ({
  type: 'MOVE_LIST_ITEM_LEFT',
  dirtying: true,
});

export const moveListItemRight = () => ({
  type: 'MOVE_LIST_ITEM_RIGHT',
  dirtying: true,
});

export const moveListSubtreeLeft = () => ({
  type: 'MOVE_LIST_SUBTREE_LEFT',
  dirtying: true,
});

export const moveListSubtreeRight = () => ({
  type: 'MOVE_LIST_SUBTREE_RIGHT',
  dirtying: true,
});

export const setHeaderTags = (headerId, tags) => ({
  type: 'SET_HEADER_TAGS',
  headerId,
  tags,
  dirtying: true,
});

export const reorderTags = (fromIndex, toIndex) => ({
  type: 'REORDER_TAGS',
  fromIndex,
  toIndex,
  dirtying: true,
});

export const reorderPropertyList = (fromIndex, toIndex) => (dispatch, getState) =>
  dispatch({
    type: 'REORDER_PROPERTY_LIST',
    fromIndex,
    toIndex,
    headerId: getState().base.getIn(['activePopup', 'data', 'headerId']),
    dirtying: true,
  });

/**
 * Action to change the timestamp using a cross-cutting id.
 *
 * @param {*} timestampId cross-cutting id of the timestamp (might be in the title or description).
 * @param {*} newTimestamp the new value for the timestamp;
 *                         must have the form: {id:, type:, firstTimestamp:, secondTimestamp:}.
 */
export const updateTimestampWithId = (timestampId, newTimestamp) => ({
  type: 'UPDATE_TIMESTAMP_WITH_ID',
  timestampId,
  newTimestamp,
  dirtying: true,
});

export const updatePlanningItemTimestamp = (headerId, planningItemIndex, newTimestamp) => ({
  type: 'UPDATE_PLANNING_ITEM_TIMESTAMP',
  headerId,
  planningItemIndex,
  newTimestamp,
  dirtying: true,
});

export const addNewPlanningItem = (headerId, planningType) => ({
  type: 'ADD_NEW_PLANNING_ITEM',
  headerId,
  planningType,
  dirtying: true,
  timestamp: new Date(),
});

export const removePlanningItem = (headerId, planningItemIndex) => ({
  type: 'REMOVE_PLANNING_ITEM',
  headerId,
  planningItemIndex,
  dirtying: true,
});

export const removeTimestamp = (headerId, timestampId) => ({
  type: 'REMOVE_TIMESTAMP',
  headerId,
  timestampId,
  dirtying: true,
});

export const updatePropertyListItems = (headerId, newPropertyListItems) => ({
  type: 'UPDATE_PROPERTY_LIST_ITEMS',
  headerId,
  newPropertyListItems,
  dirtying: true,
});

// ORG Mode para Eli (2.15): con `path`, el error es de ESE fichero (solo se ve en su hoja); sin
// él, es general (como antes)
export const setOrgFileErrorMessage = (message, path = null) => ({
  type: 'SET_ORG_FILE_ERROR_MESSAGE',
  message,
  path,
});

export const setLogEntryStop = (headerId, entryId, time) => ({
  type: 'SET_LOG_ENTRY_STOP',
  headerId,
  entryId,
  time,
  dirtying: true,
});

export const createLogEntryStart = (headerId, time) => ({
  type: 'CREATE_LOG_ENTRY_START',
  headerId,
  time,
  dirtying: true,
});

export const deleteLogEntry = (headerId, entryId) => ({
  type: 'DELETE_LOG_ENTRY',
  headerId,
  entryId,
  dirtying: true,
});

export const updateLogEntryTime = (headerId, entryIndex, entryType, newTime) => ({
  type: 'UPDATE_LOG_ENTRY_TIME',
  headerId,
  entryIndex,
  entryType,
  newTime,
  dirtying: true,
});

export const setSearchFilterInformation = (
  searchFilter,
  cursorPosition,
  context,
  scope,
  onlyCurrentFile,
  includeArchived
) => ({
  type: 'SET_SEARCH_FILTER_INFORMATION',
  searchFilter,
  cursorPosition,
  context,
  scope,
  onlyCurrentFile,
  includeArchived,
});

export const setShowClockDisplay = (showClockDisplay) => ({
  type: 'TOGGLE_CLOCK_DISPLAY',
  showClockDisplay,
});

export const updateFileSettingFieldPathValue = (settingId, fieldPath, newValue) => ({
  type: 'UPDATE_FILE_SETTING_FIELD_PATH_VALUE',
  settingId,
  fieldPath,
  newValue,
});

export const reorderFileSetting = (fromIndex, toIndex) => ({
  type: 'REORDER_FILE_SETTING',
  fromIndex,
  toIndex,
});

export const deleteFileSetting = (settingId) => ({
  type: 'DELETE_FILE_SETTING',
  settingId,
});

export const eliAddAllFileSettings = (paths) => ({ type: 'ELI_ADD_ALL_FILE_SETTINGS', paths });

// ORG Mode para Eli: modo «todos los ficheros .org»: al abrir la app, al volver a ella (como mucho
// cada 5 minutos) y al crear un fichero, se buscan los .org de la carpeta y subcarpetas y se
// incluyen todos (agenda, búsqueda, lista de tareas y refile). Los que ya no existen se quitan.
let eliLastOrgScan = 0;
export const eliRefreshAllOrgFiles = ({ force = false } = {}) => async (dispatch, getState) => {
  if (!getState().base.get('eliAllOrgFiles')) return null;
  const client = getState().syncBackend.get('client');
  if (!client || !client.listOrgFiles) return null;
  if (!force && Date.now() - eliLastOrgScan < 5 * 60 * 1000) return null;
  eliLastOrgScan = Date.now();
  let paths = null;
  try {
    paths = await client.listOrgFiles();
  } catch (e) {
    return null;
  }
  if (!paths || !paths.length || !getState().base.get('eliAllOrgFiles')) return null;
  // (4.12) sin los de las carpetas excluidas (si ya estaban, se quitan con «prune»)
  paths = withoutExcluded(paths, parseExcludedFolders(getState().base.get('eliExcludedFolders')));
  dispatch({ type: 'ELI_ADD_ALL_FILE_SETTINGS', paths, prune: true });
  return paths;
};

export const addNewEmptyFileSetting = () => (dispatch) =>
  dispatch({ type: 'ADD_NEW_EMPTY_FILE_SETTING' });

export const restoreFileSettings = (newSettings) => ({
  type: 'RESTORE_FILE_SETTINGS',
  newSettings,
});

export const saveBookmark = (context, bookmark) => ({
  type: 'SAVE_BOOKMARK',
  context,
  bookmark,
});

export const deleteBookmark = (context, bookmark) => ({
  type: 'DELETE_BOOKMARK',
  context,
  bookmark,
});

export const addNewFile = (path, content) => ({
  type: 'ADD_NEW_FILE',
  path,
  content,
});

// ORG Mode para Eli: filtro por contextos GTD
export const toggleContextFilter = (context) => ({ type: 'TOGGLE_CONTEXT_FILTER', context });
export const clearContextFilter = () => ({ type: 'TOGGLE_CONTEXT_FILTER', clear: true });

// ORG Mode para Eli: org-crypt (cabeceras :crypt:)
const exportCurrentFile = (getState) => {
  const state = getState();
  const path = state.org.present.get('path');
  const file = state.org.present.getIn(['files', path]);
  return {
    path,
    text: exportOrg({
      headers: file.get('headers'),
      linesBeforeHeadings: file.get('linesBeforeHeadings'),
      dontIndent: state.base.get('eliIndentOnExport') !== true,
    }),
  };
};

export const decryptCryptHeader = (headerId) => async (dispatch, getState) => {
  const { path, text } = exportCurrentFile(getState);
  const headers = getState().org.present.getIn(['files', path, 'headers']);
  const header = headers.find((h) => h.get('id') === headerId);
  const title = header.getIn(['titleLine', 'rawTitle']);
  try {
    const newText = await decryptCryptEntryInText(text, header.get('rawDescription'));
    dispatch(parseFile(path, newText));
    // Volver a abrir y seleccionar la cabecera descifrada (los ids cambian al re-analizar)
    const reparsed = getState().org.present.getIn(['files', path, 'headers']);
    const again = reparsed.find(
      (h) =>
        h.getIn(['titleLine', 'rawTitle']) === title &&
        (h.getIn(['titleLine', 'tags']) || List()).includes('crypt')
    );
    if (again) dispatch(selectHeaderAndOpenParents(path, again.get('id')));
    if (again) dispatch(openHeader(again.get('id')));
  } catch (e) {
    if (e && e.message !== 'Cancelado por el usuario') {
      showMessage('No se pudo descifrar', e.message || String(e));
    }
  }
};

export const encryptCryptHeaders = () => async (dispatch, getState) => {
  const { path, text } = exportCurrentFile(getState);
  try {
    const newText = await encryptCryptEntries(text);
    dispatch(parseFile(path, newText));
  } catch (e) {
    if (e && e.message !== 'Cancelado por el usuario') {
      showMessage('No se pudo cifrar', e.message || String(e));
    }
  }
};

// ORG Mode para Eli: adjuntar imágenes / multimedia (se suben a assets/AAAA junto al .org)
export const attachAssetsToHeader = (headerId, files) => async (dispatch, getState) => {
  const state = getState();
  const client = state.syncBackend.get('client');
  const path = state.org.present.get('path');
  if (!files || !files.length || !path || path.startsWith(STATIC_FILE_PREFIX)) return;
  if (
    isEncryptedPath(path) &&
    // eslint-disable-next-line no-restricted-globals
    !window.confirm(
      'Este fichero está cifrado, pero los archivos adjuntos se guardarán SIN cifrar en ' +
        'Dropbox (carpeta assets). ¿Continuar?'
    )
  ) {
    return;
  }
  dispatch(
    setLoadingMessage(`Subiendo ${files.length} archivo(s) a assets/${new Date().getFullYear()}…`)
  );
  try {
    const links = await uploadAssets(client, path, Array.from(files));
    dispatch(appendLinesToHeader(headerId, links));
    dispatch(setDisappearingLoadingMessage(`Adjuntado: ${links.join(' ')}`, 3000));
  } catch (e) {
    dispatch(hideLoadingMessage());
    showMessage('No se pudo subir', (e && (e.message || e.error_summary)) || String(e));
  }
};

// ORG Mode para Eli: filtro por estado y ficheros principales
export const toggleTodoFilter = (keyword) => ({ type: 'TOGGLE_TODO_FILTER', keyword });
export const clearTodoFilter = () => ({ type: 'TOGGLE_TODO_FILTER', clear: true });
export const moveEliFavoriteFile = (path, delta) => ({
  type: 'MOVE_ELI_FAVORITE_FILE',
  path,
  delta,
});
export const toggleEliFavoriteFile = (path, value) => ({
  type: 'TOGGLE_ELI_FAVORITE_FILE',
  path,
  value,
});

// ORG Mode para Eli: añade líneas al final del cuerpo de un encabezado
export const appendLinesToHeader = (headerId, lines) => (dispatch, getState) => {
  const path = getState().org.present.get('path');
  const headers = getState().org.present.getIn(['files', path, 'headers']);
  const header = headers && headers.find((h) => h.get('id') === headerId);
  if (!header) return;
  const raw = header.get('rawDescription') || '';
  const newRaw = (raw && !raw.endsWith('\n') ? raw + '\n' : raw) + lines.join('\n') + '\n';
  dispatch(
    updateHeaderDescription(
      headerId,
      createRawDescriptionText(
        header.set('rawDescription', newRaw),
        false,
        getState().base.get('eliIndentOnExport') !== true
      )
    )
  );
  dispatch(openHeader(headerId));
};

// ORG Mode para Eli: fecha inactiva de hoy, p. ej. [2026-09-23 Wed]
export const insertInactiveDate = (headerId) => (dispatch) => {
  dispatch(appendLinesToHeader(headerId, [getCurrentTimestampAsText({ isActive: false })]));
  dispatch(
    setDisappearingLoadingMessage(`Añadido ${getCurrentTimestampAsText({ isActive: false })}`, 1500)
  );
};

// Sube ficheros ya preparados (p. ej. imágenes redimensionadas) y devuelve los enlaces Org
export const uploadFilesAndGetLinks = (files, orgPath = null) => async (dispatch, getState) => {
  const state = getState();
  const client = state.syncBackend.get('client');
  const path = orgPath || state.org.present.get('path');
  dispatch(
    setLoadingMessage(`Subiendo ${files.length} archivo(s) a assets/${new Date().getFullYear()}…`)
  );
  try {
    const links = await uploadAssets(client, path, files);
    dispatch(setDisappearingLoadingMessage(`Adjuntado: ${links.join(' ')}`, 3000));
    return links;
  } catch (e) {
    dispatch(hideLoadingMessage());
    showMessage('No se pudo subir', (e && (e.message || e.error_summary)) || String(e));
    return [];
  }
};

// ORG Mode para Eli: marcar/desmarcar prioridad [#A]
export const togglePriorityA = (headerId) => (dispatch, getState) => {
  const path = getState().org.present.get('path');
  const headers = getState().org.present.getIn(['files', path, 'headers']);
  const header = headers && headers.find((h) => h.get('id') === headerId);
  if (!header) return;
  dispatch(updateHeaderTitle(headerId, toggledPriorityATitle(header)));
};

// ORG Mode para Eli: archivar el encabezado (y sus subencabezados) como org-archive-subtree
const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);

// (2.16) Si el fichero de archivo está leído en la app (p. ej. con «Archivadas»), se pone al día
// con lo que se acaba de guardar y se marca como sincronizado (sin conflictos falsos después)
const refreshLoadedArchive = (dispatch, getState, archivePath, text) => {
  if (!getState().org.present.getIn(['files', archivePath])) return;
  dispatch(parseFile(archivePath, text));
  dispatch(setLastSyncAt(new Date(Date.now() + 5000), archivePath));
  dispatch(setDirty(false, archivePath));
};
// Con cambios sin subir en ese fichero de archivo, no se archiva encima (se perderían)
const archiveHasLocalChanges = (getState, archivePath) =>
  !!getState().org.present.getIn(['files', archivePath, 'isDirty']);

export const archiveSubtree = (headerId, explicitPath = null) => async (dispatch, getState) => {
  const state = getState();
  // ORG Mode para Eli: desde la vista GTD se archiva una tarea de otro fichero
  const path = explicitPath || state.org.present.get('path');
  const file = state.org.present.getIn(['files', path]);
  const client = state.syncBackend.get('client');
  if (!file || !path || path.startsWith(STATIC_FILE_PREFIX) || !client) return;
  const headers = file.get('headers');
  const index = headers.findIndex((h) => h.get('id') === headerId);
  if (index < 0) return;
  const root = headers.get(index);
  const subCount = subheadersOfHeaderWithIdForArchive(headers, headerId);
  const { path: archivePath, heading } = resolveArchiveLocation(
    archiveLocationFor(file, headers, index, eliDefaultArchiveLocation(getState)),
    path
  );
  if (archivePath === path) {
    showMessage(
      'No disponible',
      'Archivar dentro del mismo fichero (#+ARCHIVE: ::encabezado) aún no está soportado.'
    );
    return;
  }
  const title = root.getIn(['titleLine', 'rawTitle']).trim();
  const ok = await askConfirm({
    title: 'Archivar',
    message:
      `¿Archivar «${title}»` +
      (subCount ? ` y sus ${subCount} subencabezado(s)` : '') +
      `?\n\nSe moverá a ${archivePath}${
        heading ? ` (bajo «${heading}»)` : ''
      } y desaparecerá de este fichero.`,
    okLabel: 'Archivar',
  });
  if (!ok) return;
  if (!getState().base.get('online')) {
    showMessage('Sin conexión', 'Para archivar hace falta conexión con Dropbox.');
    return;
  }
  if (archiveHasLocalChanges(getState, archivePath)) {
    dispatch(sync({ path: archivePath }));
    showMessage(
      'Archivar',
      `${archivePath} tiene cambios que aún no se han guardado. Se están guardando: vuelve a archivar en unos segundos.`
    );
    return;
  }
  dispatch(setLoadingMessage('Archivando…'));
  try {
    const subtreeText = buildArchivedSubtree({
      file,
      headers,
      headerId,
      sourcePath: path,
      targetLevel: targetLevelFor(heading),
      dontIndent: getState().base.get('eliIndentOnExport') !== true,
    });
    let existing = null;
    const exists = client.pathExists
      ? await withTimeout(client.pathExists(archivePath), 20000, 'Dropbox no responde')
      : false;
    if (exists) {
      existing = await withTimeout(
        client.getFileContents(archivePath),
        30000,
        'Dropbox no responde al leer el archivo'
      );
    }
    const base = existing == null ? newArchiveFileText(path) : existing;
    inheritEncryptionMeta(archivePath, path);
    const newText = insertIntoArchiveText(base, subtreeText, heading);
    await withTimeout(
      client.createFile(archivePath, newText),
      30000,
      'Dropbox no responde al guardar'
    );
    refreshLoadedArchive(dispatch, getState, archivePath, newText);
    if (path === getState().org.present.get('path')) {
      dispatch(removeHeader(headerId));
    } else {
      dispatch({
        type: 'ELI_IN_FILE',
        path,
        inner: { type: 'REMOVE_HEADER', headerId, dirtying: true },
        dirtying: true,
      });
      dispatch(setDirty(true, path));
    }
    dispatch(sync({ path, shouldSuppressMessages: true }));
    dispatch(setDisappearingLoadingMessage(`Archivado en ${archivePath}`, 3000));
  } catch (e) {
    dispatch(hideLoadingMessage());
    showMessage('No se pudo archivar', (e && (e.message || e.error_summary)) || String(e));
  }
};

// ORG Mode para Eli: archivar de una vez varias tareas (vista GTD → Logbook → «Archivar»).
// items: [{ path, id }]. Una sola confirmación (la hace quien llama) y una sola escritura por
// fichero de archivo. Cada tarea se archiva como org-archive-subtree (con sus subencabezados).
// Devuelve { archived, skipped }.
export const eliArchiveMany = (items) => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  if (!client || !items || !items.length) return { archived: 0, skipped: 0 };
  if (!getState().base.get('online')) {
    showMessage('Sin conexión', 'Para archivar hace falta conexión con Dropbox.');
    return { archived: 0, skipped: items.length };
  }
  const byPath = {};
  items.forEach(({ path, id }) => {
    if (!path || path.startsWith(STATIC_FILE_PREFIX)) return;
    (byPath[path] = byPath[path] || []).push(id);
  });
  let archived = 0;
  let skipped = 0;
  const total = items.length;
  try {
    for (const path of Object.keys(byPath)) {
      const file = getState().org.present.getIn(['files', path]);
      if (!file || !file.get('headers')) {
        skipped += byPath[path].length;
        continue;
      }
      const headers = file.get('headers');
      const wanted = new Set(byPath[path]);
      // Si también se archiva un antepasado, esta tarea ya va con él
      const roots = [];
      const stack = [];
      headers.forEach((h, index) => {
        const level = h.get('nestingLevel');
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        const coveredByAncestor = stack.some((s) => s.wanted);
        const isWanted = wanted.has(h.get('id'));
        if (isWanted && !coveredByAncestor) roots.push({ id: h.get('id'), index });
        stack.push({ level, wanted: isWanted || coveredByAncestor });
      });
      // Agrupar por destino (según #+ARCHIVE: o la propiedad ARCHIVE)
      const groups = {};
      roots.forEach((r) => {
        const { path: archivePath, heading } = resolveArchiveLocation(
          archiveLocationFor(file, headers, r.index, eliDefaultArchiveLocation(getState)),
          path
        );
        if (archivePath === path) {
          skipped++;
          return;
        }
        const key = `${archivePath}\u0000${heading || ''}`;
        (groups[key] = groups[key] || { archivePath, heading, ids: [] }).ids.push(r.id);
      });
      const removed = [];
      for (const key of Object.keys(groups)) {
        const { archivePath, heading, ids } = groups[key];
        // (2.16) fichero de archivo con cambios sin subir: se sube y ese grupo se deja
        if (archiveHasLocalChanges(getState, archivePath)) {
          dispatch(sync({ path: archivePath }));
          continue;
        }
        dispatch(
          setLoadingMessage(`Archivando ${archived + 1}–${archived + ids.length} de ${total}…`)
        );
        let existing = null;
        const exists = client.pathExists
          ? await withTimeout(client.pathExists(archivePath), 20000, 'Dropbox no responde')
          : false;
        if (exists) {
          existing = await withTimeout(
            client.getFileContents(archivePath),
            30000,
            'Dropbox no responde al leer el archivo'
          );
        }
        let text = existing == null ? newArchiveFileText(path) : existing;
        inheritEncryptionMeta(archivePath, path);
        ids.forEach((headerId) => {
          const subtreeText = buildArchivedSubtree({
            file,
            headers,
            headerId,
            sourcePath: path,
            targetLevel: targetLevelFor(heading),
            dontIndent: getState().base.get('eliIndentOnExport') !== true,
          });
          text = insertIntoArchiveText(text, subtreeText, heading);
        });
        await withTimeout(
          client.createFile(archivePath, text),
          30000,
          'Dropbox no responde al guardar'
        );
        refreshLoadedArchive(dispatch, getState, archivePath, text);
        removed.push(...ids);
        archived += ids.length;
      }
      // Quitar del fichero de origen solo lo que ya está guardado en el archivo
      if (removed.length) {
        dispatch({
          type: 'ELI_IN_FILE',
          path,
          inner: removed.map((headerId) => ({ type: 'REMOVE_HEADER', headerId, dirtying: true })),
          dirtying: true,
        });
        dispatch(setDirty(true, path));
        dispatch(sync({ path, shouldSuppressMessages: true }));
      }
    }
    dispatch(
      setDisappearingLoadingMessage(
        archived === 1 ? 'Archivada 1 tarea' : `Archivadas ${archived} tareas`,
        3000
      )
    );
  } catch (e) {
    dispatch(hideLoadingMessage());
    showMessage(
      'No se pudo archivar todo',
      `Archivadas: ${archived}.\n\n` + ((e && (e.message || e.error_summary)) || String(e))
    );
  }
  return { archived, skipped };
};

const subheadersOfHeaderWithIdForArchive = (headers, headerId) => {
  const index = headers.findIndex((h) => h.get('id') === headerId);
  const level = headers.getIn([index, 'nestingLevel']);
  let n = 0;
  for (let i = index + 1; i < headers.size && headers.getIn([i, 'nestingLevel']) > level; i++) n++;
  return n;
};

// ORG Mode para Eli: refile del encabezado seleccionado al nivel superior de un fichero
// (al final, nivel 1). Si el fichero no está cargado, se descarga antes.
export const refileToFileTop = (targetPath) => async (dispatch, getState) => {
  const present = getState().org.present;
  const sourcePath = present.get('path');
  const headerId = present.getIn(['files', sourcePath, 'selectedHeaderId']);
  if (!sourcePath || !headerId || !targetPath) return;
  const client = getState().syncBackend.get('client');
  try {
    if (!getState().org.present.getIn(['files', targetPath, 'headers'])) {
      dispatch(setLoadingMessage(`Abriendo ${targetPath}…`));
      const contents = await withTimeout(
        client.getFileContents(targetPath),
        30000,
        'Dropbox no responde'
      );
      dispatch(parseFile(targetPath, contents));
      dispatch(setLastSyncAt(addSeconds(new Date(), 5), targetPath));
      dispatch(setDirty(false, targetPath));
      dispatch(hideLoadingMessage());
    }
    dispatch(selectHeader(null));
    dispatch(refileSubtree(sourcePath, headerId, targetPath, null));
    if (targetPath !== sourcePath) {
      dispatch(sync({ path: targetPath, shouldSuppressMessages: true }));
    }
    dispatch(sync({ path: sourcePath, shouldSuppressMessages: true }));
    dispatch(
      setDisappearingLoadingMessage(
        `Movido a ${targetPath.split('/').pop()} (nivel superior)`,
        2500
      )
    );
  } catch (e) {
    dispatch(hideLoadingMessage());
    showMessage('No se pudo mover', (e && (e.eliMessage || e.message)) || String(e));
  }
};

// ORG Mode para Eli: tras borrar un encabezado, preguntar uno a uno por sus adjuntos.
// `headers` son los del fichero antes de quitar el encabezado.
export const eliOfferDeleteAttachments = (headers, headerId, path) => (dispatch, getState) => {
  const state = getState();
  const orgFilePath = path || state.org.present.get('path');
  if (!orgFilePath || orgFilePath.startsWith(STATIC_FILE_PREFIX)) return Promise.resolve([]);
  return offerToDeleteAttachments({
    headers,
    headerId,
    orgFilePath,
    client: state.syncBackend.get('client'),
    files: state.org.present.get('files'),
  });
};

// ORG Mode para Eli: borrar adjuntos desde un encabezado (menú ⋯ → «Borrar adjuntos…»): se elige
// el adjunto, se borra el archivo (con confirmación) y se quita su enlace del encabezado.
export const eliDeleteHeaderAttachments = (headerId, orgPath = null) => async (
  dispatch,
  getState
) => {
  const path = orgPath || getState().org.present.get('path');
  if (!path || path.startsWith(STATIC_FILE_PREFIX)) return;
  const headerOf = () =>
    (getState().org.present.getIn(['files', path, 'headers']) || List()).find(
      (h) => h.get('id') === headerId
    );
  for (;;) {
    const header = headerOf();
    const list = attachmentsOfHeader(header, path);
    if (!list.length) {
      showMessage('Adjuntos', 'Este encabezado no tiene archivos adjuntos.');
      return;
    }
    const chosen = await chooseAttachmentToDelete(list);
    if (!chosen) return;
    const result = await confirmAndDeleteAttachment({
      client: getState().syncBackend.get('client'),
      files: getState().org.present.get('files'),
      orgFilePath: path,
      path: chosen.path,
      excludedIds: new Set([headerId]),
    });
    if (!result) continue;
    if (!headerOf()) return;
    removeAttachmentLinkInState(dispatch, getState, path, headerId, chosen.target);
    dispatch(sync({ path, shouldSuppressMessages: true }));
    if (attachmentsOfHeader(headerOf(), path).length === 0) return;
  }
};

// Quita del cuerpo de un encabezado (fichero cargado) los enlaces a un adjunto
const removeAttachmentLinkInState = (dispatch, getState, path, headerId, target) => {
  const h = (getState().org.present.getIn(['files', path, 'headers']) || List()).find(
    (x) => x.get('id') === headerId
  );
  if (!h) return false;
  // ORG Mode para Eli (2.13): también en el título
  const oldTitle = generateTitleLine(h.toJS(), false);
  const newTitle = removeLinksToTarget(oldTitle, target, { keepLines: true });
  if (newTitle !== oldTitle) {
    dispatch({
      type: 'ELI_IN_FILE',
      path,
      dirtying: true,
      inner: { type: 'UPDATE_HEADER_TITLE', headerId, newRawTitle: newTitle, dirtying: true },
    });
  }
  const oldRaw = h.get('rawDescription') || '';
  const newRaw = removeLinksToTarget(oldRaw, target);
  if (newRaw === oldRaw) {
    if (newTitle !== oldTitle) dispatch(setDirty(true, path));
    return newTitle !== oldTitle;
  }
  dispatch({
    type: 'ELI_IN_FILE',
    path,
    dirtying: true,
    inner: {
      type: 'UPDATE_HEADER_DESCRIPTION',
      headerId,
      newRawDescription: createRawDescriptionText(
        h.set('rawDescription', newRaw),
        false,
        getState().base.get('eliIndentOnExport') !== true
      ),
      dirtying: true,
    },
  });
  dispatch(setDirty(true, path));
  return true;
};

// ORG Mode para Eli (4.24): al borrar un encabezado con enlaces [[id:…]] que apuntan a él, dejar
// esos enlaces como texto (título y notas). Una propiedad que es SOLO ese enlace (p. ej.
// :PROYECTO: [[id:…][Nombre]]) se quita: como texto ya no significaría nada.
export const eliIdLinksToText = (refs, ids) => (dispatch, getState) => {
  const touched = new Set();
  (refs || []).forEach(({ path, headerId }) => {
    const h = (getState().org.present.getIn(['files', path, 'headers']) || List()).find(
      (x) => x.get('id') === headerId
    );
    if (!h) return;
    const oldTitle = generateTitleLine(h.toJS(), false);
    const newTitle = idLinksToText(oldTitle, ids);
    if (newTitle !== oldTitle) {
      dispatch({
        type: 'ELI_IN_FILE',
        path,
        dirtying: true,
        inner: { type: 'UPDATE_HEADER_TITLE', headerId, newRawTitle: newTitle, dirtying: true },
      });
      touched.add(path);
    }
    const oldRaw = h.get('rawDescription') || '';
    const newRaw = idLinksToText(oldRaw, ids);
    if (newRaw !== oldRaw) {
      dispatch({
        type: 'ELI_IN_FILE',
        path,
        dirtying: true,
        inner: {
          type: 'UPDATE_HEADER_DESCRIPTION',
          headerId,
          newRawDescription: createRawDescriptionText(
            h.set('rawDescription', newRaw),
            false,
            getState().base.get('eliIndentOnExport') !== true
          ),
          dirtying: true,
        },
      });
      touched.add(path);
    }
    const items = h.get('propertyListItems') || List();
    const kept = items.filter((p) => !isOnlyIdLink(p, ids));
    if (kept.size !== items.size) {
      dispatch({
        type: 'ELI_IN_FILE',
        path,
        dirtying: true,
        inner: {
          type: 'UPDATE_PROPERTY_LIST_ITEMS',
          headerId,
          newPropertyListItems: kept,
          dirtying: true,
        },
      });
      touched.add(path);
    }
  });
  touched.forEach((path) => {
    dispatch(setDirty(true, path));
    dispatch(sync({ path, shouldSuppressMessages: true }));
  });
};

// ORG Mode para Eli (2.13): quitar ya del fichero el enlace a un adjunto borrado (p. ej. desde
// el editor de la vista GTD: así no queda un enlace roto aunque luego se cancele la edición)
export const eliRemoveAttachmentLink = (path, headerId, target) => (dispatch, getState) => {
  if (removeAttachmentLinkInState(dispatch, getState, path, headerId, target)) {
    dispatch(sync({ path, shouldSuppressMessages: true }));
  }
};

// ORG Mode para Eli (2.16): leer los ficheros *.org_archive (para ver y buscar lo archivado).
// Devuelve las rutas leídas. Se buscan en toda la carpeta (sin las copias de seguridad).
const MAX_ARCHIVED_TO_LOAD = 80;
let eliArchivedLoading = null;
let eliArchivedList = { at: 0, paths: [] };
export const eliLoadArchivedFiles = () => (dispatch, getState) => {
  if (eliArchivedLoading) return eliArchivedLoading;
  const client = getState().syncBackend.get('client');
  if (!client || !client.listAllFiles) return Promise.resolve([]);
  eliArchivedLoading = (async () => {
    // La lista de ficheros se pide como mucho cada 5 minutos
    let all = [];
    if (Date.now() - eliArchivedList.at < 5 * 60 * 1000) {
      all = eliArchivedList.paths;
    } else {
      try {
        all = await client.listAllFiles();
        eliArchivedList = { at: Date.now(), paths: all || [] };
      } catch (e) {
        all = eliArchivedList.paths;
      }
    }
    const paths = (all || [])
      .filter((p) => isArchiveFile(p) && !/\/backups\//i.test(p))
      .slice(0, MAX_ARCHIVED_TO_LOAD);
    await Promise.all(paths.map((p) => dispatch(loadFileQuietly(p))));
    return paths.filter((p) => getState().org.present.getIn(['files', p, 'headers']));
  })().finally(() => {
    eliArchivedLoading = null;
  });
  return eliArchivedLoading;
};

// ORG Mode para Eli (2.11): revisar los adjuntos de tareas terminadas, canceladas o archivadas.
// Los ficheros *_archive que no están cargados se leen (y, al quitar un enlace, se reescriben)
// directamente en Dropbox o en la carpeta.
const MAX_ARCHIVE_FILES = 60;
export const eliReviewFinishedAttachments = () => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  if (!client || !client.deleteFile) {
    showMessage('Adjuntos', 'Esta conexión no permite borrar archivos.');
    return;
  }
  const isDone = (path, keyword) => {
    const sets = getState().org.present.getIn(['files', path, 'todoKeywordSets']);
    return createIsTodoKeywordInDoneState(sets && sets.size ? sets : null)(keyword);
  };
  const search = async () => {
    let all = null;
    try {
      all = client.listAllFiles ? await client.listAllFiles() : null;
    } catch (e) {
      all = null;
    }
    const loaded = getState().org.present.get('files');
    const archives = [];
    const archivePaths = (all || [])
      .filter((p) => isArchiveFile(p) && !/\/backups\//i.test(p) && !loaded.has(p))
      .slice(0, MAX_ARCHIVE_FILES);
    for (const p of archivePaths) {
      try {
        const text = await client.getFileContents(p);
        if (typeof text === 'string') archives.push({ path: p, text });
      } catch (e) {
        // un archivo que no se puede leer se salta
      }
    }
    return findFinishedAttachments({
      files: getState().org.present.get('files'),
      isDone,
      archives,
      existing: all ? new Set(all.map((p) => p.toLowerCase())) : null,
    });
  };

  const touched = new Set();
  const removeLink = async (group, target) => {
    if (group.headerId) {
      if (removeAttachmentLinkInState(dispatch, getState, group.orgPath, group.headerId, target))
        touched.add(group.orgPath);
      return;
    }
    const result = await client.getFileContentsAndMetadata(group.orgPath);
    if (result.eliFromCache) throw new Error('Sin conexión');
    const text = result.contents;
    const next = removeLinksToTarget(text, target);
    if (next !== text) await client.updateFile(group.orgPath, next);
  };
  const flush = () => {
    touched.forEach((path) => dispatch(sync({ path, shouldSuppressMessages: true })));
    touched.clear();
  };

  const onDelete = async (group, att) => {
    const result = await confirmAndDeleteAttachment({
      client,
      files: getState().org.present.get('files'),
      orgFilePath: group.orgPath,
      path: att.path,
      excludedIds: new Set(group.headerId ? [group.headerId] : []),
    });
    if (!result) return false;
    try {
      await removeLink(group, att.target);
    } catch (e) {
      await showMessage(
        'Se borró el archivo, pero no se pudo quitar el enlace',
        `${group.orgPath}\n\n${(e && e.message) || ''}`.trim()
      );
    }
    flush();
    return true;
  };

  const onDeleteAll = async (groups) => {
    const removed = new Set();
    const count = groups.reduce((n, g) => n + g.attachments.length, 0);
    const isLocal = client.type === 'LocalFolder';
    const ok = await askConfirm({
      title: `¿Borrar los ${count} adjuntos?`,
      message:
        `Se borrarán los archivos de ${groups.length} ${
          groups.length === 1 ? 'tarea' : 'tareas'
        } terminadas, canceladas o archivadas, y sus enlaces.\n\n` +
        'Los que también estén enlazados en otras tareas o notas se conservan.\n\n' +
        (isLocal
          ? 'Se borrarán definitivamente de la carpeta del ordenador.'
          : 'Dropbox los guarda un tiempo en «Archivos eliminados» por si necesitas recuperarlos.') +
        '\nDeshacer (↶) no recupera los archivos.',
      okLabel: 'Borrar todos',
      cancelLabel: 'Cancelar',
      focusCancel: true,
    });
    if (!ok) return removed;
    const candidateKeys = new Set(groups.map((g) => g.key));
    const kept = [];
    const failed = [];
    const deletedPaths = new Set();
    for (const g of groups) {
      for (const a of g.attachments) {
        // Enlazado también desde una tarea que sigue abierta (o una nota): se conserva
        if (referencedOutside(getState().org.present.get('files'), a.path, candidateKeys)) {
          if (!kept.includes(a.path)) kept.push(a.path);
          continue;
        }
        try {
          // Dos tareas pueden enlazar el mismo archivo: se borra una vez
          if (!a.missing && !deletedPaths.has(a.path)) await client.deleteFile(a.path);
          deletedPaths.add(a.path);
        } catch (e) {
          failed.push(a.path);
          continue;
        }
        try {
          await removeLink(g, a.target);
        } catch (e) {
          failed.push(`${g.orgPath} (enlace a ${a.name})`);
        }
        removed.add(`${g.key}|${a.path}`);
      }
    }
    flush();
    if (kept.length || failed.length) {
      await showMessage(
        'Adjuntos',
        [
          `Borrados: ${removed.size}.`,
          kept.length
            ? `\nSe conservan (enlazados en otras tareas o notas):\n${kept.join('\n')}`
            : '',
          failed.length ? `\nNo se pudieron borrar:\n${failed.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
    return removed;
  };

  await reviewAttachmentsDialog({
    groupsPromise: search(),
    onOpen: (group, att) =>
      openInNewTab(client, att.path).catch((e) =>
        showMessage('No se pudo abrir', `${att.path}\n\n${(e && e.message) || ''}`.trim())
      ),
    onDelete,
    onDeleteAll,
  });
};

// ORG Mode para Eli: seguir un enlace Org a un fichero o encabezado (file:x.org::*Título,
// *Título, #id, id:…) como org-open-at-point: abre el fichero y va al encabezado
// (2.16) Abrir un encabezado de otra copia de la app (la otra columna): los ids internos no
// valen entre copias, así que se busca por su posición en el fichero y su título
export const eliOpenHeaderByLocator = (path, index, rawTitle) => async (dispatch, getState) => {
  await dispatch(loadFileQuietly(path));
  const headers = getState().org.present.getIn(['files', path, 'headers']);
  if (!headers) return false;
  const same = (h) => (h.getIn(['titleLine', 'rawTitle']) || '').trim() === (rawTitle || '').trim();
  let header = headers.get(index);
  if (!header || !same(header)) header = headers.find(same) || null;
  if (!header) return false;
  dispatch(selectHeaderAndOpenParents(path, header.get('id'), { widen: true }));
  dispatch(eliNarrowAndExpand(header.get('id')));
  return true;
};

// (2.15) Ruta del fichero abierto (para componentes sin acceso al estado)
export const eliCurrentPath = () => (dispatch, getState) => getState().org.present.get('path');

export const eliFollowOrgLink = (uri, basePath = null) => async (dispatch, getState) => {
  const link = parseOrgLink(uri);
  if (!link) return false;
  const state = getState();
  const files = state.org.present.get('files');
  const base = basePath || state.org.present.get('path');
  let targetPath = base;
  let header = null;
  if (link.id) {
    const found = findHeaderById(files, link.id);
    // (4.26) un día del diario ([[id:diari-AAAA-MM-DD]]) se abre en la hoja del Diario
    if (!found && dayOfOrgId(link.id)) {
      openDiary({ date: dayOfOrgId(link.id) });
      return true;
    }
    if (!found) {
      showMessage(
        'Enlace',
        `No se encuentra el encabezado con ID ${link.id} en los ficheros abiertos.`
      );
      return true;
    }
    targetPath = found.path;
    header = found.header;
  } else if (link.path) {
    const known = Array.from(
      new Set([
        ...Array.from(files.keys()).filter((p) => p && !p.startsWith(STATIC_FILE_PREFIX)),
        ...state.org.present
          .get('fileSettings')
          .map((s) => s.get('path'))
          .toArray(),
      ])
    );
    targetPath = resolveLinkedPath(base, link.path, known);
  }
  if (!targetPath) return true;
  if (!getState().org.present.getIn(['files', targetPath, 'headers'])) {
    dispatch(setLoadingMessage('Abriendo el enlace…'));
    await dispatch(loadFileQuietly(targetPath));
    dispatch(hideLoadingMessage());
  }
  const headers = getState().org.present.getIn(['files', targetPath, 'headers']);
  if (!headers) {
    showMessage('Enlace', `No se ha podido abrir ${targetPath}.`);
    return true;
  }
  if (!header && link.search) {
    header = findLinkedHeader(headers, link.search);
    if (!header) showMessage('Enlace', `No se encuentra «${link.search}» en ${targetPath}.`);
  }
  // (2.15) también si se está en otra vista (GTD, ficheros…) aunque sea el fichero de antes; la
  // navegación no hace nada si ya se está ahí
  window.dispatchEvent(new CustomEvent('eli:navigate', { detail: `/file${targetPath}` }));
  if (header) {
    dispatch(selectHeaderAndOpenParents(targetPath, header.get('id'), { widen: true }));
    // (3.04) el encabezado del enlace se abre «solo cabeceras» (sin notas)
    dispatch({
      type: 'ELI_OPEN_SUBTREE',
      headerId: header.get('id'),
      titlesOnly: true,
      hideBody: true,
    });
    // (3.09) que la cabecera de destino quede marcada aunque la vista se vuelva a pintar después
    // (al abrir otro fichero, al cerrar menús…)
    const targetId = header.get('id');
    setTimeout(() => {
      const present = getState().org.present;
      if (
        present.get('path') === targetPath &&
        present.getIn(['files', targetPath, 'selectedHeaderId']) !== targetId
      )
        dispatch(selectHeader(targetId));
    }, 450);
  } else {
    dispatch(setPath(targetPath));
  }
  return true;
};

// ORG Mode para Eli: carga un fichero sin mensajes (p. ej. los de la agenda desde el explorador).
// Si no existe o falla, no pasa nada.
export const loadFileQuietly = (path) => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  if (!client || !path || getState().org.present.getIn(['files', path, 'headers'])) return;
  try {
    const result = await withTimeout(client.getFileContentsAndMetadata(path), 20000, 'timeout');
    if (getState().org.present.getIn(['files', path, 'headers'])) return;
    dispatch(parseFile(path, result.contents));
    dispatch(setLastSyncAt(lastSyncAtFor(result), path));
    dispatch(setDirty(false, path));
    await dispatch(eliApplyPendingLocalVersion(path));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('ORGanice: no se pudo cargar', path, e);
  }
};

// ORG Mode para Eli: crea un fichero nuevo en Dropbox y lo deja cargado. Devuelve true si ha ido
// bien; si falla, muestra el motivo.
// (3.13) Crear un fichero de texto que no es Org (p. ej. un guion .fountain): sin analizarlo
export const createPlainFile = (path, content) => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  dispatch(setLoadingMessage(`Creando ${path}…`));
  try {
    if (client.pathExists && (await withTimeout(client.pathExists(path), 15000, 'timeout'))) {
      dispatch(hideLoadingMessage());
      showMessage('Ya existe', `${path} ya existe.`);
      return false;
    }
    await withTimeout(client.createFile(path, content), 30000, 'El servidor no responde');
    dispatch(setDisappearingLoadingMessage(`Creado ${path}`, 2000));
    return true;
  } catch (e) {
    dispatch(hideLoadingMessage());
    const detail =
      (e && (e.error_summary || (e.error && e.error.error_summary) || e.message)) || String(e);
    showMessage('No se pudo crear el fichero', `${path}: ${detail}`);
    return false;
  }
};

export const createNewFile = (path, content) => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  dispatch(setLoadingMessage(`Creando ${path}…`));
  try {
    if (client.pathExists && (await withTimeout(client.pathExists(path), 15000, 'timeout'))) {
      dispatch(hideLoadingMessage());
      showMessage('Ya existe', `${path} ya existe en Dropbox.`);
      return false;
    }
    await withTimeout(client.createFile(path, content), 30000, 'Dropbox no responde');
    dispatch(parseFile(path, content));
    dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
    dispatch(setDirty(false, path));
    dispatch(setDisappearingLoadingMessage(`Creado ${path}`, 2000));
    if (getState().base.get('eliAllOrgFiles') && /\.org(\.gpg|\.asc)?$/i.test(path)) {
      dispatch({ type: 'ELI_ADD_ALL_FILE_SETTINGS', paths: [path] });
    }
    return true;
  } catch (e) {
    dispatch(hideLoadingMessage());
    const detail =
      (e && (e.error_summary || (e.error && e.error.error_summary) || e.message)) || String(e);
    showMessage('No se pudo crear el fichero', `${path}: ${detail}`);
    return false;
  }
};
