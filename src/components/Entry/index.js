import React, { PureComponent, Fragment } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Route, Switch, Redirect, withRouter } from 'react-router-dom';

import './stylesheet.css';

import { List, Set, Map as IMap } from 'immutable';
import _ from 'lodash';
import classNames from 'classnames';

import { changelogHash, STATIC_FILE_PREFIX } from '../../lib/org_utils';
import PrivacyPolicy from '../PrivacyPolicy';
import HeaderBar from '../HeaderBar';
import FileBrowser from '../FileBrowser';
import LoadingIndicator from '../LoadingIndicator';
import OrgFile from '../OrgFile';
import Settings from '../Settings';
import EncryptionSettings from '../EncryptionSettings';
import EliTools from '../EliTools';
import KeyboardShortcutsEditor from '../KeyboardShortcutsEditor';
import CaptureTemplatesEditor from '../CaptureTemplatesEditor';
import FileSettingsEditor from '../FileSettingsEditor';
import GtdView from '../Gtd';
import EliConflicts from '../EliConflicts';
import EliCommandPalette from '../EliCommandPalette';
import EliCalendar from '../EliCalendar';
import EliCalculator from '../EliCalculator';
import { installFormatHotkeys } from '../EliFormatBar';
import { lastDocument, modeFade, rememberRoute, takeResumeRoute } from '../../lib/eli_mode';
import { notWhileTyping, matchesBinding, shouldIgnoreOrganiceHotkey } from '../../lib/eli_hotkeys';
import { calculateActionedKeybindings } from '../../lib/keybindings';

import * as syncBackendActions from '../../actions/sync_backend';
import * as orgActions from '../../actions/org';
import * as baseActions from '../../actions/base';
import { loadTheme } from '../../lib/color';

