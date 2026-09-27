// ORG Mode para Eli (2.12): «Preparar para usar sin conexión».
//
// Descarga al dispositivo todos los ficheros .org (y, si se elige, los cifrados — solo en su
// versión cifrada — y los adjuntos enlazados), para poder abrir la app y trabajar sin Internet.
import { showMessage, askConfirm } from '../lib/eli_prompt';
import { isEncryptedPath } from '../lib/eli_crypto';
import {
  getPersistPlainFiles,
  setPersistPlainFiles,
  getOfflineEncrypted,
  setOfflineEncrypted,
  purgePersistedFiles,
} from '../lib/eli_security';
import {
  isOfflineStoreReady,
  kvGet,
  kvSet,
  getServerCopy,
  serverCopyPaths,
  putOfflineBlob,
  offlineBlobPaths,
  deleteOfflineBlob,
  clearOfflineBlobs,
  kvDelete,
} from '../lib/eli_offline_store';
import { fileTargetsInText } from '../lib/eli_attachments';
import { resolveDropboxPath } from '../lib/eli_media';

const META_KEY = 'meta:offline';

export const offlineStatus = () => (isOfflineStoreReady() ? kvGet(META_KEY) || null : null);

export const formatBytes = (n) => {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return iso;
  }
};

export const offlineStatusText = () => {
  const st = offlineStatus();
  if (!st) return 'Aún no se ha preparado en este dispositivo.';
  const parts = [`${st.files} ${st.files === 1 ? 'fichero' : 'ficheros'}`];
  if (st.encrypted) parts.push(`${st.encrypted} cifrado${st.encrypted === 1 ? '' : 's'}`);
  if (st.attachments)
    parts.push(
      `${st.attachments} adjunto${st.attachments === 1 ? '' : 's'} (${formatBytes(st.bytes)})`
    );
  return `Preparada el ${fmtDate(st.at)}: ${parts.join(', ')}.`;
};

// --- Diálogos ------------------------------------------------------------------------------

