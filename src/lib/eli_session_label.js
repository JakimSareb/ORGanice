// ORG Mode para Eli (4.39): línea discreta con la sesión activa en la página de ficheros:
// «Dropbox · cuenta», «Carpeta local · nombre», «WebDAV · servidor» (GitLab: «GitLab»).
import { getPersistedField } from '../util/settings_persister';
import { loadRootHandle } from '../sync_backend_clients/local_folder_sync_backend_client';

export const SESSION_NAMES = {
  Dropbox: 'Dropbox',
  LocalFolder: 'Carpeta local',
  WebDAV: 'WebDAV',
  GitLab: 'GitLab',
};

// «Dropbox · cuenta» (sin detalle: solo el nombre del servicio)
export const formatSessionLabel = (type, detail) => {
  const name = SESSION_NAMES[type] || type || '';
  if (!name) return '';
  return detail ? `${name} · ${detail}` : name;
};

// Solo el host de una URL de WebDAV (si no es una URL, se deja tal cual)
export const shortEndpoint = (url) => {
  if (!url) return '';
  try {
    return new URL(url).host || url;
  } catch (e) {
    return String(url);
  }
};

// El detalle de la sesión; nunca falla (si no se puede saber, vacío)
export const sessionDetail = async (client) => {
  try {
    if (!client) return '';
    if (client.type === 'Dropbox')
      return client.getAccountLabel ? await client.getAccountLabel() : '';
    if (client.type === 'LocalFolder') {
      const h = await loadRootHandle();
      return (h && h.name) || '';
    }
    if (client.type === 'WebDAV') return shortEndpoint(getPersistedField('webdavEndpoint'));
  } catch (e) {}
  return '';
};