class Entry extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, [
      'renderChangelogFile',
      'renderSampleFile',
      'renderFileBrowser',
      'renderFile',
      'setChangelogUnseenChanges',
      'openGtd',
      'openDocs',
      'eliNavigate',
    ]);
  }

  // ORG Mode para Eli: atajo «g» (desde la hoja o el explorador) → vista GTD
  // En la vista GTD, la misma tecla (o el conmutador) vuelve a Documentos.
  openGtd() {
    if (!this.props.isAuthenticated) return;
    if (this.props.location.pathname === '/gtd') {
      this.openDocs();
      return;
    }
    modeFade();
    this.props.history.push('/gtd');
  }

  // ORG Mode para Eli: modo Documentos: el último fichero (con su encabezado y narrow) o carpeta
  openDocs() {
    if (!this.props.isAuthenticated) return;
    const doc = lastDocument();
    const route = doc && doc.route ? doc.route : '/files';
    if (this.props.location.pathname === route) return;
    modeFade();
    if (route.startsWith('/file/')) {
      const path = doc.path || route.slice('/file'.length);
      if (doc.narrowedHeaderId || doc.selectedHeaderId) {
        window.__eliPendingNarrow = {
          path,
          headerId: doc.narrowedHeaderId || null,
          selectId: doc.selectedHeaderId || null,
        };
      }
      this.props.org.setPath(path);
    }
    this.props.history.push(route);
  }

  // Tecla de la vista GTD (g) dentro de la vista GTD: volver a Documentos
  eliGtdKey = notWhileTyping((event) => {
    // (si la misma tecla ya ha abierto GTD desde la hoja, no se vuelve atrás)
    if (event.defaultPrevented || this.props.location.pathname !== '/gtd') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (shouldIgnoreOrganiceHotkey(event, null)) return;
    const bindings = Object.fromEntries(
      calculateActionedKeybindings(this.props.customKeybindings || IMap())
    );
    if (!matchesBinding(event, bindings.openGtd)) return;
    event.preventDefault();
    this.openDocs();
  });

  // ORG Mode para Eli: navegar a una ruta pedida desde fuera de React Router (p. ej. un enlace)
  eliNavigate(event) {
    const to = event && event.detail;
    if (!to) return;
    let here = this.props.location.pathname;
    try {
      here = decodeURIComponent(here);
    } catch (e) {}
    if (here !== to && this.props.location.pathname !== to) this.props.history.push(to);
  }

  // ORG Mode para Eli (2.15): enlace que manda abrir la otra columna (pantalla dividida)
  eliFollowLink = (event) => {
    const d = (event && event.detail) || {};
    if (d.uri) this.props.org.eliFollowOrgLink(d.uri, d.basePath || null);
  };

  // ORG Mode para Eli (2.12): al arrancar en la página inicial, volver a la última vista
  eliResume() {
    if (this.eliResumeRoute === undefined) this.eliResumeRoute = takeResumeRoute();
    return this.eliResumeRoute;
  }

  componentDidMount() {
    installFormatHotkeys();
    this.eliResume();
    this.eliResumeRoute = null; // solo al arrancar
    if (this.props.location)
      rememberRoute(this.props.location.pathname, this.props.location.search);
    window.addEventListener('eli:open-gtd', this.openGtd);
    window.addEventListener('eli:open-docs', this.openDocs);
    window.addEventListener('keydown', this.eliGtdKey);
    window.addEventListener('eli:navigate', this.eliNavigate);
    window.addEventListener('eli:follow-link', this.eliFollowLink);
    this.setChangelogUnseenChanges();
    this.props.filesToLoad.forEach((path) => this.props.syncBackend.downloadFile(path));
    this.props.filesToSync.forEach((path) => this.props.org.sync({ path }));
    // ORG Mode para Eli: modo «todos los ficheros .org» (al abrir y al volver a la app)
    this.props.org.eliRefreshAllOrgFiles({ force: true });
    document.addEventListener('visibilitychange', this.eliOnVisible);
  }

  eliOnVisible = () => {
    if (document.visibilityState === 'visible') this.props.org.eliRefreshAllOrgFiles();
  };

  // TODO: Should this maybe done on init of the application and not in the component?
  setChangelogUnseenChanges() {
    const { lastSeenChangelogHash, isAuthenticated } = this.props;
    changelogHash().then((changelogHash) => {
      const hasChanged =
        isAuthenticated &&
        lastSeenChangelogHash &&
        !_.isEqual(changelogHash, lastSeenChangelogHash);

      this.props.base.setHasUnseenChangelog(hasChanged);
    });
  }

  componentDidUpdate(prevProps) {
    const { location } = this.props;
    if (location && (!prevProps.location || prevProps.location.pathname !== location.pathname)) {
      rememberRoute(location.pathname, location.search);
    }
    this.shouldPromptWhenLeaving()
      ? (window.onbeforeunload = () => true)
      : (window.onbeforeunload = undefined);
  }

  componentWillUnmount() {
    window.removeEventListener('eli:open-gtd', this.openGtd);
    window.removeEventListener('eli:open-docs', this.openDocs);
    window.removeEventListener('keydown', this.eliGtdKey);
    window.removeEventListener('eli:navigate', this.eliNavigate);
    window.removeEventListener('eli:follow-link', this.eliFollowLink);
    document.removeEventListener('visibilitychange', this.eliOnVisible);
    window.onbeforeunload = undefined;
  }

  renderChangelogFile() {
    return (
      <OrgFile
        staticFile="changelog"
        shouldDisableDirtyIndicator={true}
        shouldDisableActions={true}
        shouldDisableSyncButtons={false}
        parsingErrorMessage={
          'No se ha podido cargar el contenido de changelog.org. Vuelve a compilar la app (ver «Desarrollo» en README.md).'
        }
      />
    );
  }

  renderSampleFile() {
    return (
      <OrgFile
        staticFile="sample"
        shouldDisableDirtyIndicator={true}
        shouldDisableActionDrawer={false}
        shouldDisableSyncButtons={true}
        parsingErrorMessage={
          'No se ha podido cargar el contenido de sample.org. Vuelve a compilar la app (ver «Desarrollo» en README.md).'
        }
      />
    );
  }

  renderFileBrowser({
    match: {
      params: { path = '' },
    },
  }) {
    if (!!path) {
      path = '/' + path;
    }

    return <FileBrowser path={path} />;
  }

  renderFile({
    match: {
      params: { path },
    },
  }) {
    if (!!path) {
      path = '/' + path;
    }
    if (
      this.props.path &&
      !this.props.path.startsWith(STATIC_FILE_PREFIX) &&
      this.props.path !== path
    ) {
      this.props.org.sync({ path: this.props.path });
      return <Redirect push to={'/file' + this.props.path} />;
    } else {
      return (
        <OrgFile
          path={path}
          shouldDisableDirtyIndicator={false}
          shouldDisableActionDrawer={false}
          shouldDisableSyncButtons={false}
        />
      );
    }
  }

  shouldPromptWhenLeaving() {
    return this.props.hasDirtyFiles;
  }

  render() {
    const {
      isAuthenticated,
      loadingMessage,
      fontSize,
      activeModalPage,
      pendingCapture,
      location: { pathname },
      colorScheme,
      theme,
      defaultFilePath,
    } = this.props;

    loadTheme(theme, colorScheme);

    const pendingCapturePath = !!pendingCapture && `/file${pendingCapture.get('capturePath')}`;
    const shouldRedirectToCapturePath = pendingCapturePath && pendingCapturePath !== pathname;

    const className = classNames('App entry-container', {
      'entry-container--large-font': fontSize === 'Large',
    });

    return (
      <div className={className}>
        <HeaderBar />
        <LoadingIndicator message={loadingMessage} />
        <EliTools />
        {isAuthenticated && <EliConflicts />}
        {isAuthenticated && <EliCommandPalette />}
        {isAuthenticated && <EliCalendar />}
        <EliCalculator />

        {isAuthenticated &&
          ([
            'changelog',
            'keyboard_shortcuts_editor',
            'settings',
            'capture_templates_editor',
            'file_settings_editor',
            'sample',
          ].includes(activeModalPage) ? (
            <Fragment>
              {activeModalPage === 'keyboard_shortcuts_editor' && <KeyboardShortcutsEditor />}
              {activeModalPage === 'capture_templates_editor' && <CaptureTemplatesEditor />}
              {activeModalPage === 'file_settings_editor' && <FileSettingsEditor />}
              {activeModalPage === 'changelog' && this.renderChangelogFile()}
              {activeModalPage === 'sample' && this.renderSampleFile()}
            </Fragment>
          ) : (
            <Switch>
              {shouldRedirectToCapturePath && <Redirect to={pendingCapturePath} />}
              <Route path="/privacy-policy" exact component={PrivacyPolicy} />
              <Route path="/file/:path+" render={this.renderFile} />
              <Route path="/files/:path*" render={this.renderFileBrowser} />
              <Route path="/sample" exact={true} render={this.renderSampleFile} />
              <Route path="/changelog" exact={true} render={this.renderChangelogFile} />
              <Route path="/encryption" exact={true}>
                <EncryptionSettings />
              </Route>
              <Route path="/gtd" exact={true}>
                <GtdView />
              </Route>
              <Route path="/settings" exact={true}>
                <Settings />
              </Route>
              {this.eliResume() ? (
                <Redirect to={this.eliResume()} />
              ) : defaultFilePath ? (
                <Redirect to={defaultFilePath} />
              ) : (
                <Redirect to="/files" />
              )}
            </Switch>
          ))}
      </div>
    );
  }
}

