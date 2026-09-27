import { debounce } from 'lodash';
import { parseISO, addSeconds } from 'date-fns';
import { localStorageAvailable } from '../util/settings_persister';
import { exportOrg } from '../lib/export_org';
import { parseFile } from '../reducers/org';
import { STATIC_FILE_PREFIX } from '../lib/org_utils';
import {
  isEncryptedPath,
  hasUnencryptedCryptEntries,
  encryptFile,
  encryptCryptEntries,
} from '../lib/eli_crypto';
import { getPersistPlainFiles, getOfflineEncrypted } from '../lib/eli_security';
import {
  getPlainCopy,
  setPlainCopy,
  removePlainCopy,
  getServerCopy,
  setServerCopy,
  isStoreSettling,
} from '../lib/eli_offline_store';

const forgetPersisted = (path) => {
  try {
    removePlainCopy(path);
    const persisted = JSON.parse(localStorage.getItem('persistedFiles')) || {};
    delete persisted[path];
    localStorage.setItem('persistedFiles', JSON.stringify(persisted));
  } catch (e) {}
};

// ORG Mode para Eli: nunca guardar en el navegador el texto descifrado
// de ficheros .gpg/.asc ni de cabeceras :crypt: descifradas. Los ficheros sin cifrar solo se
// guardan si el usuario lo activa en Ajustes → Seguridad y cifrado.
const mustNotPersist = (path, contents) => {
  if (!getPersistPlainFiles() || isEncryptedPath(path)) {
    forgetPersisted(path);
    return true;
  }
  // Encabezados :crypt: abiertos: no se guarda este texto; la copia anterior se conserva hasta
  // que esté lista la versión cifrada (persistEncrypted)
  if (hasUnencryptedCryptEntries(contents)) return true;
  return false;
};

// ORG Mode para Eli (2.12): para no perder cambios hechos sin conexión si el sistema cierra la
// app, lo cifrado se guarda CIFRADO (con la frase o clave que ya está en memoria):
// - un fichero .gpg/.asc con cambios, si está activado «ficheros cifrados sin conexión»;
// - un fichero sin cifrar con encabezados :crypt: abiertos, si está activada la copia local.
const encryptSeq = {};
// Anula un cifrado en curso (p. ej. al quedar el fichero al día: ya no hay nada pendiente)
export const cancelPendingEncryption = (path) => {
  encryptSeq[path] = (encryptSeq[path] || 0) + 1;
};
const persistEncrypted = (state, path, contents) => {
  const seq = (encryptSeq[path] = (encryptSeq[path] || 0) + 1);
  const latest = () => encryptSeq[path] === seq;
  if (isEncryptedPath(path)) {
    const isDirty = state.org.present.getIn(['files', path, 'isDirty']);
    if (!getOfflineEncrypted() || !isDirty) return;
    const lastSyncAt = state.org.present.getIn(['files', path, 'lastSyncAt']);
    encryptFile(path, contents, { silent: true })
      .then((cipher) => {
        if (!latest()) return;
        const prev = getServerCopy(path) || {};
        setServerCopy(path, {
          contents: cipher,
          lastModifiedAt: prev.lastModifiedAt || null,
          savedAt: new Date().toISOString(),
          pending: true,
          baseSyncAt: prev.pending
            ? prev.baseSyncAt
            : lastSyncAt
            ? new Date(lastSyncAt).toISOString()
            : null,
        });
      })
      .catch(() => {});
    return;
  }
  if (!getPersistPlainFiles()) return;
  encryptCryptEntries(contents, { silent: true })
    .then((text) => {
      if (!latest() || hasUnencryptedCryptEntries(text)) return;
      setPlainCopy(path, text);
      const persisted = JSON.parse(localStorage.getItem('persistedFiles')) || {};
      persisted[path] = state.org.present.getIn(['files', path, 'lastSyncAt']);
      localStorage.setItem('persistedFiles', JSON.stringify(persisted));
    })
    .catch(() => {
      // Sin frase en memoria: se conserva la copia anterior (cifrada)
    });
};

