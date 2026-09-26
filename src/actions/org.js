import { ActionCreators, ActionTypes } from 'redux-undo';
import { offerToDeleteAttachments } from '../lib/eli_attachments';
import { addConflict, sameContents } from '../lib/eli_conflicts';
import { debounce } from 'lodash';
import {
  setLoadingMessage,
  hideLoadingMessage,
  setIsLoading,
  setDisappearingLoadingMessage,
  activatePopup,
  closePopup,
} from './base';
import { exportOrg, createRawDescriptionText } from '../lib/export_org';
import { uploadAssets } from '../lib/eli_media';
import { getCurrentTimestampAsText } from '../lib/timestamps';
import { toggledPriorityATitle } from '../lib/eli_priority';
import {
  archiveLocationFor,
  resolveArchiveLocation,
  buildArchivedSubtree,
  newArchiveFileText,
  insertIntoArchiveText,
  targetLevelFor,
} from '../lib/eli_archive';
import { isEncryptedPath } from '../lib/eli_crypto';
import { List } from 'immutable';
import {
  decryptCryptEntryInText,
  encryptCryptEntries,
  inheritEncryptionMeta,
} from '../lib/eli_crypto';
import { showMessage, askConfirm } from '../lib/eli_prompt';
import substituteTemplateVariables from '../lib/capture_template_substitution';
import { headerWithPath, STATIC_FILE_PREFIX } from '../lib/org_utils';

import sampleCaptureTemplates from '../lib/sample_capture_templates';

