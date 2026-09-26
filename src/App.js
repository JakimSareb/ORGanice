import React, { PureComponent } from 'react';
import createLocalFolderSyncBackendClient from './sync_backend_clients/local_folder_sync_backend_client';

import { Provider } from 'react-redux';
import Store from './store';
import parseQueryString from './util/parse_query_string';
import {
  readInitialState,
  loadSettingsFromConfigFile,
  subscribeToChanges,
  getPersistedField,
} from './util/settings_persister';

import runAllMigrations from './migrations';
import { BrowserRouter } from 'react-router-dom';
import EliErrorBoundary from './components/EliErrorBoundary';
import EliLocalFolderGate from './components/EliLocalFolderGate';

import { DragDropContext } from 'react-beautiful-dnd';

import { reorderCaptureTemplate } from './actions/capture';
import { reorderTags, reorderPropertyList, reorderFileSetting } from './actions/org';
import { signOut } from './actions/sync_backend';
import { setDisappearingLoadingMessage, restoreStaticFile } from './actions/base';

import createDropboxSyncBackendClient from './sync_backend_clients/dropbox_sync_backend_client';
import createWebDAVSyncBackendClient from './sync_backend_clients/webdav_sync_backend_client';
import { withEncryption } from './lib/eli_crypto';
import { BASE_PATH } from './lib/base_path';
import { installIdleLock, getPersistPlainFiles, purgePersistedFiles } from './lib/eli_security';
import { sync as eliSyncAction } from './actions/org';
import createGitLabSyncBackendClient, {
  createGitlabOAuth,
} from './sync_backend_clients/gitlab_sync_backend_client';

import './base.css';

import Turnout from './components/Turnout';

import {
  listenToBrowserButtons,
  syncOnBecomingVisible,
  listenToNetworkConnectionEvents,
} from './lib/initial_setup';

import _ from 'lodash';
import { Map } from 'immutable';
import { setDefaultTodoLine, setDefaultTagsLine } from './lib/eli_todo_defaults';
import { listenForSaves } from './lib/eli_multi';
import { setLastSyncAt, sync } from './actions/org';

import { configure } from 'react-hotkeys';
// do handle hotkeys even if they come from within 'input', 'select' or 'textarea'
configure({ ignoreTags: [] });

const handleGitLabAuthResponse = async (oauthClient) => {
  let success = false;
  try {
    success = await oauthClient.isReturningFromAuthServer();
    await oauthClient.getAccessToken();
  } catch {
    success = false;
  }
  if (!success) {
    // Edge case: somehow OAuth success redirect occurred but there isn't a code in
    // the current location's search params. This /shouldn't/ happen in practice.
    alert('Unexpected sign in error, please try again');
    return;
  }

  const syncClient = createGitLabSyncBackendClient(oauthClient);
  const isAccessible = await syncClient.isProjectAccessible();
  if (!isAccessible) {
    alert('Failed to access GitLab project - is the URL correct?');
  } else {
    window.location.search = '';
  }
};