export const persistIsDirty = (isDirty, path) => {
  // Mientras se abre el almacén del dispositivo no se toca (ver eli_offline_store)
  if (isStoreSettling()) return;
  if (localStorageAvailable) {
    const filesDirty = JSON.parse(localStorage.getItem('isDirty')) || {};
    filesDirty[path] = isDirty;
    localStorage.setItem('isDirty', JSON.stringify(filesDirty));
  }
};

export const saveFileContentsToLocalStorage = (path, contents) => {
  if (localStorageAvailable && !path.startsWith(STATIC_FILE_PREFIX)) {
    if (mustNotPersist(path, contents)) return;
    let persistedFiles = JSON.parse(localStorage.getItem('persistedFiles'));
    persistedFiles = persistedFiles || {};

    setPlainCopy(path, contents);
    persistedFiles[path] = addSeconds(new Date(), 5);

    localStorage.setItem('persistedFiles', JSON.stringify(persistedFiles));
  }
};

const saveFunctionToDebounce = (state, path) => {
  if (localStorageAvailable && !path.startsWith(STATIC_FILE_PREFIX)) {
    const persistedFiles = JSON.parse(localStorage.getItem('persistedFiles')) || {};

    const contents = exportOrg({
      headers: state.org.present.getIn(['files', path, 'headers']),
      linesBeforeHeadings: state.org.present.getIn(['files', path, 'linesBeforeHeadings']),
      dontIndent: state.base.get('eliIndentOnExport') !== true,
    });
    if (mustNotPersist(path, contents)) {
      if (isEncryptedPath(path) || hasUnencryptedCryptEntries(contents))
        persistEncrypted(state, path, contents);
      return;
    }
    encryptSeq[path] = (encryptSeq[path] || 0) + 1; // anula un cifrado en curso más antiguo
    setPlainCopy(path, contents);

    persistedFiles[path] = state.org.present.getIn(['files', path, 'lastSyncAt']);
    localStorage.setItem('persistedFiles', JSON.stringify(persistedFiles));
  }
};
const getDebouncedSaveFunction = () =>
  debounce(saveFunctionToDebounce, 1500, {
    leading: true,
    trailing: true,
  });
const debouncedSaveFunctions = {};
export const saveFileToLocalStorage = (state, path) => {
  // to make sure no file is skipped when multiple files are dirty
  // a seperately debounced function is used per file
  let debouncedSaveFunction = debouncedSaveFunctions[path];
  if (!debouncedSaveFunction) {
    debouncedSaveFunctions[path] = getDebouncedSaveFunction();
    debouncedSaveFunction = debouncedSaveFunctions[path];
  }
  debouncedSaveFunction(state, path);
};

export const loadFilesFromLocalStorage = (state) => {
  if (localStorageAvailable) {
    const persistedFiles = JSON.parse(localStorage.getItem('persistedFiles')) || {};
    const isDirty = JSON.parse(localStorage.getItem('isDirty')) || {};
    Object.entries(persistedFiles).forEach(([path, lastSyncAt]) => {
      const contents = getPlainCopy(path);
      if (contents) {
        state.org.present = state.org.present.update((org) => parseFile(org, { path, contents }));
        state.org.present = state.org.present.setIn(
          ['files', path, 'lastSyncAt'],
          parseISO(lastSyncAt)
        );
        state.org.present = state.org.present.setIn(['files', path, 'isDirty'], isDirty[path]);
      }
    });
  }
  return state;
};

// ORG Mode para Eli (2.12): guardar ya lo pendiente (al pasar la app a segundo plano: en el
// iPhone el sistema puede cerrarla después sin avisar)
export const flushLocalSaves = () => {
  Object.values(debouncedSaveFunctions).forEach((f) => f.flush());
};
