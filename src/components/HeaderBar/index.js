import { openRawEditor, openPrintPreview, openMoonPhases, openFavorites } from '../EliTools';
import { openPalette } from '../../lib/eli_palette';
import { offlineStatusText } from '../../actions/eli_offline';
import EliMoreMenu from '../EliMoreMenu';
import { fileDisplayName, windowTitleFor } from '../../lib/eli_app_name';
import { backToSettings } from '../EncryptionSettings';
import { getPersistPlainFiles } from '../../lib/eli_security';
import { rememberDoc, openDocuments, openGtdMode } from '../../lib/eli_mode';
import { STATIC_FILE_PREFIX as ELI_STATIC_PREFIX } from '../../lib/org_utils';
const isStaticFile = (p) => !p || p.startsWith(ELI_STATIC_PREFIX);
// (memorizado: la lista solo cambia si cambian los ficheros)
let lastFiles = null;
let lastLoaded = [];
const loadedPathsOf = (files) => {
  if (files !== lastFiles) {
    lastFiles = files;
    lastLoaded = files
      ? Array.from(files.keys()).filter((p) => !isStaticFile(p) && files.getIn([p, 'headers']))
      : [];
  }
  return lastLoaded;
};
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { isLandingPage } from '../../util/misc';

import { isInsideSplitPane } from '../../lib/eli_multi';
import { BASE_PATH } from '../../lib/base_path';
import { Link, withRouter } from 'react-router-dom';

import logo from 'url:../../images/logo-unicornio.svg';

import './stylesheet.css';

import * as baseActions from '../../actions/base';
import * as orgActions from '../../actions/org';
import { ActionCreators as undoActions } from 'redux-undo';

import ExternalLink from '../UI/ExternalLink';

import { List } from 'immutable';
import _ from 'lodash';
import classNames from 'classnames';

