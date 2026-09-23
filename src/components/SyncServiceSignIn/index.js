/* global process */

import React, { PureComponent, useState } from 'react';

import './stylesheet.css';

import DropboxLogo from 'url:./dropbox.svg';
import GitLabLogo from 'url:./gitlab.svg';

import { persistField } from '../../util/settings_persister';
import {
  createGitlabOAuth,
  gitLabProjectIdFromURL,
} from '../../sync_backend_clients/gitlab_sync_backend_client';

import { DropboxAuth } from 'dropbox';
import {
  getDropboxClientId,
  setDropboxClientId,
  getBuiltInDropboxClientId,
  getCustomDropboxClientId,
} from '../../lib/dropbox_client_id';
import { appRootUrl } from '../../lib/base_path';
import _ from 'lodash';

// WebDAV y GitLab quedan bloqueados por la política de seguridad (solo Dropbox); se conservan
// los componentes de organice por si se reactivan.
// eslint-disable-next-line no-unused-vars
function WebDAVForm() {
  const [isVisible, setIsVisible] = useState(false);
  const toggleVisible = () => setIsVisible(!isVisible);
  const [url, setUrl] = useState(process.env.REACT_APP_WEBDAV_URL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div id="webdavLogin">
      <h2>
        <a href="#webdav" onClick={toggleVisible} style={{ textDecoration: 'none' }}>
          WebDAV
        </a>
      </h2>
      {isVisible && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              persistField('authenticatedSyncService', 'WebDAV');
              persistField('webdavEndpoint', url);
              persistField('webdavUsername', username);
              persistField('webdavPassword', password);
              window.location = appRootUrl();
            }}
          >
            <p>
              <label htmlFor="input-webdav-url">URL:</label>
              <input
                id="input-webdav-url"
                name="url"
                type="url"
                value={url}
                className="textfield"
                onChange={(e) => {
                  setUrl(e.target.value);
                }}
              />
            </p>
            <p>
              <label htmlFor="input-webdav-user">Username:</label>
              <input
                id="input-webdav-user"
                type="text"
                className="textfield"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                }}
              />
            </p>
            <p>
              <label htmlFor="input-webdav-password">Password:</label>
              <input
                id="input-webdav-password"
                type="password"
                className="textfield"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            </p>
            <input type="submit" value="Sign-in" />
          </form>
          <p>
            Please make sure your WebDAV backend meets the requirements as documented{' '}
            <a
              href="https://organice.200ok.ch/documentation.html#faq_webdav"
              target="_blank"
              rel="noopener noreferrer"
            >
              here
            </a>
            , especially{' '}
            <a
              href="https://organice.200ok.ch/documentation.html#webdav_cors"
              target="_blank"
              rel="noopener noreferrer"
            >
              CORS
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function GitLab() {
  const [isVisible, setIsVisible] = useState(false);
  const toggleVisible = () => setIsVisible(!isVisible);

  const defaultProject = 'https://gitlab.com/your/project';
  const [project, setProject] = useState(defaultProject);
  const handleSubmit = (evt) => {
    evt.preventDefault();
    const projectId = gitLabProjectIdFromURL(project);
    if (projectId) {
      persistField('authenticatedSyncService', 'GitLab');
      persistField('gitLabProject', projectId);
      createGitlabOAuth().fetchAuthorizationCode();
    } else {
      alert('Project does not appear to be a valid gitlab.com URL');
    }
  };

  return (
    <>
      <a href="#gitlab" onClick={toggleVisible}>
        <img src={GitLabLogo} alt="GitLab logo" />
      </a>
      {isVisible && (
        <form onSubmit={handleSubmit}>
          <p>
            <label htmlFor="input-gitlab-project">Project:</label>
            <input
              id="input-gitlab-project"
              type="url"
              className="textfield"
              placeholder={defaultProject}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </p>
          <input type="submit" value="Sign-in" />
        </form>
      )}
    </>
  );
}

export default class SyncServiceSignIn extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, ['handleDropboxClick']);
  }

  handleDropboxClick() {
    let clientId = getDropboxClientId();
    if (!clientId) {
      const input = document.getElementById('eli-dropbox-client-id');
      clientId = input ? input.value.trim() : '';
      if (!clientId) {
        if (input) input.focus();
        return;
      }
      setDropboxClientId(clientId);
    }
    persistField('authenticatedSyncService', 'Dropbox');
    const REDIRECT_URI = appRootUrl();

    const dbxAuth = new DropboxAuth({
      clientId,
      fetch: fetch.bind(window),
    });

    dbxAuth
      .getAuthenticationUrl(REDIRECT_URI, undefined, 'code', 'offline', undefined, undefined, true)
      .then((authUrl) => {
        persistField('codeVerifier', dbxAuth.codeVerifier);
        window.location.href = authUrl;
      })
      .catch((error) => console.error(error));
  }

  render() {
    return <EliDropboxSignIn onConnect={this.handleDropboxClick} />;
  }
}

