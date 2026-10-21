// ORG Mode para Eli (4.05): procesos diarios de GTD (Menú ☰ › Procesos › Diarios). Modelo puro:
// de las tareas a lo que se mira en cada paso de «Planificar el día» y «Cerrar el día», y las
// acciones que propone «¿Qué hago ahora?». Solo LEEN :ENERGY: y :EFFORT: (los pone el editor).
import { listOf, isFocus, effortMinutes } from './gtd_model';

export const DAILY_PROCESSES = {
  plan: {
    label: 'Planificar el día',
    icon: 'fas fa-sun',
    steps: [
      {
        id: 'due',
        label: 'Programadas de hoy y vencidas',
        icon: 'far fa-calendar-alt',
        hint: 'Lo que tiene fecha (programada o límite) de hoy o ya pasada. ¿Se hace hoy?',
      },
      {
        id: 'waiting',
        label: 'Waiting atrasados',
        icon: 'fas fa-hourglass-half',
        hint: 'Esperas cuya fecha ya ha llegado: marca lo recibido o reclámalo.',
      },
      {
        id: 'tickler',
        label: 'Tickler de hoy',
        icon: 'fas fa-bell',
        hint:
          'Recordatorios del Tickler que tocan hoy (o antes). Pásalos al Inbox para procesarlos.',
      },
      {
        id: 'pick',
        label: 'Elegir para Focus',
        icon: 'fas fa-star',
        hint: 'Marca con ★ de 3 a 5 acciones para hoy. Lo demás puede esperar.',
      },
    ],
  },
  close: {
    label: 'Cerrar el día',
    icon: 'fas fa-moon',
    steps: [
      {
        id: 'done',
        label: 'Marcar lo hecho',
        icon: 'fas fa-check',
        hint: 'Marca como hecho lo que has terminado hoy.',
      },
      {
        id: 'capture',
        label: 'Capturas sueltas',
        icon: 'fas fa-inbox',
        hint: 'Notas, mensajes, ideas que han quedado sueltos: apúntalos al Inbox.',
      },
      {
        id: 'leftover',
        label: 'Lo de Focus sin hacer',
        icon: 'fas fa-star-half-alt',
        hint: 'Para cada una: se queda para mañana, quitarle la ★ o reprogramarla.',
      },
    ],
  },
  now: {
    label: '¿Qué hago ahora?',
    icon: 'fas fa-bolt',
    steps: [
      {
        id: 'now',
        label: 'Elige dónde estás, el tiempo y la energía',
        icon: 'fas fa-bolt',
        hint: 'Te propongo hasta 3 acciones de Next que encajan.',
      },
    ],
  },
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');
const firstDate = (t) => {
  const ds = [t.deadline, t.scheduled].filter(Boolean);
  return ds.length ? Math.min(...ds.map((d) => +d)) : Infinity;
};
const byDate = (a, b) => firstDate(a) - firstDate(b) || byTitle(a, b);
const isOpenAction = (t) => !!t.keyword && !t.isDone && !t.isTrashed && !t.isProject;
const dueBy = (t, t0) =>
  (!!t.scheduled && +startOfDay(t.scheduled) <= +t0) ||
  (!!t.deadline && +startOfDay(t.deadline) <= +t0);

// Planificar el día. `tickler`: las entradas de tickler.org (aparte, porque GTD no siempre lo carga)
export const planDay = (tasks, today = new Date(), tickler = []) => {
  const t0 = startOfDay(today);
  const open = tasks.filter(isOpenAction);
  const lists = new Map(open.map((t) => [t.key, listOf(t, today)]));
  const usable = (t) => !['parked', 'habit', 'trash', 'logbook', 'done'].includes(lists.get(t.key));
  const due = open
    .filter((t) => !t.isHabit && usable(t) && lists.get(t.key) !== 'waiting' && dueBy(t, t0))
    .sort(byDate);
  const waiting = open.filter((t) => lists.get(t.key) === 'waiting' && dueBy(t, t0)).sort(byDate);
  const ticklerToday = tickler
    .filter((t) => !t.isDone && !t.isTrashed && !t.isProject && !!t.scheduled)
    .filter((t) => +startOfDay(t.scheduled) <= +t0)
    .sort(byDate);
  // Candidatas para ★: lo que vence hoy y las acciones de Next (las que ya tienen ★, primero)
  const seen = new Set();
  const pool = [...due, ...open.filter((t) => lists.get(t.key) === 'next').sort(byTitle)].filter(
    (t) => !seen.has(t.key) && !!seen.add(t.key)
  );
  const pick = [
    ...pool.filter((t) => t.priority === 'A'),
    ...pool.filter((t) => t.priority !== 'A'),
  ];
  const stars = open.filter((t) => t.priority === 'A' && usable(t)).length;
  return { due, waiting, tickler: ticklerToday, pick, stars };
};

// Cerrar el día
export const closeDay = (tasks, today = new Date()) => {
  const open = tasks.filter(isOpenAction);
  const focus = open.filter((t) => isFocus(t, today)).sort(byDate);
  const focusKeys = new Set(focus.map((t) => t.key));
  const next = open
    .filter((t) => !focusKeys.has(t.key) && listOf(t, today) === 'next')
    .sort(byTitle);
  const inbox = tasks.filter((t) => !t.isProject && listOf(t, today) === 'inbox');
  return { focus, next, inbox, leftover: focus };
};

// Cuántos elementos hay en un paso
export const dailyCount = (data, id) => {
  if (!data) return 0;
  if (id === 'done') return data.focus.length + data.next.length;
  if (id === 'capture') return data.inbox.length;
  return (data[id] || []).length;
};

// ¿Qué hago ahora? Etiquetas «de lugar»: las que empiezan por @ (sin la de Inbox); si no hay
// ninguna, todas las de las acciones de Next
export const placeTags = (tasks, today = new Date(), skip = []) => {
  const lower = skip.map((s) => String(s).toLowerCase());
  const pool = tasks.filter((t) => isOpenAction(t) && listOf(t, today) === 'next');
  const all = new Set();
  pool.forEach((t) =>
    (t.tags || []).forEach((g) => {
      if (!lower.includes(String(g).toLowerCase()) && String(g).toLowerCase() !== 'trash')
        all.add(g);
    })
  );
  const list = Array.from(all).sort((a, b) => a.localeCompare(b));
  const at = list.filter((g) => g.startsWith('@'));
  return at.length ? at : list;
};

export const NOW_TIMES = [
  { id: '10', label: '10 min', max: 10 },
  { id: '30', label: '30 min', max: 30 },
  { id: '60', label: '1 h', max: 60 },
  { id: '120', label: '2 h', max: 120 },
];
export const NOW_ENERGY = ['Low', 'Medium', 'High'];
const ENERGY_RANK = { quickwin: 1, low: 1, medium: 2, high: 3 };
export const isQuick = (t) =>
  String(t.energy || '').toLowerCase() === 'quickwin' ||
  (effortMinutes(t.effort) != null && effortMinutes(t.effort) <= 10);

// Acciones que encajan (todas, ordenadas; la tarjeta enseña de 3 en 3).
// opts: { tag, time (id de NOW_TIMES), energy (Low/Medium/High), quick }
export const whatNow = (tasks, opts = {}, today = new Date()) => {
  const { tag = null, time = null, energy = null, quick = false } = opts;
  const t0 = startOfDay(today);
  const bucket = NOW_TIMES.find((b) => b.id === time);
  const maxEnergy = energy ? ENERGY_RANK[String(energy).toLowerCase()] || 3 : null;
  const out = tasks.filter((t) => {
    if (!isOpenAction(t)) return false;
    const l = listOf(t, today);
    if (l !== 'next' && !isFocus(t, today)) return false;
    if (['waiting', 'someday', 'parked', 'habit'].includes(l)) return false;
    if (tag && !(t.tags || []).includes(tag)) return false;
    if (quick && !isQuick(t)) return false;
    const m = effortMinutes(t.effort);
    if (bucket && m != null && m > bucket.max) return false;
    if (maxEnergy && t.energy) {
      const r = ENERGY_RANK[String(t.energy).toLowerCase()];
      if (r && r > maxEnergy) return false;
    }
    return true;
  });
  // ★ y lo que vence primero; luego lo que tiene tiempo puesto (lo más corto antes)
  const score = (t) => (t.priority === 'A' ? 0 : 2) + (dueBy(t, t0) ? 0 : 1);
  const mins = (t) => {
    const m = effortMinutes(t.effort);
    return m == null ? 9999 : m;
  };
  return out.sort((a, b) => score(a) - score(b) || mins(a) - mins(b) || byTitle(a, b));
};