class HeaderBar extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, [
      'handleChangelogClick',
      'handleModalPageDoneClick',
      'handleHeaderBarTitleClick',
      'handleBackClick',
      'handleUndoClick',
      'handleRedoClick',
      'handleHelpClick',
      'handleSettingsClick',
    ]);
  }

  getPathRoot() {
    const {
      location: { pathname },
    } = this.props;
    return pathname.split('/')[1];
  }

  // ORG Mode para Eli: modo de la app (Documentos / GTD) según la ruta
  getMode() {
    const { isAuthenticated, activeModalPage } = this.props;
    if (!isAuthenticated || activeModalPage) return null;
    const root = this.getPathRoot();
    if (root === 'gtd') return 'gtd';
    if (root === 'files') return 'docs';
    if (root === 'file' && !isStaticFile(this.props.path)) return 'docs';
    return null;
  }

  // Se recuerda dónde se está en Documentos para volver ahí desde GTD
  rememberDocument() {
    const { location, path, selectedHeaderId, narrowedHeaderId, isAuthenticated } = this.props;
    if (!isAuthenticated) return;
    const root = this.getPathRoot();
    if (root === 'files') {
      rememberDoc({ route: location.pathname });
    } else if (
      root === 'file' &&
      path &&
      !isStaticFile(path) &&
      decodeURIComponent(location.pathname) === `/file${path}`
    ) {
      rememberDoc({ route: `/file${path}`, path, selectedHeaderId, narrowedHeaderId });
    }
  }

  // Sincronizar: el fichero abierto, los de la vista GTD o todos los cargados (explorador)
  eliSyncNow() {
    const root = this.getPathRoot();
    if (root === 'gtd') {
      window.dispatchEvent(new CustomEvent('eli:gtd', { detail: { sync: true } }));
    } else if (root === 'file' && this.props.path && !isStaticFile(this.props.path)) {
      this.props.org.sync({ forceAction: 'manual' });
    } else {
      (this.props.loadedPaths || []).forEach((p) =>
        this.props.org.sync({ path: p, shouldSuppressMessages: true })
      );
    }
  }

  renderModeSwitch(mode) {
    const docs = mode === 'docs';
    const root = this.getPathRoot();
    const { pathname } = this.props.location;
    let up = null;
    if (root === 'file') {
      const filePath = pathname.substr('/file'.length).replace(/\/$/, '');
      const dir = filePath.split('/').slice(0, -1).join('/');
      up = { to: `/files${dir}`, label: 'Ficheros' };
    } else if (root === 'files') {
      const folder = pathname.substr('/files'.length).replace(/\/$/, '');
      if (folder) {
        const parts = folder.split('/');
        const parent = parts.slice(0, -1).join('/');
        up = {
          to: `/files${parent}`,
          label: parts.length > 2 ? parts[parts.length - 2] : 'Ficheros',
        };
      }
    }
    return (
      <div className="eli-mode-bar">
        {/* Un solo botón: se pulse donde se pulse, cambia de modo */}
        <button
          type="button"
          className="eli-mode"
          onClick={() => (docs ? openGtdMode() : openDocuments())}
          title={docs ? 'Cambiar a la vista GTD (tecla g)' : 'Cambiar a Documentos (tecla g)'}
          aria-label={docs ? 'Cambiar a la vista GTD' : 'Cambiar a Documentos'}
          data-testid="eli-mode-toggle"
        >
          <span
            className={'eli-mode__btn eli-mode__btn--docs' + (docs ? ' is-on' : '')}
            data-testid="eli-mode-docs"
          >
            <i className="far fa-file-alt" />
            <span className="eli-mode__label eli-mode__label--long">Documentos</span>
            <span className="eli-mode__label eli-mode__label--short">Docs</span>
          </span>
          <span
            className={'eli-mode__btn eli-mode__btn--gtd' + (!docs ? ' is-on' : '')}
            data-testid="eli-open-gtd"
          >
            <i className="fas fa-tasks" />
            <span className="eli-mode__label">GTD</span>
          </span>
        </button>
        {up && (
          <Link
            to={decodeURIComponent(up.to)}
            className="eli-mode__up"
            title={`Subir a ${up.label}`}
            data-testid="eli-mode-up"
          >
            <i className="fas fa-chevron-left" />
            <span className="eli-mode__up-label">{up.label}</span>
          </Link>
        )}
      </div>
    );
  }

  componentDidMount() {
    this.rememberDocument();
    this.updateWindowTitle();
    window.addEventListener('eli:split-open', this.eliOpenSplit);
  }

  componentWillUnmount() {
    window.removeEventListener('eli:split-open', this.eliOpenSplit);
  }

  // ORG Mode para Eli: «Dos columnas» pedido desde la paleta de comandos
  eliOpenSplit = () => {
    if (this.canOpenSplitView()) this.openSplitView();
  };

  componentDidUpdate() {
    this.rememberDocument();
    this.updateWindowTitle();
  }

  updateWindowTitle() {
    // No se toca mientras la vista de impresión usa su propio título
    if (
      document.getElementById('eli-print-portal') &&
      document.getElementById('eli-print-portal').childElementCount
    )
      return;
    const title = windowTitleFor(this.getFilename() ? this.props.path : null);
    if (document.title !== title) document.title = title;
  }

  getFilename() {
    // ORG Mode para Eli: nombre del fichero abierto (sin carpeta ni extensiones .org/.gpg/.asc)
    const { path } = this.props;
    if (!path || this.getPathRoot() !== 'file') return '';
    return fileDisplayName(path);
  }

  renderFileBrowserBackButton() {
    let backPath = 'Atrás';
    const fileParts = window.location.href.split('/').map((e) => decodeURIComponent(e));
    if (_.includes(fileParts, 'files')) {
      backPath = _.last(fileParts);
    }

    return (
      <div
        onClick={() => {
          window.history.back();
        }}
        className="header-bar__back-button"
      >
        <i className="fas fa-chevron-left" />
        <span className="header-bar__back-button__directory-path">{backPath}</span>
      </div>
    );
  }

  renderOrgFileBackButton() {
    const {
      location: { pathname },
    } = this.props;

    let filePath = pathname.substr('/file'.length);
    if (filePath.endsWith('/')) {
      filePath = filePath.substring(0, filePath.length - 1);
    }

    const pathParts = filePath.split('/');
    const directoryPath = pathParts.slice(0, pathParts.length - 1).join('/');

    return (
      <Link
        to={`/files${directoryPath}`}
        onClick={this.handleBackClick}
        className="header-bar__back-button"
      >
        <i className="fas fa-chevron-left" />
        <span className="header-bar__back-button__directory-path">Ficheros</span>
      </Link>
    );
  }

  renderLogo() {
    return (
      <div className="header-bar__logo-container">
        <img className="header-bar__logo" src={logo} alt="Logo" width="30" height="30" />
        <h2 className="header-bar__app-name">ORGanice</h2>
      </div>
    );
  }

  renderHomeFileBackButton() {
    return (
      <Link to={`/`} className="header-bar__back-button">
        <i className="fas fa-chevron-left" />
        <span className="header-bar__back-button__directory-path">Inicio</span>
      </Link>
    );
  }

  renderSignInBackButton() {
    return (
      <Link to={`/`} className="header-bar__back-button">
        <i className="fas fa-chevron-left" />
        <span className="header-bar__back-button__directory-path">Inicio</span>
      </Link>
    );
  }

  handleBackClick() {
    this.props.base.popModalPage();
  }

  renderSettingsSubPageBackButton() {
    return (
      <div className="header-bar__back-button" onClick={this.handleBackClick}>
        <i className="fas fa-chevron-left" />
        <span className="header-bar__back-button__directory-path">Ajustes</span>
      </div>
    );
  }

  renderBackButton() {
    const { activeModalPage } = this.props;

    switch (activeModalPage) {
      case 'changelog':
        return this.renderSettingsSubPageBackButton();
      case 'keyboard_shortcuts_editor':
        return this.renderSettingsSubPageBackButton();
      case 'capture_templates_editor':
        return this.renderSettingsSubPageBackButton();
      case 'file_settings_editor':
        return this.renderSettingsSubPageBackButton();
      case 'sample':
        return this.renderOrgFileBackButton();
      default:
    }

    const mode = this.getMode();
    if (mode) return this.renderModeSwitch(mode);

    switch (this.getPathRoot()) {
      case '':
        return this.renderLogo();
      case 'files':
        return this.renderFileBrowserBackButton();
      case 'file':
        return this.renderOrgFileBackButton();
      case 'sample':
        return this.renderHomeFileBackButton();
      case 'sign_in':
        return this.renderSignInBackButton();
      case 'gtd':
        return (
          <div
            className="header-bar__back-button"
            onClick={() => this.props.history.push('/')}
            data-testid="gtd-back"
          >
            <i className="fas fa-chevron-left" />
            <span className="header-bar__back-button__directory-path">ORGanice</span>
          </div>
        );
      case 'settings':
        return this.renderFileBrowserBackButton();
      case 'changelog':
        return this.renderFileBrowserBackButton();
      case 'encryption':
        return (
          <div
            className="header-bar__back-button"
            onClick={() => backToSettings(this.props.history)}
          >
            <i className="fas fa-chevron-left" />
            <span className="header-bar__back-button__directory-path">Ajustes</span>
          </div>
        );
      default:
        return <div />;
    }
  }

  renderTitle() {
    const titleContainerWithText = (text) => (
      <div className="header-bar__title" onClick={this.handleHeaderBarTitleClick}>
        {text}
      </div>
    );

    switch (this.props.activeModalPage) {
      case 'changelog':
        return titleContainerWithText('Novedades');
      case 'settings':
        return titleContainerWithText('Ajustes');
      case 'keyboard_shortcuts_editor':
        return titleContainerWithText('Atajos');
      case 'capture_templates_editor':
        return titleContainerWithText('Captura');
      case 'file_settings_editor':
        return titleContainerWithText('Ficheros');
      case 'sample':
        return titleContainerWithText('Manual');
      default:
    }

    switch (this.getPathRoot()) {
      case 'sample':
        return titleContainerWithText('Manual');
      case 'sign_in':
        return titleContainerWithText('Iniciar sesión');
      case 'encryption':
        return titleContainerWithText('Seguridad');
      case 'gtd':
        return titleContainerWithText('GTD');
      case 'settings':
        return titleContainerWithText('Ajustes');
      default:
    }

    // ORG Mode para Eli: dentro de un fichero, siempre se ve su nombre en la cabecera
    const name = this.getFilename();
    if (!name) return titleContainerWithText('');
    return (
      <div
        className="header-bar__title header-bar__title--file"
        onClick={this.handleHeaderBarTitleClick}
        title={this.props.path}
        data-testid="eli-file-title"
      >
        {/\.(gpg|asc)$/i.test(this.props.path) && <i className="fas fa-lock eli-title-lock" />}
        {name}
      </div>
    );
  }

  // ORG Mode para Eli: Narrow/Widen siempre en el mismo sitio (barra superior)
  renderNarrowButton() {
    const { narrowedHeaderId, selectedHeaderId } = this.props;
    if (narrowedHeaderId) {
      return (
        <i
          className="fas fa-expand header-bar__actions__item eli-narrow-btn is-active"
          onClick={() => this.props.org.widenHeader()}
          title="Ampliar (widen): volver a ver el fichero entero"
          data-testid="eli-widen"
        />
      );
    }
    const enabled = !!selectedHeaderId;
    return (
      <i
        className={classNames('fas fa-compress header-bar__actions__item eli-narrow-btn', {
          'header-bar__actions__item--disabled': !enabled,
        })}
        onClick={() => enabled && this.props.org.narrowHeader(selectedHeaderId)}
        title={
          enabled
            ? 'Reducir (narrow): mostrar solo el encabezado seleccionado'
            : 'Reducir (narrow): selecciona primero un encabezado'
        }
        data-testid="eli-narrow"
      />
    );
  }

  // ORG Mode para Eli: pantalla dividida (solo en pantallas anchas). Dentro de un panel, botón
  // visible para quitar la división; fuera, una opción del menú «⋯».
  renderSplitCloseButton() {
    if (!isInsideSplitPane()) return null;
    return (
      <i
        className="fas fa-window-maximize header-bar__actions__item"
        onClick={() => {
          window.top.location.href = window.location.href;
        }}
        title="Quitar la división y quedarse con este panel"
        data-testid="eli-split-close"
      />
    );
  }

  openSplitView() {
    const { pathname, search } = this.props.location;
    const current = `${pathname}${search || ''}`;
    let saved = {};
    try {
      saved = JSON.parse(window.localStorage.getItem('eliSplitView')) || {};
    } catch (e) {}
    const other =
      saved.right && saved.right !== current
        ? saved.right
        : pathname.startsWith('/gtd')
        ? '/files'
        : '/gtd';
    window.location.href = `${BASE_PATH}/split?l=${encodeURIComponent(
      current
    )}&r=${encodeURIComponent(other)}`;
  }

  canOpenSplitView() {
    return !isInsideSplitPane() && window.self === window.top && window.innerWidth >= 900;
  }

  handleChangelogClick() {
    this.props.base.restoreStaticFile('changelog');
    this.props.base.pushModalPage('changelog');
  }

  handleModalPageDoneClick() {
    this.props.base.clearModalStack();
  }

  handleHeaderBarTitleClick() {
    this.props.org.selectHeader(null);
  }

  handleUndoClick() {
    if (this.props.isUndoEnabled) {
      this.props.undo.undo();
    }
  }

  handleRedoClick() {
    if (this.props.isRedoEnabled) {
      this.props.undo.redo();
    }
  }

  handleHelpClick() {
    this.props.base.restoreStaticFile('sample');
    this.props.base.pushModalPage('sample');
  }

  handleSettingsClick() {
    this.props.base.setLastViewedFile(this.props.path);
  }

  renderActions() {
    const {
      isAuthenticated,
      hasUnseenChangelog,
      activeModalPage,
      path,
      isUndoEnabled,
      isRedoEnabled,
      online,
      dirtyCount,
    } = this.props;

    if (!!activeModalPage) {
      return (
        <div className="header-bar__actions" onClick={this.handleModalPageDoneClick}>
          Hecho
        </div>
      );
    } else if (this.getPathRoot() !== 'settings') {
      const undoIconClassName = classNames('fas fa-undo header-bar__actions__item', {
        'header-bar__actions__item--disabled': !isUndoEnabled,
      });
      const inGtd = this.getPathRoot() === 'gtd';
      const inFile = isAuthenticated && !!path && !inGtd;
      const inRealFile = inFile && !isStaticFile(path);
      const { narrowedHeaderId, selectedHeaderId } = this.props;

      // ORG Mode para Eli: a la vista solo lo de cada día; el resto en «⋯»
      const moreItems = isAuthenticated
        ? [
            inRealFile && {
              icon: 'fas fa-search',
              label: 'Buscar en el fichero',
              onClick: () => this.props.base.activatePopup('search'),
              testId: 'eli-search',
            },
            inFile && {
              icon: 'fas fa-redo',
              label: 'Rehacer',
              onClick: this.handleRedoClick,
              disabled: !isRedoEnabled,
              testId: 'eli-redo',
            },
            inRealFile &&
              !narrowedHeaderId && {
                icon: 'fas fa-compress',
                label: 'Reducir al encabezado (narrow)',
                onClick: () => selectedHeaderId && this.props.org.narrowHeader(selectedHeaderId),
                disabled: !selectedHeaderId,
                title: selectedHeaderId
                  ? 'Mostrar solo el encabezado seleccionado'
                  : 'Selecciona primero un encabezado',
                testId: 'eli-narrow',
              },
            inRealFile && {
              icon: 'fas fa-arrows-alt',
              label: 'Mover (flechas)',
              onClick: () => window.dispatchEvent(new CustomEvent('eli:move-menu')),
              testId: 'eli-move-arrows',
            },
            inRealFile && {
              icon: 'fas fa-align-left',
              label: 'Editar como texto plano',
              onClick: openRawEditor,
              testId: 'eli-raw-edit',
            },
            inRealFile && {
              icon: 'fas fa-file-pdf',
              label: 'Exportar a PDF',
              onClick: () => openPrintPreview(null),
              testId: 'eli-print-file',
            },
            {
              icon: 'far fa-copy',
              label: 'Ficheros principales',
              onClick: openFavorites,
              testId: 'eli-favorites-menu',
            },
            this.canOpenSplitView() && {
              icon: 'fas fa-columns',
              label: 'Dos columnas',
              onClick: () => this.openSplitView(),
              testId: 'eli-split-open',
            },
            {
              icon: 'fas fa-moon',
              label: 'Fases de la Luna',
              onClick: openMoonPhases,
              testId: 'eli-moon',
            },
            {
              icon: 'fas fa-gift',
              label: 'Novedades',
              onClick: this.handleChangelogClick,
              testId: 'eli-changelog',
            },
            {
              icon: 'fas fa-cogs',
              label: 'Ajustes',
              onClick: () => {
                this.handleSettingsClick();
                this.props.history.push('/settings');
              },
              testId: 'eli-settings',
            },
          ]
        : [];

      return (
        <div className="header-bar__actions">
          {!isAuthenticated && this.getPathRoot() !== 'sign_in' && (
            <Link to="/sign_in">
              <div className="header-bar__actions__item" title="Iniciar sesión">
                Iniciar sesión
              </div>
            </Link>
          )}

          {!isAuthenticated && (
            <ExternalLink href="https://github.com/JakimSareb/ORGanice">
              <i className="fab fa-github header-bar__actions__item" />
            </ExternalLink>
          )}

          {isAuthenticated && this.renderSplitCloseButton()}

          {isAuthenticated && inRealFile && narrowedHeaderId && (
            <button
              type="button"
              className="eli-widen-pill"
              onClick={() => this.props.org.widenHeader()}
              title="Ampliar (widen): volver a ver el fichero entero"
              data-testid="eli-widen"
            >
              <i className="fas fa-expand" />
              <span className="eli-widen-pill__text"> Ver todo</span>
            </button>
          )}

          {/* ORG Mode para Eli: sincronizar, en los dos modos */}
          {isAuthenticated && (inFile || inGtd || this.getPathRoot() === 'files') && (
            <i
              className={
                'fas fa-sync-alt header-bar__actions__item' +
                (online ? '' : ' header-bar__actions__item--disabled')
              }
              onClick={() => online && this.eliSyncNow()}
              title="Sincronizar ahora (s)"
              data-testid="eli-sync-btn"
              role="button"
            />
          )}

          {/* ORG Mode para Eli: paleta de comandos, siempre a mano */}
          {isAuthenticated && (
            <i
              className="fas fa-search header-bar__actions__item"
              onClick={openPalette}
              title="Paleta de comandos: buscar o hacer cualquier cosa (Ctrl+K)"
              data-testid="eli-palette-btn"
              role="button"
            />
          )}

          {inFile && !activeModalPage && (
            <i
              className={undoIconClassName}
              onClick={this.handleUndoClick}
              title="Deshacer"
              data-testid="eli-undo"
            />
          )}

          {isAuthenticated && !online && (
            <button
              className="eli-offline-pill"
              data-testid="eli-offline"
              title="Sin conexión: puedes seguir trabajando; los cambios se sincronizarán al volver la conexión"
              onClick={() =>
                window.alert(
                  'Sin conexión.\n\nPuedes seguir trabajando. En cuanto vuelva la conexión, la app ' +
                    'sincronizará con Dropbox los cambios pendientes.' +
                    (dirtyCount ? `\n\nFicheros con cambios pendientes: ${dirtyCount}.` : '') +
                    (getPersistPlainFiles()
                      ? `\n\n${offlineStatusText()}`
                      : '\n\nAtención: la copia local está desactivada (Ajustes → Usar sin conexión). ' +
                        'Si la app se cierra antes de recuperar la conexión, los cambios se pierden.')
                )
              }
            >
              <i className="fas fa-wifi" />
              <span className="eli-offline-pill__text"> Sin conexión</span>
              {dirtyCount ? ` · ${dirtyCount}` : ''}
            </button>
          )}

          {isAuthenticated && hasUnseenChangelog && (
            <i
              className="changelog-icon--has-unseen-changelog header-bar__actions__item fas fa-gift"
              onClick={this.handleChangelogClick}
              title="Novedades"
            />
          )}

          {isAuthenticated && (
            <EliMoreMenu
              items={moreItems}
              buttonClassName="header-bar__actions__item"
              testId="eli-more-top"
            />
          )}
        </div>
      );
    }
  }

  render() {
    const mode = this.getMode();
    const className = classNames('header-bar', {
      'header-bar--mode': !!mode,
      'header-bar--mode-docs': mode === 'docs',
      'header-bar--mode-gtd': mode === 'gtd',
      'header-bar--with-logo': this.getPathRoot() === '',
      'header-bar--file': !!this.getFilename() && !this.props.activeModalPage,
    });

    // The LP does not show the HeaderBar
    if (!isLandingPage()) {
      return (
        <div className={className}>
          {this.renderBackButton()}
          {this.renderTitle()}
          {this.renderActions()}
        </div>
      );
    }
    return null;
  }
}