export default class App extends PureComponent {
  constructor(props) {
    super(props);

    runAllMigrations();

    if (!getPersistPlainFiles()) purgePersistedFiles({ keepDirty: true });
    const initialState = readInitialState();

    const authenticatedSyncService = getPersistedField('authenticatedSyncService', true);
    let client = null;

    if (!!authenticatedSyncService) {
      switch (authenticatedSyncService) {
        case 'Dropbox':
          client = withEncryption(createDropboxSyncBackendClient());
          initialState.syncBackend = Map({
            isAuthenticated: true,
            client: client,
          });
          break;
        case 'LocalFolder':
          // ORG Mode para Eli: carpeta local del ordenador
          client = withEncryption(createLocalFolderSyncBackendClient());
          initialState.syncBackend = Map({
            isAuthenticated: true,
            client,
          });
          break;
        case 'GitLab':
          const gitlabOAuth = createGitlabOAuth();
          if (gitlabOAuth.isAuthorized()) {
            client = withEncryption(createGitLabSyncBackendClient(gitlabOAuth));
            initialState.syncBackend = Map({
              isAuthenticated: true,
              client,
            });
          } else {
            handleGitLabAuthResponse(gitlabOAuth);
          }
          break;
        case 'WebDAV':
          client = withEncryption(
            createWebDAVSyncBackendClient(
              getPersistedField('webdavEndpoint'),
              getPersistedField('webdavUsername'),
              getPersistedField('webdavPassword')
            )
          );
          initialState.syncBackend = Map({
            isAuthenticated: true,
            client,
          });
          break;
        default:
      }
    }

    const queryStringContents = parseQueryString(window.location.search);
    const { captureFile, captureTemplateName, captureContent } = queryStringContents;
    if (!!captureFile && !!captureTemplateName) {
      const capturePath = captureFile.startsWith('/') ? captureFile : `/${captureFile}`;
      const customCaptureVariables = Map(
        Object.entries(queryStringContents)
          .map(([key, value]) => {
            const CUSTOM_VARIABLE_PREFIX = 'captureVariable_';
            if (key.startsWith(CUSTOM_VARIABLE_PREFIX)) {
              return [key.substring(CUSTOM_VARIABLE_PREFIX.length), value];
            }

            return null;
          })
          .filter((item) => !!item)
      );
      initialState.org.present = initialState.org.present.set(
        'pendingCapture',
        Map({
          capturePath,
          captureTemplateName,
          captureContent,
          customCaptureVariables,
        })
      );
    }

    this.store = Store(initialState);
    this.store.subscribe(subscribeToChanges(this.store));
    // ORG Mode para Eli: estados y etiquetas por defecto (Ajustes), también al llegar la
    // configuración desde .organice-config.json
    let eliTodoLine;
    let eliTagsLine;
    const applyEliDefaults = () => {
      const base = this.store.getState().base;
      if (base.get('eliTodoKeywordsLine') !== eliTodoLine) {
        eliTodoLine = base.get('eliTodoKeywordsLine');
        setDefaultTodoLine(eliTodoLine);
      }
      if (base.get('eliDefaultTagsLine') !== eliTagsLine) {
        eliTagsLine = base.get('eliDefaultTagsLine');
        setDefaultTagsLine(eliTagsLine);
      }
    };
    applyEliDefaults();
    this.store.subscribe(applyEliDefaults);

    // ORG Mode para Eli: si otra copia de la app (pantalla dividida u otra ventana) guarda un
    // fichero que aquí está abierto, se recarga. Si aquí también había cambios sin guardar, se
    // compara como un conflicto normal (con su aviso), nunca se pisa lo de la otra copia.
    listenForSaves((path, at) => {
      const file = this.store.getState().org.present.getIn(['files', path]);
      if (!file || !file.get('headers')) return;
      // La fecha de la última sincronización se deja justo antes del guardado de la otra copia,
      // para que la versión del servidor cuente como más nueva (con margen por la hora del reloj)
      this.store.dispatch(setLastSyncAt(new Date(at - 60000), path));
      if (file.get('isDirty')) {
        this.store.dispatch(sync({ path, shouldSuppressMessages: true }));
      } else {
        this.store.dispatch(sync({ path, forceAction: 'pull', shouldSuppressMessages: true }));
      }
    });

    if (!!client) {
      client.isSignedIn().then((isSignedIn) => {
        if (isSignedIn) {
          loadSettingsFromConfigFile(this.store.dispatch, this.store.getState);
        } else {
          this.store.dispatch(signOut());
        }
      });
    } else {
      if (!!this.store.getState().org.present.get('pendingCapture')) {
        this.store.dispatch(
          setDisappearingLoadingMessage(
            `You need to sign in before you can use capture templates`,
            5000
          )
        );
      }
    }

    // Load static files.
    this.store.dispatch(restoreStaticFile('sample'));
    this.store.dispatch(restoreStaticFile('changelog'));

    listenToBrowserButtons(this.store);
    installIdleLock(this.store, eliSyncAction);
    syncOnBecomingVisible(this.store);
    listenToNetworkConnectionEvents(this.store);

    _.bindAll(this, ['handleDragEnd']);
  }

  handleDragEnd(result) {
    if (!result.destination) {
      return;
    }

    if (result.type === 'TAG') {
      this.store.dispatch(reorderTags(result.source.index, result.destination.index));
    } else if (result.type === 'PROPERTY-LIST') {
      this.store.dispatch(reorderPropertyList(result.source.index, result.destination.index));
    } else if (result.type === 'CAPTURE-TEMPLATE') {
      this.store.dispatch(reorderCaptureTemplate(result.source.index, result.destination.index));
    } else if (result.type === 'FILE-SETTING') {
      this.store.dispatch(reorderFileSetting(result.source.index, result.destination.index));
    }
  }

  render() {
    return (
      <DragDropContext onDragEnd={this.handleDragEnd}>
        <BrowserRouter basename={BASE_PATH}>
          <Provider store={this.store}>
            <EliErrorBoundary label="la app">
              <Turnout />
              <EliLocalFolderGate />
            </EliErrorBoundary>
          </Provider>
        </BrowserRouter>
      </DragDropContext>
    );
  }
}
