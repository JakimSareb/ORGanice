// ORG Mode para Eli (4.20): tiempo registrado (CLOCK cerrados) por tarea, sumando el de sus
// subtareas y, en los proyectos, el de sus acciones (también las enlazadas con :PROYECTO: desde
// otros ficheros). Función pura; el resultado se guarda por lista de tareas (no se recalcula si
// las tareas no cambian). El reloj en marcha NO suma (la fila enseña el relojito naranja).
import { clockEntriesOf, formatClock } from './gtd_tools';

// Milisegundos de los registros cerrados de una cabecera
export const closedClockMillis = (header) => {
  if (!header || !header.get('logBookEntries') || !header.get('logBookEntries').size) return 0;
  return clockEntriesOf(header).reduce(
    (acc, e) => (e.end ? acc + Math.max(0, e.end - e.start) : acc),
    0
  );
};

const totalsCache = new WeakMap();

// Map clave de tarea → ms (solo las que tienen algo): propio + descendientes + acciones del proyecto
export const clockTotalsOf = (tasks) => {
  if (!tasks) return new Map();
  const cached = totalsCache.get(tasks);
  if (cached) return cached;
  const byKey = new Map();
  tasks.forEach((t) => byKey.set(t.key, t));
  const children = new Map();
  const addChild = (parentKey, childKey) => {
    if (!byKey.has(parentKey) || parentKey === childKey) return;
    if (!children.has(parentKey)) children.set(parentKey, new Set());
    children.get(parentKey).add(childKey);
  };
  tasks.forEach((t) => {
    if (t.isTrashed) return;
    if (t.parentId) addChild(`${t.path}::${t.parentId}`, t.key);
    // asignada a un proyecto de otro sitio con :PROYECTO:
    if (t.projectExternal && t.project) addChild(`${t.project.path}::${t.project.id}`, t.key);
  });
  const own = new Map();
  const totals = new Map();
  const visiting = new Set();
  const total = (key) => {
    if (totals.has(key)) return totals.get(key);
    if (visiting.has(key)) return 0;
    visiting.add(key);
    const t = byKey.get(key);
    if (!own.has(key)) own.set(key, t ? closedClockMillis(t.header) : 0);
    let sum = own.get(key);
    (children.get(key) || []).forEach((c) => {
      sum += total(c);
    });
    visiting.delete(key);
    totals.set(key, sum);
    return sum;
  };
  const out = new Map();
  tasks.forEach((t) => {
    if (t.isTrashed) return;
    const ms = total(t.key);
    if (ms > 0) out.set(t.key, ms);
  });
  totalsCache.set(tasks, out);
  return out;
};

// Texto para la fila (vacío si hay menos de un minuto)
export const clockTotalLabel = (ms) => (ms >= 60000 ? formatClock(ms) : '');