const mapStateToProps = (state) => {
  return {
    isAuthenticated: state.syncBackend.get('isAuthenticated'),
    hasUnseenChangelog: state.base.get('hasUnseenChangelog'),
    activeModalPage: state.base.get('modalPageStack', List()).last(),
    shouldShowTitleInOrgFile: state.base.get('shouldShowTitleInOrgFile'),
    path: state.org.present.get('path'),
    narrowedHeaderId: state.org.present.getIn(
      ['files', state.org.present.get('path'), 'narrowedHeaderId'],
      null
    ),
    selectedHeaderId: state.org.present.getIn(
      ['files', state.org.present.get('path'), 'selectedHeaderId'],
      null
    ),
    isUndoEnabled: state.org.past.length > 0,
    isRedoEnabled: state.org.future.length > 0,
    syncBackendType: state.syncBackend.get('client') && state.syncBackend.get('client').type,
    online: state.base.get('online') !== false,
    dirtyCount: (state.org.present.get('files') || List()).filter((f) => f.get('isDirty')).size,
    loadedPaths: loadedPathsOf(state.org.present.get('files')),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    base: bindActionCreators(baseActions, dispatch),
    org: bindActionCreators(orgActions, dispatch),
    undo: bindActionCreators(undoActions, dispatch),
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(HeaderBar));
