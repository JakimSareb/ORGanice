// ORG Mode para Eli (4.17): vista Tickler de GTD. Modelo puro: las entradas de tickler.org
// (cabeceras con SCHEDULED bajo «*[ TICKLER año ]* › MES») agrupadas por cuándo aparecen y las
// fechas rápidas (±1 día / semana / mes). Al llegar su fecha siguen el flujo de siempre: salen en
// «Tickler de hoy» de la Revisión diaria (y de Planificar el día), que las pasa al Inbox.
import { TICKLER_MONTHS } from './gtd_process';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 24 * 3600 * 1000;
const dayDiff = (a, b) => Math.round((+startOfDay(a) - +startOfDay(b)) / DAY);
const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();

const plain = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
// Cabeceras de año («*[ TICKLER 2026 ]*») o de mes («OCTUBRE»)
export const isTicklerContainer = (t) => {
  const p = plain(t.title);
  return /^TICKLER \d{4}$/.test(p) || TICKLER_MONTHS.includes(p) || p === 'SETIEMBRE';
};

// Las que cuentan: sin terminar ni en la papelera, que no son las cabeceras de año/mes ni notas
// sueltas debajo de una entrada (sin fecha y a más de 3 niveles)
export const ticklerEntries = (tasks) =>
  (tasks || []).filter(
    (t) =>
      !t.isDone &&
      !t.isTrashed &&
      !t.isProject &&
      !isTicklerContainer(t) &&
      (!!t.scheduled || (t.level || 1) <= 3)
  );

// Grupos en orden: «Hoy (o antes)», «Mañana», los demás días de este mes (uno por día), los
// meses siguientes (uno por mes) y «Sin fecha». Dentro, por fecha y título.
export const groupTickler = (tasks, today = new Date()) => {
  const t0 = startOfDay(today);
  const groups = [];
  const byId = {};
  const add = (id, label, order, t) => {
    if (!byId[id]) {
      byId[id] = { id, label, order, list: [] };
      groups.push(byId[id]);
    }
    byId[id].list.push(t);
  };
  ticklerEntries(tasks).forEach((t) => {
    const d = t.scheduled;
    if (!d) return add('nodate', 'Sin fecha', Infinity, t);
    const n = dayDiff(d, t0);
    if (n <= 0) return add('today', 'Hoy (o antes)', -2, t);
    if (n === 1) return add('tomorrow', 'Mañana', -1, t);
    if (d.getFullYear() === t0.getFullYear() && d.getMonth() === t0.getMonth()) {
      const day = startOfDay(d);
      return add(
        'd' + d.getDate(),
        day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }),
        +day,
        t
      );
    }
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return add(
      `m${d.getFullYear()}-${d.getMonth()}`,
      `${cap(TICKLER_MONTHS[d.getMonth()])} ${d.getFullYear()}`,
      +first,
      t
    );
  });
  const when = (t) => (t.scheduled ? +t.scheduled : Infinity);
  groups.forEach((g) =>
    g.list.sort((a, b) => when(a) - when(b) || (a.title || '').localeCompare(b.title || ''))
  );
  return groups.sort((a, b) => a.order - b.order);
};

// Fecha rápida: unit = 'day' | 'week' | 'month'; n = +1 / -1. Al sumar meses, si el día no existe
// (31 → febrero) se queda en el último del mes. Nunca antes de hoy.
export const shiftTicklerDate = (date, unit, n, today = new Date()) => {
  const d = startOfDay(date || today);
  let out;
  if (unit === 'month') {
    const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
    out = new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
  } else out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n * (unit === 'week' ? 7 : 1));
  const t0 = startOfDay(today);
  return out < t0 ? t0 : out;
};

// ¿Cambia de mes (o año)? Entonces la entrada se mueve bajo el mes nuevo de tickler.org
export const ticklerMonthChanges = (from, to) =>
  !from || !to || from.getFullYear() !== to.getFullYear() || from.getMonth() !== to.getMonth();

// «2026-10-22» ⇄ Date (para el <input type="date">)
export const toDateInput = (d) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
    : '';
export const fromDateInput = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
