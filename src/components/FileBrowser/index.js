import React, { useEffect } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Link } from 'react-router-dom';

import ActionDrawer from './components/ActionDrawer';

import './stylesheet.css';

import classNames from 'classnames';

import * as syncBackendActions from '../../actions/sync_backend';
import { toggleEliFavoriteFile } from '../../actions/org';
import { favoritePaths } from '../EliTools';
import { shortDate } from '../../lib/eli_layout';

const FileBrowser = ({
  path,
  listing,
  hasMore,
  isLoadingMore,
  syncBackendType,
  syncBackend,
  favorites,
  toggleFavorite,
  // INFO: This was required back when we had Google Drive support.
  // Leaving it here in case another sync backend requires it.
  // additionalSyncBackendState,
}) => {
  useEffect(() => syncBackend.getDirectoryListing(path), [syncBackend, path]);

  const handleLoadMoreClick = () => syncBackend.loadMoreDirectoryListing();

  const getParentDirectoryPath = () => {
    switch (syncBackendType) {
      case 'Dropbox':
      case 'GitLab':
      case 'WebDAV':
      case 'LocalFolder':
        const pathParts = path.split('/');
        return pathParts.slice(0, pathParts.length - 1).join('/');
      default:
        return null;
    }
  };

  const isTopLevelDirectory = path === '';
  const dirs = (listing || []).filter((f) => f.get('isDirectory'));
  const files = (listing || []).filter((f) => !f.get('isDirectory'));

  return (
    <div className="file-browser-container">
      {(syncBackendType === 'Dropbox' || syncBackendType === 'LocalFolder') && (
        <h3 className="file-browser__header">Carpeta: {isTopLevelDirectory ? '/' : path}</h3>
      )}

      <ActionDrawer />

      {/* (4.29) carpetas arriba en rejilla (tarjetas), ficheros debajo en lista */}
      {(!isTopLevelDirectory || dirs.length > 0) && (
        <>
          <div className="eli-fb__label">Carpetas</div>
          <div className="eli-fb__folders" data-testid="eli-fb-folders">
            {!isTopLevelDirectory && (
              <Link to={`/files${getParentDirectoryPath()}`} className="eli-fb__folder is-up">
                <i className="fas fa-level-up-alt eli-fb__folder-icon" />
                <span className="eli-fb__folder-name">..</span>
              </Link>
            )}
            {dirs.map((file) => (
              <Link
                to={`/files${file.get('path')}`}
                key={file.get('id')}
                className="eli-fb__folder"
                data-testid="eli-fb-folder"
              >
                <i className="fas fa-folder eli-fb__folder-icon" />
                <span className="eli-fb__folder-name">{file.get('name')}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {files.length > 0 && <div className="eli-fb__label">Ficheros</div>}
      <ul className="file-browser__file-list">
        {files.map((file) => {
          const isBackupFile = file.get('name').endsWith('.organice-bak');
          const isOrgFile = /\.org(\.gpg|\.asc)?$/.test(file.get('name'));
          const isEncryptedFile = /\.(gpg|asc)$/.test(file.get('name'));
          // (3.13) guiones Fountain: se abren con su propio editor
          const isFountain = /\.fountain$/i.test(file.get('name'));
          const isSettingsFile = file.get('name') === '.organice-config.json';

          const iconClass = classNames('file-browser__file-list__icon fas', {
            'fa-file-alt': !isBackupFile && !isSettingsFile && !isFountain,
            'fa-film': isFountain,
            'file-browser__file-list__icon--fountain': isFountain,
            'file-browser__file-list__icon--not-org': !isOrgFile,
            'fa-copy': isBackupFile,
            'fa-cogs': isSettingsFile,
          });
          const modified = shortDate(file.get('modified'));

          return (
            <Link
              to={`${isFountain ? '/fountain' : '/file'}${file.get('path')}`}
              key={file.get('id')}
            >
              <li className="file-browser__file-list__element eli-fb__file">
                <i className={iconClass} />
                <span className="eli-fb__file-name">{file.get('name')}</span>
                {isEncryptedFile && <i className="fas fa-lock eli-fb__lock" />}
                {modified && <span className="eli-fb__date">{modified}</span>}
                {isOrgFile && (
                  <i
                    className={`${
                      favorites.includes(file.get('path')) ? 'fas is-on' : 'far'
                    } fa-copy eli-file-fav`}
                    title="Fichero principal (acceso directo con el botón de hojas)"
                    data-testid="eli-file-fav"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite(file.get('path'));
                    }}
                  />
                )}
              </li>
            </Link>
          );
        })}

        {hasMore &&
          (isLoadingMore ? (
            <li className="file-browser__file-list__loading-more-container">
              <i className="fas fa-spinner fa-lg fa-spin" />
            </li>
          ) : (
            <li
              className="file-browser__file-list__element file-browser__file-list__element--load-more-row"
              onClick={handleLoadMoreClick}
            >
              Cargar más…
            </li>
          ))}
      </ul>
    </div>
  );
};

const mapStateToProps = (state) => {
  const currentFileBrowserDirectoryListing = state.syncBackend.get(
    'currentFileBrowserDirectoryListing'
  );
  return {
    syncBackendType: state.syncBackend.get('client').type,
    favorites: favoritePaths(state.org.present.get('fileSettings')),
    listing: !!currentFileBrowserDirectoryListing
      ? currentFileBrowserDirectoryListing.get('listing')
      : null,
    hasMore:
      !!currentFileBrowserDirectoryListing && currentFileBrowserDirectoryListing.get('hasMore'),
    isLoadingMore:
      !!currentFileBrowserDirectoryListing &&
      currentFileBrowserDirectoryListing.get('isLoadingMore'),
    additionalSyncBackendState:
      !!currentFileBrowserDirectoryListing &&
      currentFileBrowserDirectoryListing.get('additionalSyncBackendState'),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    syncBackend: bindActionCreators(syncBackendActions, dispatch),
    toggleFavorite: (path) => dispatch(toggleEliFavoriteFile(path)),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(FileBrowser);
