/* global process */
// ORG Mode para Eli: App key de Dropbox.
// Prioridad: la introducida en esta pantalla (opciones avanzadas, guardada en el navegador) >
// la incluida en la app (src/eli_config.js) > variable de compilación.
import { ELI_DROPBOX_APP_KEY } from '../eli_config';

const KEY = 'eliDropboxClientId';

export const getBuiltInDropboxClientId = () => {
  if (ELI_DROPBOX_APP_KEY) return ELI_DROPBOX_APP_KEY;
  const fromEnv = process.env.REACT_APP_DROPBOX_CLIENT_ID;
  return fromEnv && fromEnv !== 'your_dropbox_client_id' ? fromEnv : '';
};

export const getCustomDropboxClientId = () => {
  try {
    return window.localStorage.getItem(KEY) || '';
  } catch (e) {
    return '';
  }
};

export const getDropboxClientId = () => getCustomDropboxClientId() || getBuiltInDropboxClientId();

export const setDropboxClientId = (id) => {
  try {
    const v = (id || '').trim();
    if (v) window.localStorage.setItem(KEY, v);
    else window.localStorage.removeItem(KEY);
  } catch (e) {}
};
