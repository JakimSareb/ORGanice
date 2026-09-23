/* global process */
// ORG Mode para Eli: la App key de Dropbox se puede introducir en tiempo de
// ejecución (se guarda en localStorage), así no hace falta recompilar.
const KEY = 'eliDropboxClientId';

export const getDropboxClientId = () => {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored) return stored;
  } catch (e) {}
  const fromEnv = process.env.REACT_APP_DROPBOX_CLIENT_ID;
  return fromEnv && fromEnv !== 'your_dropbox_client_id' ? fromEnv : '';
};

export const setDropboxClientId = (id) => {
  try {
    window.localStorage.setItem(KEY, (id || '').trim());
  } catch (e) {}
};
