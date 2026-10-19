// ORG Mode para Eli (3.25): avisos de fechas con las notificaciones del navegador.
// Sin servidor de push: solo saltan con la app abierta (o en segundo plano reciente).
// En iOS hace falta la app en la pantalla de inicio (16.4+).
import { BASE_PATH } from './base_path';

const KEY = 'eliReminders'; // { on: bool, hour: número }
const FIRED = 'eliRemindersFired'; // { clave: ms }

const read = (k, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v && typeof v === 'object' ? v : fallback;
  } catch (e) {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    /* sin almacenamiento */
  }
};

export const notificationsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = () =>
  notificationsSupported() ? window.Notification.permission : 'unsupported';

export const getReminderSettings = () => {
  const s = read(KEY, {});
  const hour = Number.isInteger(s.hour) && s.hour >= 0 && s.hour <= 23 ? s.hour : 9;
  return { on: !!s.on, hour };
};
export const setReminderSettings = (changes) => {
  write(KEY, { ...getReminderSettings(), ...changes });
  window.dispatchEvent(new Event('eli-reminders-changed'));
};

// Pide permiso (tiene que ser dentro de un toque). Devuelve el permiso resultante.
export const requestReminderPermission = async () => {
  if (!notificationsSupported()) return 'unsupported';
  if (window.Notification.permission !== 'default') return window.Notification.permission;
  try {
    return await window.Notification.requestPermission();
  } catch (e) {
    return window.Notification.permission;
  }
};

export const wasFired = (key) => !!read(FIRED, {})[key];
export const markFired = (key, now = Date.now()) => {
  const all = read(FIRED, {});
  // se olvidan los de hace más de 3 días
  Object.keys(all).forEach((k) => now - all[k] > 3 * 86400000 && delete all[k]);
  all[key] = now;
  write(FIRED, all);
};

const gtdUrl = () => `${window.location.origin}${BASE_PATH}/gtd`;

// Muestra un aviso: con el service worker si lo hay (obligatorio en iOS), si no, directo
export const showReminder = async ({ key, title, body }) => {
  if (notificationPermission() !== 'granted') return false;
  const options = { body, tag: key, icon: `${BASE_PATH}/icon-192.png`, data: { url: gtdUrl() } };
  try {
    const reg =
      'serviceWorker' in navigator && navigator.serviceWorker.controller
        ? await navigator.serviceWorker.ready
        : null;
    if (reg && reg.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
    const n = new window.Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (e) {
    console.warn('No se pudo mostrar el aviso', e);
    return false;
  }
};
