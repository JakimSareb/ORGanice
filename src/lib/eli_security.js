// ORG Mode para Eli: ajustes de seguridad y bloqueo por inactividad.

import { forgetSecrets, hasSecretsInMemory, isEncryptedPath } from './eli_crypto';
import { BASE_PATH } from './base_path';

const LS_PERSIST_PLAIN = 'eliPersistPlainFiles'; // 'true' | 'false' (por defecto: false)
const LS_IDLE_MINUTES = 'eliIdleLockMinutes'; // número; 0 = desactivado (por defecto: 10)
export const DEFAULT_IDLE_MINUTES = 10;

const read = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const write = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {}
};

// ---------------------------------------------------------------------------
// Copia local de ficheros sin cifrar

export const getPersistPlainFiles = () => read(LS_PERSIST_PLAIN) === 'true';

// Borra las copias locales. Con keepDirty, conserva las que tienen cambios aún no subidos
// (se borrarán solas al sincronizar).
export const purgePersistedFiles = ({ keepDirty = false } = {}) => {
  try {
    const dirty = keepDirty ? JSON.parse(window.localStorage.getItem('isDirty')) || {} : {};
    const persisted = JSON.parse(window.localStorage.getItem('persistedFiles')) || {};
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('files__'))
      .forEach((k) => {
        const path = k.substring('files__'.length);
        if (!dirty[path]) {
          window.localStorage.removeItem(k);
          delete persisted[path];
        }
      });
    window.localStorage.setItem('persistedFiles', JSON.stringify(persisted));
  } catch (e) {}
};

export const setPersistPlainFiles = (enabled) => {
  write(LS_PERSIST_PLAIN, enabled ? 'true' : 'false');
  if (!enabled) purgePersistedFiles();
};

// ---------------------------------------------------------------------------
// Bloqueo por inactividad

export const getIdleLockMinutes = () => {
  const v = read(LS_IDLE_MINUTES);
  if (v === null || v === '' || isNaN(+v)) return DEFAULT_IDLE_MINUTES;
  return Math.max(0, +v);
};
export const setIdleLockMinutes = (minutes) => write(LS_IDLE_MINUTES, String(Math.max(0, +minutes || 0)));

// ¿Hay algo sensible en memoria? (frases/claves desbloqueadas, ficheros cifrados abiertos o
// cabeceras :crypt: descifradas)
export const hasSensitiveState = (state) => {
  if (hasSecretsInMemory()) return true;
  const files = state.org.present.get('files');
  if (!files) return false;
  return files.some((file, path) => {
    if (isEncryptedPath(path) && file.get('headers')) return true;
    const headers = file.get('headers');
    return (
      !!headers &&
      headers.some((h) => {
        const tags = h.getIn(['titleLine', 'tags']);
        return (
          tags &&
          tags.includes('crypt') &&
          !(h.get('rawDescription') || '').includes('-----BEGIN PGP MESSAGE-----') &&
          (h.get('rawDescription') || '').trim() !== ''
        );
      })
    );
  });
};

const dirtyPaths = (state) => {
  const files = state.org.present.get('files');
  if (!files) return [];
  return files
    .filter((f) => f.get('isDirty'))
    .keySeq()
    .toArray();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let overlay = null;
const showOverlay = (message, onContinue) => {
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.className = 'eli-prompt__overlay eli-lock__overlay';
  overlay.innerHTML = `
    <div class="eli-prompt__box">
      <div class="eli-prompt__title"><i class="fas fa-lock"></i> Bloqueado por inactividad</div>
      <div class="eli-prompt__message"></div>
      <div class="eli-prompt__buttons"><button type="button" class="btn eli-prompt__ok">Seguir trabajando</button></div>
    </div>`;
  overlay.querySelector('.eli-prompt__message').textContent = message;
  overlay.querySelector('.eli-prompt__ok').addEventListener('click', () => {
    overlay.remove();
    overlay = null;
    onContinue();
  });
  document.body.appendChild(overlay);
};

// Borra todo lo sensible recargando la app en la lista de ficheros: al recargar desaparece
// de la memoria el texto descifrado, que nunca se guarda en el navegador.
const wipeAndReload = () => {
  forgetSecrets();
  window.location.replace(`${BASE_PATH}/files`);
};

let locking = false;

export const lockNow = async (store, syncAction) => {
  if (locking) return;
  locking = true;
  try {
    // 1. Intentar guardar en Dropbox lo pendiente (se cifra con las claves aún en memoria)
    const pending = dirtyPaths(store.getState());
    pending.forEach((path) => store.dispatch(syncAction({ path, shouldSuppressMessages: true })));
    for (let i = 0; i < 20 && dirtyPaths(store.getState()).length > 0; i++) await sleep(1000);

    const stillDirty = dirtyPaths(store.getState());
    if (stillDirty.length === 0) {
      wipeAndReload();
      return;
    }
    // 2. Sin conexión: no se puede borrar la memoria sin perder cambios. Se olvidan las frases,
    //    se tapa el contenido y se reintenta guardar cada 30 s; al lograrlo, se recarga.
    forgetSecrets();
    let cancelled = false;
    showOverlay(
      `Hay cambios sin guardar en ${stillDirty.join(', ')} (¿sin conexión?). ` +
        'Se guardarán y la app se recargará en cuanto sea posible. Las frases de paso ya se han olvidado.',
      () => {
        cancelled = true;
      }
    );
    while (!cancelled) {
      await sleep(30000);
      if (cancelled) break;
      dirtyPaths(store.getState()).forEach((path) =>
        store.dispatch(syncAction({ path, shouldSuppressMessages: true }))
      );
      await sleep(5000);
      if (!cancelled && dirtyPaths(store.getState()).length === 0) {
        wipeAndReload();
        return;
      }
    }
  } finally {
    locking = false;
  }
};

export const installIdleLock = (store, syncAction) => {
  let lastActivity = Date.now();
  const touch = () => {
    lastActivity = Date.now();
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((ev) =>
    window.addEventListener(ev, touch, { passive: true, capture: true })
  );

  const check = () => {
    const minutes = getIdleLockMinutes();
    if (!minutes || locking || overlay) return;
    if (Date.now() - lastActivity < minutes * 60000) return;
    if (!hasSensitiveState(store.getState())) return;
    lockNow(store, syncAction);
  };

  // En iOS los temporizadores se congelan en segundo plano: se comprueba también al volver.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, 15000);
};
