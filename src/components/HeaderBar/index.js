import { isDocLocked, toggleDocLock, subscribeDocLock } from '../../lib/eli_doc_lock';
import { openRawEditor, openPrintPreview, openMoonPhases, openFavorites } from '../EliTools';
import { openAcomodadores } from '../EliAcomodadores';
import { openPalette } from '../../lib/eli_palette';
import { openCalendar } from '../EliCalendar';
import { openCalculator } from '../EliCalculator';
import {
  installNavHistory,
  canGoBack,
  canGoForward,
  goBack,
  goForward,
} from '../../lib/eli_nav_history';
import { shouldIgnoreOrganiceHotkey } from '../../lib/eli_hotkeys';
import { offlineStatusText } from '../../actions/eli_offline';
import EliMoreMenu from '../EliMoreMenu';
import { exportOrg } from '../../lib/export_org';
import { shareContent } from '../../lib/share_utils';
import { showMessage } from '../../lib/eli_prompt';
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
    if (root === 'files' || root === 'fountain') return 'docs';
    if (root === 'file' && !isStaticFile(this.props.path)) return 'docs';
    return null;
  }

  // Se recuerda dónde se está en Documentos para volver ahí desde GTD
  rememberDocument() {
    const { location, path, selectedHeaderId, narrowedHeaderId, isAuthenticated } = this.props;
    if (!isAuthenticated) return;
    const root = this.getPathRoot();
    if (root === 'files' || root === 'fountain') {
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
    if (root === 'file' || root === 'fountain') {
      const filePath = pathname.substr(root.length + 1).replace(/\/$/, '');
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
    window.addEventListener('eli:nav-history', this.eliNavChanged);
    window.addEventListener('keydown', this.eliNavKey);
    installNavHistory(this.props.history);
    // (3.04) el candado está en ⋯ › Fichero; el nombre del fichero lo muestra cuando está puesto
    this.eliUnsubLock = subscribeDocLock(() => this.forceUpdate());
  }

  // (2.16) Atrás / adelante con el teclado: Alt+← / Alt+→ (y ⌘[ / ⌘] en el Mac), como en el
  // navegador; nunca mientras se escribe (Alt+← mueve por palabras)
  eliNavKey = (e) => {
    if (e.defaultPrevented || !this.props.isAuthenticated) return;
    const t = e.target;
    const editable =
      t &&
      (t.isContentEditable ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        (t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/i.test(t.type || '')));
    if (editable) return;
    // Con una ventana abierta (confirmación, editor…), no se cambia de página debajo
    if (
      shouldIgnoreOrganiceHotkey(e, null) ||
      document.querySelector('.drawer, .eli-cal__overlay, .eli-calc__overlay')
    )
      return;
    let dir = 0;
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') dir = -1;
      else if (e.key === 'ArrowRight') dir = 1;
    } else if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
      if (e.code === 'BracketLeft') dir = -1;
      else if (e.code === 'BracketRight') dir = 1;
    }
    if (!dir) return;
    e.preventDefault();
    if (dir < 0) goBack(this.props.history);
    if (dir > 0) goForward(this.props.history);
  };

  componentWillUnmount() {
    window.removeEventListener('eli:split-open', this.eliOpenSplit);
    window.removeEventListener('eli:nav-history', this.eliNavChanged);
    window.removeEventListener('keydown', this.eliNavKey);
    if (this.eliUnsubLock) this.eliUnsubLock();
  }

  eliNavChanged = () => this.forceUpdate();

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
        {isDocLocked() && !isStaticFile(this.props.path) && (
          <i
            className="fas fa-lock eli-title-lock eli-title-doclock"
            title="Candado puesto (solo lectura). Se quita en ⋯ › Fichero"
            data-testid="eli-doc-locked-badge"
          />
        )}
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
          onClick={() => this.props.org.widenHeaderToTop()}
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
      const inGtd = this.getPathRoot() === 'gtd';
      const inFile = isAuthenticated && !!path && !inGtd;
      const inRealFile = inFile && !isStaticFile(path);
      const { narrowedHeaderId, selectedHeaderId } = this.props;

      // ORG Mode para Eli: a la vista solo lo de cada día; el resto en «⋯».
      // (3.03) Lo que afecta al documento entero, agrupado en submenús verticales: Vista, Fichero,
      // Exportar y Herramientas. Lo de cada encabezado está en la barra flotante (EliDocBar).
      // Buscar: una sola lupa, arriba (la paleta; desde ella, «Buscar en el fichero»).
      const tools = [
        {
          icon: 'far fa-calendar-alt',
          label: 'Calendario',
          onClick: openCalendar,
          testId: 'eli-calendar-menu',
        },
        {
          icon: 'fas fa-calculator',
          label: 'Calculadora',
          onClick: () => openCalculator(),
          testId: 'eli-calculator-menu',
        },
        {
          icon: 'fas fa-users',
          label: 'Turnos de acomodadores',
          onClick: openAcomodadores,
          testId: 'eli-acomodadores',
        },
        {
          icon: 'fas fa-moon',
          label: 'Fases de la Luna',
          onClick: openMoonPhases,
          testId: 'eli-moon',
        },
        // (3.05) líneas «- State …» sueltas → al cajón :LOGBOOK: (en el fichero abierto)
        inRealFile && {
          icon: 'fas fa-history',
          label: 'Ordenar historial',
          onClick: () => this.props.org.eliTidyStateLog(),
          testId: 'eli-tidy-state-log',
        },
        // (2.16) en la vista GTD, la ventana de atajos va aquí (antes, un botón en la lista)
        inGtd && {
          icon: 'far fa-keyboard',
          label: 'Atajos de teclado (k)',
          onClick: () =>
            window.dispatchEvent(new CustomEvent('eli:gtd', { detail: { shortcuts: true } })),
          testId: 'gtd-shortcuts-btn',
        },
      ];
      const moreItems = isAuthenticated
        ? [
            inFile && {
              icon: 'fas fa-redo',
              label: 'Rehacer',
              onClick: this.handleRedoClick,
              disabled: !isRedoEnabled,
              testId: 'eli-redo',
            },
            inRealFile && {
              icon: 'far fa-eye',
              label: 'Vista',
              testId: 'eli-menu-view',
              items: [
                {
                  icon: 'fas fa-angle-double-up',
                  label: 'Contraer todas las cabeceras',
                  onClick: () => this.props.org.eliSetAllHeadersOpened(false),
                  testId: 'eli-collapse-all',
                },
                {
                  icon: 'fas fa-angle-double-down',
                  label: 'Expandir todas las cabeceras',
                  onClick: () => this.props.org.eliSetAllHeadersOpened(true),
                  testId: 'eli-expand-all',
                },
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
                this.canOpenSplitView() && {
                  icon: 'fas fa-columns',
                  label: 'Dos columnas',
                  onClick: () => this.openSplitView(),
                  testId: 'eli-split-open',
                },
              ],
            },
            !inRealFile &&
              this.canOpenSplitView() && {
                icon: 'fas fa-columns',
                label: 'Dos columnas',
                onClick: () => this.openSplitView(),
                testId: 'eli-split-open',
              },
            {
              icon: 'far fa-folder-open',
              label: 'Fichero',
              testId: 'eli-menu-file',
              items: [
                // (3.04) también en los documentos (ya no hay botón arriba)
                {
                  icon: 'far fa-copy',
                  label: 'Ficheros principales',
                  onClick: openFavorites,
                  testId: 'eli-favorites-menu',
                },
                {
                  icon: 'far fa-folder-open',
                  label: 'Explorador de ficheros',
                  onClick: () => this.props.history.push('/files'),
                  testId: 'eli-files-menu',
                },
                // (3.04) el candado (modo lectura), antes un botón de la barra de arriba
                inRealFile && {
                  icon: isDocLocked() ? 'fas fa-lock-open' : 'fas fa-lock',
                  label: isDocLocked()
                    ? 'Quitar el candado (volver a editar)'
                    : 'Poner el candado (solo lectura)',
                  onClick: () => {
                    // si se estaba escribiendo, se guarda antes (como al tocar fuera)
                    const el = document.activeElement;
                    if (!isDocLocked() && el && el.blur) el.blur();
                    toggleDocLock();
                  },
                  testId: 'eli-doc-lock',
                },
                inRealFile && {
                  icon: 'fas fa-align-left',
                  label: 'Editar como texto plano',
                  onClick: openRawEditor,
                  testId: 'eli-raw-edit',
                },
              ],
            },
            inRealFile && {
              icon: 'fas fa-file-export',
              label: 'Exportar',
              testId: 'eli-menu-export',
              items: [
                {
                  icon: 'fas fa-file-pdf',
                  label: 'Exportar a PDF',
                  onClick: () => openPrintPreview(null),
                  testId: 'eli-print-file',
                },
                {
                  icon: 'fas fa-share',
                  label: 'Compartir / correo',
                  onClick: () => this.props.eliExportFile('share'),
                  testId: 'eli-share-file',
                },
                {
                  icon: 'far fa-clipboard',
                  label: 'Copiar el texto Org',
                  onClick: () => this.props.eliExportFile('copy'),
                  testId: 'eli-copy-file',
                },
              ],
            },
            {
              icon: 'fas fa-toolbox',
              label: 'Herramientas',
              testId: 'eli-menu-tools',
              items: tools,
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
              onClick={() => this.props.org.widenHeaderToTop()}
              title="Ampliar (widen): volver a ver el fichero entero"
              data-testid="eli-widen"
            >
              <i className="fas fa-expand" />
              <span className="eli-widen-pill__text"> Ver todo</span>
            </button>
          )}

          {/* ORG Mode para Eli (2.15): atrás / adelante (como en el navegador) */}
          {isAuthenticated && (inFile || inGtd || this.getPathRoot() === 'files') && (
            <>
              <i
                className={
                  'fas fa-arrow-left header-bar__actions__item eli-nav-btn' +
                  (canGoBack() ? '' : ' header-bar__actions__item--disabled')
                }
                onClick={() => goBack(this.props.history)}
                title="Atrás (Alt+←)"
                aria-label="Atrás"
                data-testid="eli-nav-back"
                role="button"
              />
              <i
                className={
                  'fas fa-arrow-right header-bar__actions__item eli-nav-btn' +
                  (canGoForward() ? '' : ' header-bar__actions__item--disabled')
                }
                onClick={() => goForward(this.props.history)}
                title="Adelante (Alt+→)"
                aria-label="Adelante"
                data-testid="eli-nav-forward"
                role="button"
              />
            </>
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

          {isAuthenticated && (
            <i
              className={
                'fas fa-search header-bar__actions__item' +
                (this.props.activeClocks ? ' eli-search-clock' : '')
              }
              onClick={openPalette}
              title={
                'Buscar: ficheros, tareas, etiquetas o acciones (Ctrl+Espacio)' +
                (this.props.activeClocks ? ' · hay un reloj en marcha' : '')
              }
              data-testid="eli-palette-btn"
              role="button"
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

          {/* (3.04) en los documentos, arriba solo atrás/adelante, sincronizar, lupa y ⋯ */}
          {isAuthenticated && hasUnseenChangelog && !inFile && (
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
    // (3.03) la lupa de arriba se pone naranja si hay un reloj en marcha (antes, la de abajo)
    activeClocks: (state.org.present.get('files') || List()).reduce(
      (n, f) => n + (typeof f.get('activeClocks') === 'number' ? f.get('activeClocks') : 0),
      0
    ),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    base: bindActionCreators(baseActions, dispatch),
    org: bindActionCreators(orgActions, dispatch),
    undo: bindActionCreators(undoActions, dispatch),
    // (3.03) Exportar el fichero abierto: compartir (correo…) o copiar su texto Org
    eliExportFile: (how) =>
      dispatch((_d, getState) => {
        const st = getState();
        const p = st.org.present.get('path');
        const f = st.org.present.getIn(['files', p]);
        if (!f || !f.get('headers')) return;
        const text = exportOrg({
          headers: f.get('headers'),
          linesBeforeHeadings: f.get('linesBeforeHeadings') || List(),
          dontIndent: st.base.get('eliIndentOnExport') !== true,
        });
        const name = (p || '').split('/').pop();
        if (how === 'share') {
          shareContent({ title: name, text });
          return;
        }
        Promise.resolve()
          .then(() => navigator.clipboard.writeText(text))
          .then(
            () => showMessage('Copiado', `El texto de «${name}» está en el portapapeles.`),
            () =>
              showMessage('No se ha podido copiar', 'El navegador no deja usar el portapapeles.')
          );
      }),
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(HeaderBar));
