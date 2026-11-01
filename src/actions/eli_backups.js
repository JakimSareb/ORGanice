// ORG Mode para Eli (4.58): copias de seguridad rotativas en `/backups/` (Dropbox o carpeta del
// ordenador). La lógica pura (nombres, retención, zip) está en `lib/eli_backups.js`.
//
// Orden de seguridad al crear una copia: 1) subir el zip, 2) comprobar que está y que pesa lo
// mismo, 3) solo entonces podar las copias que ya no toca guardar. Si algo falla, no se poda.
import {
  BACKUPS_DIR,
  MIN_INTERVAL_MS,
  isBackupSource,
  signatureFromEntries,
  signatureFromFiles,
  formatBackupName,
  parseBackupName,
  planRetention,
  makeZip,
  readZip,
  getBackupsOn,
  getLastRun,
  setLastRun,
} from '../lib/eli_backups';

// Las copias se escriben y leen SIN pasar por la caché de «sin conexión»
const rawOf = (client) => (client && client.eliRawClient) || client;

export const backupsSupported = (client) => {
  const c = rawOf(client);
  return !!(
    c &&
    c.listBackupZips &&
    c.listAllFileEntries &&
    c.uploadBinaryFile &&
    (c.getFileBlob || c.getFileContents)
  );
};

const readBytes = async (c, path) => {
  if (c.getFileBlob) {
    const blob = await c.getFileBlob(path);
    return new Uint8Array(await blob.arrayBuffer());
  }
  const contents = await c.getFileContents(path);
  return typeof contents === 'string' ? new TextEncoder().encode(contents) : contents;
};

const baseName = (path) => String(path || '').slice(String(path || '').lastIndexOf('/') + 1);

