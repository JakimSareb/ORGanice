// ORG Mode para Eli (4.11): herramientas de la tarea de GTD: reloj (CLOCK), enlace propio,
// exportar. Funciones puras (el efecto sobre el fichero está en gtd_actions).
import { List } from 'immutable';
import { dateForTimestamp, millisDuration } from '../timestamps';

// Registros de tiempo de una cabecera (los de estado, sin inicio, no cuentan): más nuevos primero,
// como se guardan en el :LOGBOOK:. `end` = null → reloj en marcha.
export const clockEntriesOf = (header) =>
  ((header && header.get('logBookEntries')) || List())
    .filter((e) => e.get('start'))
    .map((e) => ({
      id: e.get('id'),
      start: dateForTimestamp(e.get('start')),
      end: e.get('end') ? dateForTimestamp(e.get('end')) : null,
    }))
    .toArray();

export const clockMillis = (entries, now = new Date()) =>
  entries.reduce((acc, e) => acc + Math.max(0, (e.end || now) - e.start), 0);

export const formatClock = (ms) => millisDuration(ms || 0).trim() || '0:00';

export const isClockRunning = (header) => clockEntriesOf(header).some((e) => !e.end);

// Línea de resumen: «⏱ 1:20 · 3 registros» (vacía si no hay registros)
export const clockSummary = (header, now = new Date()) => {
  const entries = clockEntriesOf(header);
  if (!entries.length) return '';
  const n = entries.length;
  const running = entries.some((e) => !e.end);
  return `⏱ ${formatClock(clockMillis(entries, now))} · ${n} ${n === 1 ? 'registro' : 'registros'}${
    running ? ' (reloj en marcha)' : ''
  }`;
};

// Enlace Org propio de la tarea (para saltar a ella desde otra): [[id:…][Título]]
export const taskLinkText = (orgId, title) =>
  `[[id:${orgId}][${String(title || '')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()}]]`;

// Para <input type="datetime-local">
const pad = (n) => String(n).padStart(2, '0');
export const toDateTimeInput = (d) =>
  d
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
        d.getMinutes()
      )}`
    : '';
export const fromDateTimeInput = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

// Copiar al portapapeles. true = hecho
export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
};
