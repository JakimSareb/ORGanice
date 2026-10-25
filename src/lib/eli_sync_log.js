// ORG Mode para Eli (4.33): registro de errores de sincronización. Los últimos 200 eventos (hora,
// fichero, operación, error) en este dispositivo (localStorage `eliSyncLog`, no se sincroniza).
// Se ve en Ajustes › Sincronización › Registro y desde el aviso ⚠ junto al botón de sincronizar.
import { useEffect, useState } from 'react';

const KEY = 'eliSyncLog';
const SEEN = 'eliSyncLogSeen';
export const MAX_EVENTS = 200;

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

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
  } catch (e) {
    // sin espacio: el registro no se guarda
  }
};

export const getSyncLog = () => {
  try {
    const v = JSON.parse(read(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
};

// Texto del error (los de Dropbox traen el motivo dentro)
export const errorText = (error) => {
  if (error == null || error === '') return 'sin detalle';
  if (typeof error === 'string') return error;
  if (error.message) return String(error.message);
  try {
    const inner = error.error || error.dropboxError || error.response || error;
    const s = JSON.stringify(inner);
    return s && s !== '{}' ? s.slice(0, 300) : String(error);
  } catch (e) {
    return String(error);
  }
};

// Añade un evento (los más nuevos primero; como mucho MAX_EVENTS). Puro respecto a `list`.
export const addEvent = (list, ev, max = MAX_EVENTS) =>
  [
    {
      at: ev.at || new Date().toISOString(),
      file: ev.file || '',
      op: ev.op || '',
      error: errorText(ev.error),
    },
    ...(list || []),
  ].slice(0, max);

export const logSyncEvent = (ev) => {
  write(KEY, JSON.stringify(addEvent(getSyncLog(), ev || {})));
  notify();
};

export const clearSyncLog = () => {
  write(KEY, '[]');
  write(SEEN, new Date().toISOString());
  notify();
};

// ¿Hay errores que no se han mirado? (para el aviso ⚠ del botón de sincronizar)
export const unseenCount = () => {
  const seen = read(SEEN) || '';
  return getSyncLog().filter((e) => e.at > seen).length;
};
export const markSyncLogSeen = () => {
  write(SEEN, new Date().toISOString());
  notify();
};

export const subscribeSyncLog = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useSyncLog = () => {
  const [, setRev] = useState(0);
  useEffect(() => subscribeSyncLog(() => setRev((r) => r + 1)), []);
  return getSyncLog();
};

// Texto para «Copiar»: una línea por evento
export const syncLogText = (list) =>
  (list || []).map((e) => `${e.at}\t${e.op}\t${e.file}\t${e.error}`).join('\n');

export const openSyncLog = () => window.dispatchEvent(new CustomEvent('eli:sync-log'));