import { isAfter, addSeconds } from 'date-fns';
import { parseISO } from 'date-fns';
import { persistIsDirty, saveFileContentsToLocalStorage } from '../util/file_persister';
import { localStorageAvailable, readOpennessState } from '../util/settings_persister';

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
      // sync all files on manual sync
      files.keySeq().forEach((path) => dispatch(doSync({ ...options, path })));
    } else {
      syncDebounced(dispatch, getState, options);
    }
  }
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
} = {}) => (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  const currentPath = getState().org.present.get('path');
  path = path || currentPath;
  if (!path || path.startsWith(STATIC_FILE_PREFIX)) {
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

  if (!shouldSuppressMessages) {
    dispatch(setLoadingMessage(`Sincronizando…`));
  }
  dispatch(setIsLoading(true, path));
  dispatch(setOrgFileErrorMessage(null));

  client
    .getFileContentsAndMetadata(path)
    .then(({ contents, lastModifiedAt }) => {
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
              if (!shouldSuppressMessages) {
                dispatch(setDisappearingLoadingMessage(successMessage, 2000));
              } else {
                setTimeout(() => dispatch(hideLoadingMessage()), 2000);
              }
              dispatch(setIsLoading(false, path));
              dispatch(setDirty(false, path));
              dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
            })
            .catch((error) => {
              const err = `Error al subir el fichero ${path}: ${error.toString()}`;
              console.error(err);
              dispatch(setDisappearingLoadingMessage(err, 5000));
              dispatch(hideLoadingMessage());
              dispatch(setIsLoading(false, path));
              // Re-enqueue the file to be synchronized again
              dispatch(sync({ path }));
            });
        } else {
          if (!shouldSuppressMessages) {
            dispatch(setDisappearingLoadingMessage('Nada que sincronizar', 2000));
          } else {
            setTimeout(() => dispatch(hideLoadingMessage()), 2000);
          }
          dispatch(setIsLoading(false, path));
        }
      } else {
        if (isDirty && forceAction !== 'pull') {
          dispatch(hideLoadingMessage());
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
          } else {
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
          if (!shouldSuppressMessages) {
            dispatch(setDisappearingLoadingMessage(`Última versión descargada: ${path}`, 2000));
          } else {
            setTimeout(() => dispatch(hideLoadingMessage()), 2000);
          }
          dispatch(setIsLoading(false, path));
        }
      }
    })
    .catch((error) => {
      dispatch(hideLoadingMessage());
      dispatch(setIsLoading(false, path));
      // ORG Mode para Eli: mostrar el motivo real (p. ej. frase de paso incorrecta)
      dispatch(
        setOrgFileErrorMessage(
          error && error.message
            ? `${path}: ${error.message}`
            : `No se encuentra el fichero ${path}`
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

export const enterEditMode = (editModeType) => ({
  type: 'ENTER_EDIT_MODE',
  editModeType,
});

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

export const selectNextVisibleHeader = (headerId) => ({
  type: 'SELECT_NEXT_VISIBLE_HEADER',
  headerId,
});

export const selectPreviousVisibleHeader = (headerId) => ({
  type: 'SELECT_PREVIOUS_VISIBLE_HEADER',
  headerId,
});

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

// ORG Mode para Eli: vista reducida a un encabezado, con todo su contenido desplegado
export const eliNarrowAndExpand = (headerId) => (dispatch) => {
  dispatch(narrowHeader(headerId));
  dispatch({ type: 'ELI_OPEN_SUBTREE', headerId });
};

export const widenHeader = () => ({
  type: 'WIDEN_HEADER',
});

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

export const setDirty = (isDirty, path) => (dispatch) => {
  persistIsDirty(isDirty, path);
  dispatch(dirtyAction(isDirty, path));
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

export const insertCapture = (templateId, content, shouldPrepend) => (dispatch, getState) => {
  dispatch(closePopup());

  const template = getState()
    .capture.get('captureTemplates')
    .concat(sampleCaptureTemplates)
    .find((template) => template.get('id') === templateId);
  dispatch({ type: 'INSERT_CAPTURE', template, content, shouldPrepend, dirtying: true });
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
  dispatch({ type: 'INSERT_CAPTURE_FROM_HEADER', template, header, shouldPrepend, dirtying: true });
  dispatch(sync({ successMessage: 'Elemento capturado', path: targetPath }));
};

export const clearPendingCapture = () => ({
  type: 'CLEAR_PENDING_CAPTURE',
});

export const insertPendingCapture = () => (dispatch, getState) => {
  const path = getState().org.present.get('path');
  const pendingCapture = getState().org.present.get('pendingCapture');
  const templateName = pendingCapture.get('captureTemplateName');
  const captureContent = pendingCapture.get('captureContent');
  const customCaptureVariables = pendingCapture.get('customCaptureVariables');

  dispatch(clearPendingCapture());
  window.history.pushState({}, '', window.location.pathname);

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

  const headerPaths = template.get('headerPaths');
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

  dispatch(insertCapture(template.get('id'), content, template.get('shouldPrepend')));
  dispatch(sync({ successMessage: 'Elemento capturado', path: targetPath }));
};

export const advanceCheckboxState = (listItemId) => ({
  type: 'ADVANCE_CHECKBOX_STATE',
  listItemId,
  dirtying: true,
});

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

export const setOrgFileErrorMessage = (message) => ({
  type: 'SET_ORG_FILE_ERROR_MESSAGE',
  message,
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
  onlyCurrentFile
) => ({
  type: 'SET_SEARCH_FILTER_INFORMATION',
  searchFilter,
  cursorPosition,
  context,
  scope,
  onlyCurrentFile,
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
export const uploadFilesAndGetLinks = (files) => async (dispatch, getState) => {
  const state = getState();
  const client = state.syncBackend.get('client');
  const path = state.org.present.get('path');
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
    archiveLocationFor(file, headers, index),
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
    if (getState().org.present.getIn(['files', archivePath])) {
      dispatch(parseFile(archivePath, newText));
    }
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

// ORG Mode para Eli: carga un fichero sin mensajes (p. ej. los de la agenda desde el explorador).
// Si no existe o falla, no pasa nada.
export const loadFileQuietly = (path) => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  if (!client || !path || getState().org.present.getIn(['files', path, 'headers'])) return;
  try {
    const contents = await withTimeout(client.getFileContents(path), 20000, 'timeout');
    if (getState().org.present.getIn(['files', path, 'headers'])) return;
    dispatch(parseFile(path, contents));
    dispatch(setLastSyncAt(addSeconds(new Date(), 5), path));
    dispatch(setDirty(false, path));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('ORGanice: no se pudo cargar', path, e);
  }
};

// ORG Mode para Eli: crea un fichero nuevo en Dropbox y lo deja cargado. Devuelve true si ha ido
// bien; si falla, muestra el motivo.
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
    return true;
  } catch (e) {
    dispatch(hideLoadingMessage());
    const detail =
      (e && (e.error_summary || (e.error && e.error.error_summary) || e.message)) || String(e);
    showMessage('No se pudo crear el fichero', `${path}: ${detail}`);
    return false;
  }
};
