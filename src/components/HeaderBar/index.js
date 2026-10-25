import { dailyShown } from '../../lib/gtd/gtd_strict';
import { isDocLocked, toggleDocLock, subscribeDocLock } from '../../lib/eli_doc_lock';
import { openRawEditor, openMoonPhases, openFavorites } from '../EliTools';
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
import { openShortcuts } from '../Gtd/GtdShortcutsHost';
import { fileDisplayName, windowTitleFor } from '../../lib/eli_app_name';
import { backToSettings } from '../EncryptionSettings';
import { getPersistPlainFiles } from '../../lib/eli_security';
import { rememberDoc, openDocuments, openGtdMode } from '../../lib/eli_mode';
import EliPomodoro from '../EliPomodoro';
import { openScratch } from '../../lib/eli_scratch';
import { openDiary } from '../../lib/eli_diary';
import { unseenCount, subscribeSyncLog, openSyncLog } from '../../lib/eli_sync_log';
import {
  getPomodoroState,
  subscribePomodoro,
  pomodoroToggle,
  pomodoroStop,
} from '../../lib/eli_pomodoro';
import { isNotesMode, toolOn, subscribeNotesMode, notesAgendaOn } from '../../lib/eli_notes_mode';
import { askPick } from '../../lib/eli_prompt';
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
import { applyMenuLayout } from '../../lib/eli_menu_layout';

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
    // (4.0) En el Modo Notas no hay GTD: solo el enlace para subir de carpeta
    if (isNotesMode()) {
      return (
        <div className="eli-mode-bar">
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
    this.eliUnsubNotes = subscribeNotesMode(() => this.forceUpdate());
    // (4.33) aviso ⚠ de errores de sincronización sin mirar
    this.eliUnsubSyncLog = subscribeSyncLog(() => this.forceUpdate());
    // (4.13) el Menú ☰ cambia «Iniciar/Parar pomodoro» solo cuando cambia el estado (no cada segundo)
    this.eliPomoStatus = getPomodoroState().status;
    this.eliUnsubPomo = subscribePomodoro((st) => {
      if (st.status !== this.eliPomoStatus) {
        this.eliPomoStatus = st.status;
        this.forceUpdate();
      }
    });
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
    if (this.eliUnsubNotes) this.eliUnsubNotes();
    if (this.eliUnsubPomo) this.eliUnsubPomo();
    if (this.eliUnsubSyncLog) this.eliUnsubSyncLog();
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

  // (4.04) Menú ☰ › Procesos: por bloques (Diarios / Puntuales / Periódicos). Los bloques
  // vacíos no salen. Desde Documentos, se abre la vista GTD y se lanza allí.
  processesMenu(inGtd) {
    const run = (cmd) => {
      if (inGtd) {
        window.dispatchEvent(new CustomEvent('eli:gtd', { detail: cmd }));
      } else {
        window.__eliGtdPending = cmd;
        openGtdMode();
      }
    };
    const blocks = [
      {
        heading: 'Diarios',
        id: 'daily',
        items: [
          {
            icon: 'fas fa-filter',
            label: 'Procesar Inbox',
            onClick: () => run({ process: true }),
            testId: 'eli-proc-inbox',
          },
          // (4.05) procesos diarios (tarjeta por pasos en GTD: components/Gtd/GtdDailyProcess)
          {
            icon: 'fas fa-sun',
            label: 'Planificar el día',
            onClick: () => run({ daily: 'plan' }),
            testId: 'eli-proc-plan',
            daily: 'plan',
          },
          {
            icon: 'fas fa-moon',
            label: 'Cerrar el día',
            onClick: () => run({ daily: 'close' }),
            testId: 'eli-proc-close',
            daily: 'close',
          },
          // (4.16) Revisión diaria oficial de Allen (siempre a la vista)
          {
            icon: 'fas fa-calendar-check',
            label: 'Revisión diaria',
            onClick: () => run({ daily: 'daily' }),
            testId: 'eli-proc-daily',
          },
          {
            icon: 'fas fa-bolt',
            label: '¿Qué hago ahora?',
            onClick: () => run({ daily: 'now' }),
            testId: 'eli-proc-now',
          },
          // (4.16) con «Allen estricto», Planificar/Cerrar el día solo si se activan en Ajustes
        ].filter((it) => !it.daily || dailyShown(it.daily)),
      },
      // (4.06) puntuales y periódicos (tarjeta por pasos en GTD: components/Gtd/GtdGuidedProcess)
      {
        heading: 'Puntuales',
        id: 'oneoff',
        items: [
          {
            icon: 'fas fa-box-open',
            label: 'Volcado mental',
            onClick: () => run({ guided: 'sweep' }),
            testId: 'eli-proc-sweep',
          },
          {
            icon: 'fas fa-drafting-compass',
            label: 'Planificar un proyecto nuevo',
            onClick: () => run({ guided: 'project' }),
            testId: 'eli-proc-project',
          },
          {
            icon: 'fas fa-unlock-alt',
            label: 'Aclarar un proyecto atascado',
            onClick: () => run({ guided: 'stuck' }),
            testId: 'eli-proc-stuck',
          },
        ],
      },
      {
        heading: 'Periódicos',
        id: 'periodic',
        items: [
          {
            icon: 'fas fa-clipboard-check',
            label: 'Revisión semanal',
            onClick: () => run({ review: true }),
            testId: 'eli-proc-review',
          },
          {
            icon: 'fas fa-hourglass-half',
            label: 'Repaso de Waiting',
            onClick: () => run({ guided: 'waiting' }),
            testId: 'eli-proc-waiting',
          },
          {
            icon: 'fas fa-cloud',
            label: 'Repaso de Someday/Maybe',
            onClick: () => run({ guided: 'someday' }),
            testId: 'eli-proc-someday',
          },
          {
            icon: 'fas fa-binoculars',
            label: 'Revisión de horizontes',
            onClick: () => run({ guided: 'horizons' }),
            testId: 'eli-proc-horizons',
          },
        ],
      },
    ];
    const items = [];
    blocks.forEach((b) => {
      if (!b.items.length) return;
      items.push({ heading: b.heading, testId: 'eli-proc-h-' + b.id });
      items.push(...b.items);
    });
    // (4.05) «fa-route» no existe en Font Awesome 5.1.1 (salía sin icono)
    return {
      icon: 'fas fa-project-diagram',
      label: 'Procesos',
      testId: 'eli-menu-processes',
      items,
    };
  }

  // (4.09) Menú ☰ › «Mostrar tareas con reloj activo»: buscador con esas tareas; al elegir una,
  // en GTD se va a ella (si no está en GTD, a su fichero) y en Documentos, a su cabecera
  async showRunningClocks(inGtd) {
    const list = this.props.org.eliRunningClocks() || [];
    const id = await askPick({
      title: 'Tareas con reloj activo',
      placeholder: 'Buscar…',
      items: list.map((c, i) => ({
        id: String(i),
        label: c.title || '(sin título)',
        hint: fileDisplayName(c.path),
      })),
      emptyText: 'No hay ningún reloj en marcha.',
    });
    if (id == null) return;
    const c = list[Number(id)];
    if (!c) return;
    if (inGtd) {
      window.dispatchEvent(
        new CustomEvent('eli:gtd', {
          detail: { openTask: { path: c.path, id: c.headerId }, orFile: true },
        })
      );
      return;
    }
    this.props.org.selectHeaderAndOpenParents(c.path, c.headerId, { widen: true });
    if (this.props.path !== c.path || this.getPathRoot() !== 'file') {
      this.props.history.push(`/file${c.path}`);
    }
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
      const inGtd = this.getPathRoot() === 'gtd';
      const inFile = isAuthenticated && !!path && !inGtd;
      const inRealFile = inFile && !isStaticFile(path);
      const { narrowedHeaderId, selectedHeaderId } = this.props;

      const notes = isNotesMode();
      const canBack = canGoBack() || (inRealFile && !!narrowedHeaderId);

      // (4.0) Arriba solo: Atrás · Adelante · Deshacer · Rehacer · nube · Menú. Lo de cada
      // cabecera está en la barra de abajo (EliDocBar); el resto, en el Menú.
      const tools = [
        toolOn('cal') && {
          icon: 'far fa-calendar-alt',
          label: 'Calendario',
          onClick: openCalendar,
          testId: 'eli-calendar-menu',
        },
        toolOn('calc') && {
          icon: 'fas fa-calculator',
          label: 'Calculadora',
          onClick: () => openCalculator(),
          testId: 'eli-calculator-menu',
        },
        toolOn('acom') && {
          icon: 'fas fa-users',
          label: 'Turnos de acomodadores',
          onClick: openAcomodadores,
          testId: 'eli-acomodadores',
        },
        toolOn('moon') && {
          icon: 'fas fa-moon',
          label: 'Fases de la Luna',
          onClick: openMoonPhases,
          testId: 'eli-moon',
        },
        // (4.13) Pomodoro: empezar desde aquí; con uno en marcha, el chip de arriba lo controla
        toolOn('pomo') &&
          (getPomodoroState().status === 'idle'
            ? {
                icon: 'fas fa-hourglass-half',
                label: 'Iniciar pomodoro',
                onClick: pomodoroToggle,
                testId: 'eli-pomodoro-menu',
              }
            : {
                icon: 'fas fa-stop',
                label: 'Parar el pomodoro',
                onClick: pomodoroStop,
                testId: 'eli-pomodoro-menu',
              }),
        // (3.05) líneas «- State …» sueltas → al cajón :LOGBOOK: (en el fichero abierto)
        !notes &&
          inRealFile && {
            icon: 'fas fa-history',
            label: 'Ordenar historial',
            onClick: () => this.props.org.eliTidyStateLog(),
            testId: 'eli-tidy-state-log',
          },
      ].filter(Boolean);
      const split = !notes && this.canOpenSplitView();
      // (4.01) «Buscar», la primera opción; «Ajustes», la última. (4.17) «Buscar (B)»: lo mismo
      // que la tecla B (en un documento, la búsqueda de cabeceras; en GTD, su buscador); la de
      // antes (paleta de comandos, Ctrl+K) sigue aparte como «Paleta de comandos»
      const moreItems = isAuthenticated
        ? [
            (inFile || inGtd) && {
              icon: 'fas fa-book eli-icon-book-search',
              label: 'Buscar (B)',
              onClick: () =>
                inGtd
                  ? window.dispatchEvent(new CustomEvent('eli:gtd', { detail: { search: true } }))
                  : this.props.base.activatePopup('search'),
              testId: 'eli-find-menu',
              menuId: 'find',
            },
            {
              icon: 'fas fa-search',
              label: 'Paleta de comandos',
              onClick: openPalette,
              testId: 'eli-palette-btn',
              menuId: 'search',
            },
            // (4.17) Capturar con plantilla (antes en la barra de abajo de Documentos; en GTD, la
            // tecla t). En el Modo Notas no sale (como antes en la barra)
            (inRealFile || inGtd) &&
              !notes && {
                icon: 'fas fa-inbox',
                label: inGtd ? 'Capturar con plantilla (T)' : 'Capturar con plantilla (C)',
                onClick: () =>
                  inGtd
                    ? window.dispatchEvent(
                        new CustomEvent('eli:gtd', { detail: { capture: true } })
                      )
                    : window.dispatchEvent(new CustomEvent('eli:capture-menu')),
                testId: 'eli-capture-menu',
                menuId: 'capture',
              },
            // (4.01) la agenda (antes solo con la tecla «a»); (4.04) la segunda, también en GTD.
            // En el Modo Notas no sale
            // (4.09) en el Modo Notas también, salvo que se apague en Ajustes › Modo Notas
            (inFile || inGtd) &&
              (!notes || notesAgendaOn()) && {
                icon: 'far fa-calendar-check',
                label: 'Agenda',
                menuId: 'agenda',
                onClick: () =>
                  inGtd
                    ? window.dispatchEvent(new CustomEvent('eli:gtd', { detail: { agenda: true } }))
                    : this.props.base.activatePopup('agenda'),
                testId: 'eli-agenda-menu',
              },
            // (4.23) bloc de notas rápido (scratch.org junto al de entrada)
            {
              icon: 'fas fa-sticky-note',
              label: 'Bloc de notas rápido',
              onClick: openScratch,
              testId: 'eli-scratch-menu',
              menuId: 'scratch',
            },
            // (4.26) diario (pages/diari-AAAA.org junto al de entrada); también en el Modo Notas
            {
              icon: 'fas fa-book-open',
              label: 'Diario de hoy',
              onClick: () => openDiary(),
              testId: 'eli-diary-menu',
              menuId: 'diary',
            },
            // (4.09) con algún reloj en marcha: la lista de esas tareas (al tocar una, va a ella)
            this.props.activeClocks > 0 && {
              icon: 'far fa-clock',
              label: 'Mostrar tareas con reloj activo',
              onClick: () => this.showRunningClocks(inGtd),
              testId: 'eli-running-clocks',
              menuId: 'clocks',
            },
            {
              icon: 'far fa-folder-open',
              label: 'Mis ficheros',
              testId: 'eli-menu-file',
              menuId: 'files',
              items: [
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
                // (3.04) el candado (modo lectura)
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
                !notes &&
                  inRealFile && {
                    icon: 'fas fa-align-left',
                    label: 'Editar como texto plano',
                    onClick: openRawEditor,
                    testId: 'eli-raw-edit',
                  },
              ],
            },
            inRealFile && {
              icon: 'far fa-eye',
              label: 'Vista',
              testId: 'eli-menu-view',
              menuId: 'view',
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
                split && {
                  icon: 'fas fa-columns',
                  label: 'Dos columnas',
                  onClick: () => this.openSplitView(),
                  testId: 'eli-split-open',
                },
              ],
            },
            !inRealFile &&
              split && {
                icon: 'fas fa-columns',
                label: 'Dos columnas',
                onClick: () => this.openSplitView(),
                testId: 'eli-split-open',
                menuId: 'split',
              },
            tools.length > 0 && {
              icon: 'fas fa-toolbox',
              label: 'Herramientas',
              testId: 'eli-menu-tools',
              menuId: 'tools',
              items: tools,
            },
            // (4.04) los procesos guiados de GTD, por tipo (aunque su sección del menú de GTD
            // esté apagada). En el Modo Notas no salen. (4.09) Justo debajo de Herramientas
            !notes && { ...this.processesMenu(inGtd), menuId: 'processes' },
            {
              icon: 'far fa-question-circle',
              label: 'Ayuda',
              testId: 'eli-menu-help',
              menuId: 'help',
              items: [
                {
                  icon: 'fas fa-book',
                  label: 'Manual de uso',
                  onClick: this.handleHelpClick,
                  testId: 'eli-help',
                },
                {
                  icon: 'fas fa-gift',
                  label: 'Novedades',
                  onClick: this.handleChangelogClick,
                  testId: 'eli-changelog',
                },
                // (4.04) dentro de Ayuda; siempre la ventana de atajos (también en Documentos)
                {
                  icon: 'far fa-keyboard',
                  label: 'Atajos de teclado',
                  onClick: () =>
                    inGtd
                      ? window.dispatchEvent(
                          new CustomEvent('eli:gtd', { detail: { shortcuts: true } })
                        )
                      : openShortcuts(),
                  testId: inGtd ? 'gtd-shortcuts-btn' : 'eli-shortcuts',
                },
              ],
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

          {/* ORG Mode para Eli (2.15): atrás / adelante (como en el navegador). (4.0) Con una
              cabecera «vista sola» (narrow), Atrás vuelve al fichero entero */}
          {isAuthenticated && (inFile || inGtd || this.getPathRoot() === 'files') && (
            <>
              <i
                className={
                  'fas fa-arrow-left header-bar__actions__item eli-nav-btn' +
                  (canBack ? '' : ' header-bar__actions__item--disabled')
                }
                onClick={() =>
                  inRealFile && narrowedHeaderId
                    ? this.props.org.widenHeaderToTop()
                    : goBack(this.props.history)
                }
                title={
                  inRealFile && narrowedHeaderId
                    ? 'Atrás: volver al fichero entero'
                    : 'Atrás (Alt+←)'
                }
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

          {/* (4.0) deshacer / rehacer: en los documentos, arriba (antes en la barra de abajo) */}
          {isAuthenticated && inFile && (
            <>
              <i
                className={
                  'fas fa-undo header-bar__actions__item' +
                  (isUndoEnabled ? '' : ' header-bar__actions__item--disabled')
                }
                onClick={this.handleUndoClick}
                title="Deshacer"
                aria-label="Deshacer"
                aria-disabled={!isUndoEnabled}
                data-testid="eli-undo"
                role="button"
              />
              <i
                className={
                  'fas fa-redo header-bar__actions__item' +
                  (isRedoEnabled ? '' : ' header-bar__actions__item--disabled')
                }
                onClick={this.handleRedoClick}
                title="Rehacer"
                aria-label="Rehacer"
                aria-disabled={!isRedoEnabled}
                data-testid="eli-redo"
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

          {/* (4.33) errores de sincronización sin mirar: abre el registro */}
          {isAuthenticated && unseenCount() > 0 && (
            <i
              className="fas fa-exclamation-triangle header-bar__actions__item eli-sync-warn"
              onClick={openSyncLog}
              title="Errores de sincronización: ver el registro"
              aria-label="Errores de sincronización"
              data-testid="eli-sync-warn"
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

          {/* (3.04) en los documentos no sale el regalo (Novedades está en el Menú › Ayuda) */}
          {isAuthenticated && hasUnseenChangelog && !inFile && (
            <i
              className="changelog-icon--has-unseen-changelog header-bar__actions__item fas fa-gift"
              onClick={this.handleChangelogClick}
              title="Novedades"
            />
          )}

          {isAuthenticated && toolOn('pomo') && <EliPomodoro />}

          {isAuthenticated && (
            <EliMoreMenu
              items={applyMenuLayout(moreItems.filter(Boolean))}
              icon="fas fa-bars"
              title={'Menú' + (this.props.activeClocks ? ' · hay un reloj en marcha' : '')}
              buttonClassName={
                'header-bar__actions__item' + (this.props.activeClocks ? ' eli-search-clock' : '')
              }
              badge={this.props.activeClocks ? 'far fa-clock' : null}
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
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(HeaderBar));
