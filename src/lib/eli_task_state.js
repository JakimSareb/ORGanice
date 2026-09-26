// ORG Mode para Eli: casilla de tarea en la barra de iconos del encabezado y suma del tiempo
// registrado (reloj) de un encabezado y sus subencabezados.
import { List } from 'immutable';
import { subheadersOfHeaderWithId } from './org_utils';
import { dateForTimestamp, millisDuration } from './timestamps';

/**
 * Estado de la tarea: 'none' (no es tarea), 'active' (estado activo) o 'done' (terminado), y
 * las palabras para terminarla (DONE) o cancelarla (CANCELLED) según su #+TODO.
 */
export const taskStateOf = (header, todoKeywordSets) => {
  const keyword = header && header.getIn(['titleLine', 'todoKeyword']);
  if (!keyword) return { kind: 'none' };
  const sets = todoKeywordSets || List();
  const set =
    sets.find((s) => (s.get('keywords') || List()).includes(keyword)) || sets.first() || null;
  const completed = set ? (set.get('completedKeywords') || List()).toArray() : ['DONE'];
  if (completed.includes(keyword)) return { kind: 'done' };
  const doneKeyword = completed.includes('DONE') ? 'DONE' : completed[0] || 'DONE';
  const cancelKeyword = completed.includes('CANCELLED')
    ? 'CANCELLED'
    : completed.find((k) => k !== doneKeyword) || doneKeyword;
  return { kind: 'active', doneKeyword, cancelKeyword };
};

const loggedMillis = (header, now) =>
  (header.get('logBookEntries') || List()).reduce((acc, entry) => {
    if (!entry.get('start')) return acc;
    const start = dateForTimestamp(entry.get('start'));
    const end = entry.get('end') ? dateForTimestamp(entry.get('end')) : now; // reloj en marcha
    return acc + Math.max(0, end - start);
  }, 0);

// Tiempo del encabezado y total con sus subencabezados (milisegundos), incluido un reloj activo
export const clockTotals = (headers, headerId, now = new Date()) => {
  const header = (headers || List()).find((h) => h.get('id') === headerId);
  if (!header) return null;
  const own = loggedMillis(header, now);
  const subs = subheadersOfHeaderWithId(headers, headerId);
  const total = subs.reduce((acc, h) => acc + loggedMillis(h, now), own);
  const running = [header, ...subs.toArray()].some((h) =>
    (h.get('logBookEntries') || List()).some((e) => e.get('start') && !e.get('end'))
  );
  return { own, total, subheaders: subs.size, running };
};

export const formatMillis = (ms) => millisDuration(ms || 0).trim();