const askOptions = (defaults) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <div class="eli-prompt__box" role="dialog" data-testid="eli-offline-options">
        <div class="eli-prompt__title"><i class="fas fa-plane"></i> Preparar para usar sin conexión</div>
        <div class="eli-prompt__message">Se guardan en este dispositivo tus ficheros para poder abrir la app y trabajar sin Internet. Lo que cambies se sube solo al volver la conexión.</div>
        <label class="eli-prompt__check"><input type="checkbox" data-opt="plain" /> <span><b>Ficheros sin cifrar</b> (la «copia local»). Quedan legibles en este dispositivo.</span></label>
        <label class="eli-prompt__check"><input type="checkbox" data-opt="encrypted" /> <span><b>Ficheros cifrados</b>, solo en su versión cifrada: sin conexión te pedirá la frase de paso o la clave, como siempre.</span></label>
        <label class="eli-prompt__check"><input type="checkbox" data-opt="attachments" /> <span><b>Adjuntos</b> (imágenes, PDF…) enlazados en tus notas. Antes de descargarlos te dice cuánto ocupan.</span></label>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
          <button type="button" class="btn eli-prompt__ok" data-testid="eli-offline-go">Preparar</button>
        </div>
      </div>`;
    const box = (name) => overlay.querySelector(`[data-opt="${name}"]`);
    Object.keys(defaults).forEach((k) => (box(k).checked = !!defaults[k]));
    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay.querySelector('.eli-prompt__ok').addEventListener('click', () =>
      done({
        plain: box('plain').checked,
        encrypted: box('encrypted').checked,
        attachments: box('attachments').checked,
      })
    );
    document.body.appendChild(overlay);
  });

const progressDialog = () => {
  const overlay = document.createElement('div');
  overlay.className = 'eli-prompt__overlay';
  overlay.innerHTML = `
    <div class="eli-prompt__box" role="dialog" data-testid="eli-offline-progress">
      <div class="eli-prompt__title"><i class="fas fa-plane"></i> Preparando…</div>
      <div class="eli-prompt__message"></div>
      <progress class="eli-offline__bar" max="1" value="0"></progress>
      <div class="eli-prompt__buttons"><button type="button" class="btn eli-prompt__cancel">Detener</button></div>
    </div>`;
  const msg = overlay.querySelector('.eli-prompt__message');
  const bar = overlay.querySelector('progress');
  const state = { stopped: false };
  overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => {
    state.stopped = true;
  });
  document.body.appendChild(overlay);
  return {
    state,
    update: (text, done, total) => {
      msg.textContent = text;
      bar.max = Math.max(1, total || 1);
      bar.value = done || 0;
    },
    close: () => overlay.remove(),
  };
};

// --- Preparar ------------------------------------------------------------------------------

export const eliPrepareOffline = () => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  if (!client || !client.eliPrefetch) {
    showMessage(
      'Usar sin conexión',
      client && client.type === 'LocalFolder'
        ? 'Con una carpeta del ordenador la app ya funciona sin conexión.'
        : 'Esta conexión no permite preparar la app para usarla sin conexión.'
    );
    return false;
  }
  if (!isOfflineStoreReady()) {
    showMessage(
      'Usar sin conexión',
      'Este navegador no permite guardar datos en el dispositivo (¿navegación privada?).'
    );
    return false;
  }
  if (navigator.onLine === false) {
    showMessage('Usar sin conexión', 'Hace falta conexión a Internet para prepararla.');
    return false;
  }
  const opts = await askOptions({
    plain: true,
    encrypted: getOfflineEncrypted(),
    attachments: false,
  });
  if (!opts) return false;
  // Los adjuntos no van cifrados: solo con la copia local
  if (!opts.plain) opts.attachments = false;
  if (opts.plain !== getPersistPlainFiles()) setPersistPlainFiles(opts.plain);
  if (opts.encrypted !== getOfflineEncrypted()) setOfflineEncrypted(opts.encrypted);
  if (!opts.plain && !opts.encrypted) {
    showMessage(
      'Usar sin conexión',
      'No se ha guardado nada: marca al menos los ficheros sin cifrar o los cifrados.'
    );
    return false;
  }

  const ui = progressDialog();
  const failed = [];
  let files = 0;
  let encrypted = 0;
  let attachments = 0;
  let bytes = 0;
  try {
    ui.update('Buscando tus ficheros…', 0, 1);
    let paths = await client.listOrgFiles();
    paths = (paths || []).filter((p) => (isEncryptedPath(p) ? opts.encrypted : opts.plain));
    for (let i = 0; i < paths.length && !ui.state.stopped; i++) {
      ui.update(`Descargando ficheros: ${i + 1} de ${paths.length}\n${paths[i]}`, i, paths.length);
      try {
        if (await client.eliPrefetch(paths[i])) {
          files++;
          if (isEncryptedPath(paths[i])) encrypted++;
        }
      } catch (e) {
        failed.push(paths[i]);
      }
    }

    if (opts.attachments && !ui.state.stopped) {
      ui.update('Buscando adjuntos…', 0, 1);
      const wanted = new Map();
      const addFrom = (orgPath, text) =>
        fileTargetsInText(text).forEach((t) => {
          const p = resolveDropboxPath(orgPath, t);
          if (p) wanted.set(p.toLowerCase(), p);
        });
      serverCopyPaths().forEach((p) => {
        const copy = getServerCopy(p);
        if (copy && typeof copy.contents === 'string' && !isEncryptedPath(p))
          addFrom(p, copy.contents);
      });
      // Ficheros abiertos (también los cifrados ya descifrados y los cambios sin subir)
      const loaded = getState().org.present.get('files');
      if (loaded)
        loaded.forEach((file, orgPath) => {
          const headers = file && file.get('headers');
          if (!headers || !orgPath) return;
          headers.forEach((h) =>
            addFrom(
              orgPath,
              `${h.getIn(['titleLine', 'rawTitle']) || ''}\n${h.get('rawDescription') || ''}`
            )
          );
        });
      let sizes = null;
      try {
        const entries = client.listAllFileEntries ? await client.listAllFileEntries() : null;
        if (entries) sizes = new Map(entries.map((e) => [e.path.toLowerCase(), e.size]));
      } catch (e) {
        sizes = null;
      }
      const list = Array.from(wanted.entries())
        .filter(([lower]) => !sizes || sizes.has(lower))
        .map(([lower, p]) => ({ path: p, size: sizes ? sizes.get(lower) || 0 : 0 }));
      const total = list.reduce((n, a) => n + a.size, 0);
      if (list.length) {
        ui.update('', 0, 1);
        const ok = await askConfirm({
          title: 'Adjuntos',
          message:
            `${list.length} ${list.length === 1 ? 'adjunto' : 'adjuntos'}` +
            (sizes ? `, ${formatBytes(total)}` : ' (tamaño desconocido)') +
            '. ¿Guardarlos también en este dispositivo?',
          okLabel: 'Guardar adjuntos',
          cancelLabel: 'Ahora no',
        });
        if (ok) {
          const keep = new Set(list.map((a) => a.path));
          for (let i = 0; i < list.length && !ui.state.stopped; i++) {
            ui.update(
              `Descargando adjuntos: ${i + 1} de ${list.length}\n${list[i].path}`,
              i,
              list.length
            );
            try {
              const blob = await client.getFileBlob(list[i].path);
              await putOfflineBlob(list[i].path, blob);
              attachments++;
              bytes += blob.size || list[i].size || 0;
            } catch (e) {
              failed.push(list[i].path);
            }
          }
          // Adjuntos guardados antes que ya no se enlazan
          if (!ui.state.stopped) {
            const old = await offlineBlobPaths();
            for (const p of old) if (!keep.has(p)) await deleteOfflineBlob(p);
          }
        }
      }
    } else if (!opts.attachments) {
      await clearOfflineBlobs();
    }
  } catch (e) {
    ui.close();
    showMessage('No se pudo preparar', (e && e.message) || String(e));
    return false;
  }
  ui.close();

  kvSet(META_KEY, {
    at: new Date().toISOString(),
    files,
    encrypted,
    attachments,
    bytes,
    stopped: ui.state.stopped,
  });
  const lines = [
    ui.state.stopped ? 'Detenido a medias.' : 'Lista para usar sin conexión.',
    `Ficheros: ${files}${encrypted ? ` (${encrypted} cifrados)` : ''}.`,
  ];
  if (attachments) lines.push(`Adjuntos: ${attachments} (${formatBytes(bytes)}).`);
  if (failed.length) lines.push(`\nNo se pudieron descargar:\n${failed.join('\n')}`);
  lines.push(
    '\nConsejo: en el iPhone, abre la app desde su icono de la pantalla de inicio (Safari → ' +
      'Compartir → Añadir a pantalla de inicio). Lo que cambies sin conexión se sube solo al ' +
      'volver Internet.'
  );
  await showMessage('Usar sin conexión', lines.join('\n'));
  return true;
};

// Borra lo guardado para usar sin conexión (menos los cambios aún sin subir)
export const eliClearOffline = () => async () => {
  const ok = await askConfirm({
    title: 'Borrar lo guardado',
    message:
      'Se borran de este dispositivo las copias de tus ficheros y los adjuntos guardados para ' +
      'usar la app sin conexión (los cambios que aún no se han subido se conservan). La copia ' +
      'local y los ficheros cifrados sin conexión quedan desactivados.',
    okLabel: 'Borrar',
    cancelLabel: 'Cancelar',
    focusCancel: true,
  });
  if (!ok) return false;
  setPersistPlainFiles(false);
  setOfflineEncrypted(false);
  purgePersistedFiles({ keepDirty: true });
  await clearOfflineBlobs();
  kvDelete(META_KEY);
  return true;
};