// Copias que hay ahora, de la más antigua a la más reciente: [{ name, path, size, date, sig }]
export const listBackups = async (client) => {
  const c = rawOf(client);
  const zips = await c.listBackupZips();
  return zips
    .map((z) => {
      const p = parseBackupName(z.name || baseName(z.path));
      return p ? { ...p, path: z.path || `${BACKUPS_DIR}/${p.name}`, size: z.size || 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
};

const prune = async (c, items, now) => {
  const { remove } = planRetention(items, now);
  let removed = 0;
  for (const it of remove) {
    try {
      await c.deleteFile(it.path);
      removed++;
    } catch (e) {
      // si no se puede borrar una, se intentará en la próxima copia
    }
  }
  return removed;
};

// Crea una copia si toca. Resultado: { status, … } con status:
//  'created' (name, removed) · 'recent' (hay una de hace menos de 1 h) · 'unchanged' (nada ha
//  cambiado desde la última) · 'empty' (no hay ficheros) · 'unverified' (se subió pero no se pudo
//  comprobar: no se poda nada) · 'unsupported'
// (4.60) `onProgress(texto)`: lo que se está haciendo (para que Ajustes lo enseñe)
export const runBackup = async (
  client,
  { now = new Date(), force = false, deflateRaw, onProgress = () => {} } = {}
) => {
  if (!backupsSupported(client)) return { status: 'unsupported' };
  const c = rawOf(client);
  onProgress('Mirando las copias que hay…');
  const existing = await listBackups(client);
  const newest = existing[existing.length - 1];

  if (!force && newest && now - newest.date < MIN_INTERVAL_MS) {
    const removed = await prune(c, existing, now);
    return { status: 'recent', newestAt: newest.date.getTime(), removed };
  }

  onProgress('Buscando los ficheros que copiar…');
  const entries = (await c.listAllFileEntries()).filter((e) => isBackupSource(e.path));
  if (!entries.length) return { status: 'empty' };

  let sig = signatureFromEntries(entries);
  if (sig && newest && newest.sig === sig) {
    const removed = await prune(c, existing, now);
    return { status: 'unchanged', removed };
  }

  // Descarga (de 4 en 4) y zip
  const files = [];
  for (let i = 0; i < entries.length; i += 4) {
    onProgress(`Leyendo ficheros: ${i} de ${entries.length}…`);
    const chunk = await Promise.all(
      entries.slice(i, i + 4).map(async (e) => ({
        name: e.path.replace(/^\/+/, ''),
        data: await readBytes(c, e.path),
      }))
    );
    files.push(...chunk);
  }
  if (!sig) {
    sig = signatureFromFiles(files);
    if (newest && newest.sig === sig) {
      const removed = await prune(c, existing, now);
      return { status: 'unchanged', removed };
    }
  }
  onProgress(`Comprimiendo ${files.length} ficheros…`);
  const zip = await makeZip(files, deflateRaw ? { date: now, deflateRaw } : { date: now });
  const name = formatBackupName(now, sig);
  onProgress('Subiendo la copia…');
  const uploaded = await c.uploadBinaryFile(
    `${BACKUPS_DIR}/${name}`,
    new Blob([zip], { type: 'application/zip' })
  );

  // Comprobar que quedó bien escrita antes de borrar nada
  onProgress('Comprobando la copia…');
  const after = await listBackups(client);
  const found = after.find((b) => b.name === name);
  if (!found || (found.size && found.size !== zip.length)) {
    if (uploaded && baseName(uploaded) !== name) {
      try {
        await c.deleteFile(uploaded);
      } catch (e) {}
    }
    return { status: 'unverified' };
  }
  const removed = await prune(c, after, now);
  return { status: 'created', name, removed, files: files.length };
};

// Restaura una copia: antes guarda una copia del estado actual (si no hay ya una igual) y no borra
// nada: solo reescribe (o vuelve a crear) los ficheros que contiene el zip.
// -> { status: 'restored', restored, skipped } | { status: 'error', message }
export const restoreBackup = async (client, backup, { now = new Date(), inflateRaw } = {}) => {
  if (!backupsSupported(client))
    return { status: 'error', message: 'Este tipo de conexión no admite copias.' };
  const c = rawOf(client);
  let files;
  try {
    const bytes = await readBytes(c, backup.path);
    files = await readZip(bytes, inflateRaw ? { inflateRaw } : undefined);
  } catch (e) {
    return { status: 'error', message: (e && e.message) || 'No se ha podido leer la copia.' };
  }
  let safety;
  try {
    safety = await runBackup(client, { now, force: true });
  } catch (e) {
    return {
      status: 'error',
      message: 'No se ha podido guardar antes una copia del estado actual.',
    };
  }
  if (safety.status !== 'created' && safety.status !== 'unchanged' && safety.status !== 'empty') {
    return {
      status: 'error',
      message: 'No se ha podido guardar antes una copia del estado actual.',
    };
  }
  let restored = 0;
  const skipped = [];
  const dec = new TextDecoder('utf-8', { fatal: true });
  for (const f of files) {
    const path = `/${f.name}`;
    try {
      // .gpg es binario; el resto se escribe como texto (como hace la app al guardar)
      const contents = /\.gpg$/i.test(path) ? f.data : dec.decode(f.data);
      await client.updateFile(path, contents);
      restored++;
    } catch (e) {
      skipped.push(path);
    }
  }
  return { status: 'restored', restored, skipped };
};

// ---------------------------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------------------------
let running = false;

// Comprobación periódica (la lanza `EliBackups`): como mucho 1 copia por hora, y solo si cambió algo
export const eliBackupTick = ({ force = false, onProgress } = {}) => async (dispatch, getState) => {
  if (running) return { status: 'busy' };
  if (!force && !getBackupsOn()) return { status: 'off' };
  const client = getState().syncBackend.get('client');
  if (!backupsSupported(client)) return { status: 'unsupported' };
  const now = new Date();
  if (!force && now.getTime() - getLastRun() < MIN_INTERVAL_MS) return { status: 'wait' };
  running = true;
  try {
    const result = await runBackup(
      client,
      onProgress ? { now, force, onProgress } : { now, force }
    );
    if (result.status === 'recent') setLastRun(result.newestAt);
    else if (result.status !== 'unverified') setLastRun(now.getTime());
    return result;
  } catch (error) {
    // sin conexión u otro fallo: se reintenta en la próxima comprobación
    return { status: 'error', message: (error && error.message) || String(error) };
  } finally {
    running = false;
  }
};

export const eliListBackups = () => (dispatch, getState) =>
  listBackups(getState().syncBackend.get('client'));

export const eliRestoreBackup = (backup) => async (dispatch, getState) => {
  const dirty = getState()
    .org.present.get('files')
    .filter((f) => f && f.get && f.get('isDirty'));
  if (dirty.size > 0) {
    return {
      status: 'error',
      message: 'Hay cambios sin sincronizar. Sincroniza (o descártalos) antes de restaurar.',
    };
  }
  if (running)
    return { status: 'error', message: 'Hay una copia en curso. Prueba de nuevo en un momento.' };
  running = true;
  try {
    return await restoreBackup(getState().syncBackend.get('client'), backup);
  } catch (error) {
    return { status: 'error', message: (error && error.message) || String(error) };
  } finally {
    running = false;
  }
};
