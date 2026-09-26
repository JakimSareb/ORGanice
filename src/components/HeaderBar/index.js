import { openRawEditor, openPrintPreview, openMoonPhases } from '../EliTools';
import { fileDisplayName, windowTitleFor } from '../../lib/eli_app_name';
import { backToSettings } from '../EncryptionSettings';
import { getPersistPlainFiles } from '../../lib/eli_security';
import { STATIC_FILE_PREFIX as ELI_STATIC_PREFIX } from '../../lib/org_utils';
const isStaticFile = (p) => !p || p.startsWith(ELI_STATIC_PREFIX);
import React, { PureComponent, Fragment } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { isLandingPage } from '../../util/misc';

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

  componentDidMount() {
    this.updateWindowTitle();
  }

  componentDidUpdate() {
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
        return titleContainerWithText('Ejemplo');
      default:
    }

    switch (this.getPathRoot()) {
      case 'sample':
        return titleContainerWithText('Ejemplo');
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
      const redoIconClassName = classNames('fas fa-redo header-bar__actions__item', {
        'header-bar__actions__item--disabled': !isRedoEnabled,
      });

      const settingsIconClassName = classNames('fas fa-cogs header-bar__actions__item');

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
            <ExternalLink href="https://github.com/200ok-ch/organice">
              <i className="fab fa-github header-bar__actions__item" />
            </ExternalLink>
          )}

          {isAuthenticated && this.getPathRoot() !== 'gtd' && (
            <Link to="/gtd" data-testid="eli-open-gtd">
              <i
                className="fas fa-tasks header-bar__actions__item"
                title="Vista GTD (tipo Nirvana)"
              />
            </Link>
          )}

          {isAuthenticated && !activeModalPage && !!path && this.getPathRoot() !== 'gtd' && (
            <Fragment>
              <i className={undoIconClassName} onClick={this.handleUndoClick} title="Deshacer" />
              <i className={redoIconClassName} onClick={this.handleRedoClick} title="Rehacer" />
              {!isStaticFile(path) && (
                <Fragment>
                  {this.renderNarrowButton()}
                  <i
                    className="fas fa-align-left header-bar__actions__item"
                    onClick={openRawEditor}
                    title="Editar como texto plano"
                    data-testid="eli-raw-edit"
                  />
                  <i
                    className="fas fa-file-pdf header-bar__actions__item"
                    onClick={() => openPrintPreview(null)}
                    title="Exportar el fichero a PDF"
                    data-testid="eli-print-file"
                  />
                </Fragment>
              )}
            </Fragment>
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
                      ? ''
                      : '\n\nAtención: la copia local está desactivada (Ajustes → Seguridad y cifrado). ' +
                        'Si cierras la app antes de recuperar la conexión, los cambios se pierden.')
                )
              }
            >
              <i className="fas fa-wifi" />
              <span className="eli-offline-pill__text"> Sin conexión</span>
              {dirtyCount ? ` · ${dirtyCount}` : ''}
            </button>
          )}

          {isAuthenticated && (
            <i
              className="fas fa-moon header-bar__actions__item"
              onClick={openMoonPhases}
              title="Fases de la Luna"
              data-testid="eli-moon"
            />
          )}

          {isAuthenticated && (
            <div>
              {hasUnseenChangelog && (
                <i
                  className="changelog-icon--has-unseen-changelog header-bar__actions__item fas fa-gift"
                  onClick={this.handleChangelogClick}
                  title="Novedades"
                />
              )}
              <Link to="/settings" onClick={this.handleSettingsClick}>
                <i className={settingsIconClassName} title="Ajustes" />
              </Link>
            </div>
          )}
        </div>
      );
    }
  }

  render() {
    const className = classNames('header-bar', {
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