// ORG Mode para Eli: pantalla de acceso con Dropbox (en español), con instrucciones paso a paso
// para crear la app de Dropbox cuando la app no trae una App key incluida.
function EliDropboxSignIn({ onConnect }) {
  const builtIn = getBuiltInDropboxClientId();
  const [showAdvanced, setShowAdvanced] = useState(!builtIn || !!getCustomDropboxClientId());
  const [showGuide, setShowGuide] = useState(!builtIn);
  const [copied, setCopied] = useState(false);
  const redirect = appRootUrl();

  const copy = () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(redirect).then(done, () => {});
    }
  };

  return (
    <div className="sync-service-sign-in-container eli-signin">
      <h2 className="eli-signin__title">Conectar con Dropbox</h2>
      <p className="sync-service-sign-in__help-text">
        La app lee y guarda tus ficheros .org directamente en tu Dropbox. Se abrirá la web de
        Dropbox para que autorices el acceso; solo hay que hacerlo una vez en cada dispositivo y la
        app queda vinculada.
      </p>

      <div className="sync-service-container">
        <a href="#dropbox" onClick={onConnect} data-testid="eli-dropbox-connect">
          <img src={DropboxLogo} alt="Conectar con Dropbox" className="dropbox-logo" />
        </a>
      </div>

      {builtIn && (
        <button className="eli-signin__link" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced
            ? 'Ocultar opciones avanzadas'
            : 'Opciones avanzadas (usar otra app de Dropbox)'}
        </button>
      )}

      {showAdvanced && (
        <div className="eli-signin__advanced">
          <label htmlFor="eli-dropbox-client-id">
            {builtIn ? 'App key propia (opcional):' : 'App key de tu app de Dropbox:'}
          </label>
          <input
            id="eli-dropbox-client-id"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            defaultValue={getCustomDropboxClientId() || (builtIn ? '' : getDropboxClientId())}
            onChange={(e) => setDropboxClientId(e.target.value)}
            placeholder={builtIn ? 'vacío = la de la app' : 'p. ej. abc123xyz'}
          />
          <button className="eli-signin__link" onClick={() => setShowGuide(!showGuide)}>
            {showGuide ? 'Ocultar instrucciones' : 'Cómo crear la app de Dropbox (paso a paso)'}
          </button>
        </div>
      )}

      {showAdvanced && showGuide && (
        <ol className="eli-signin__guide">
          <li>
            Entra en{' '}
            <a
              href="https://www.dropbox.com/developers/apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              dropbox.com/developers/apps
            </a>{' '}
            con tu cuenta de Dropbox y pulsa <strong>Create app</strong>.
          </li>
          <li>
            Elige <strong>Scoped access</strong> y después <strong>App folder</strong> (la app solo
            verá su propia carpeta, nunca el resto de tu Dropbox).
          </li>
          <li>
            Ponle un nombre único (p. ej. «ORG Mode Eli») y pulsa <strong>Create app</strong>.
          </li>
          <li>
            Pestaña <strong>Permissions</strong>: marca <code>files.content.read</code> y{' '}
            <code>files.content.write</code> y pulsa <strong>Submit</strong>.
          </li>
          <li>
            Pestaña <strong>Settings</strong>, sección <strong>OAuth 2</strong>:
            <ul>
              <li>
                En <strong>Redirect URIs</strong> pega esta dirección y pulsa <strong>Add</strong>:
                <div className="eli-signin__uri">
                  <code>{redirect}</code>
                  <button className="btn" onClick={copy}>
                    {copied ? 'Copiada' : 'Copiar'}
                  </button>
                </div>
              </li>
              <li>
                En <strong>Allow public clients (Implicit Grant &amp; PKCE)</strong> elige{' '}
                <strong>Allow</strong>.
              </li>
            </ul>
          </li>
          <li>
            Copia la <strong>App key</strong> (arriba en Settings), pégala en el campo de arriba y
            pulsa el logo de Dropbox.
          </li>
          <li>
            Tus ficheros van en <strong>Dropbox/Aplicaciones/&lt;nombre de la app&gt;/</strong>
            (en inglés, <em>Apps</em>). Muévelos allí.
          </li>
        </ol>
      )}
    </div>
  );
}