const mapStateToProps = (state) => {
  const files = state.org.present.get('files');
  const path = state.org.present.get('path');
  const defaultFilePath = state.org.present
    .get('fileSettings')
    .filter((setting) => setting.get('defaultOnStartup'))
    .map((setting) => `file${setting.get('path')}`)
    .first();
  const filesToLoadOnStartup = state.org.present
    .get('fileSettings')
    .filter((setting) => setting.get('loadOnStartup'))
    .map((setting) => setting.get('path'));
  const loadedFiles = Set.fromKeys(files);
  const fileIsLoaded = (path) => loadedFiles.includes(path);
  const filesToLoad = filesToLoadOnStartup.filter((path) => !fileIsLoaded(path));
  const filesToSync = filesToLoadOnStartup.filter((path) => fileIsLoaded(path));
  const hasDirtyFiles = !!files.find((file) => file.get('isDirty'));
  return {
    path,
    filesToLoad,
    filesToSync,
    defaultFilePath,
    loadingMessage: state.base.get('loadingMessage'),
    customKeybindings: state.base.get('customKeybindings'),
    isAuthenticated: state.syncBackend.get('isAuthenticated'),
    fontSize: state.base.get('fontSize'),
    lastSeenChangelogHash: state.base.get('lastSeenChangelogHash'),
    activeModalPage: state.base.get('modalPageStack', List()).last(),
    pendingCapture: state.org.present.get('pendingCapture'),
    hasDirtyFiles,
    colorScheme: state.base.get('colorScheme'),
    theme: state.base.get('theme'),
    osColorSchemeChangeCount: state.base.get('osColorSchemeChangeCount'),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    syncBackend: bindActionCreators(syncBackendActions, dispatch),
    org: bindActionCreators(orgActions, dispatch),
    base: bindActionCreators(baseActions, dispatch),
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(Entry));
