// ORG Mode para Eli: secciones de la vista GTD configurables en Ajustes (qué se ve en cada una,
// si se muestra y en qué orden). Sin tocar nada, todo funciona como antes (DEFAULT_SECTIONS).
//
// Tipos de sección:
// - 'list': listas exclusivas (una tarea va a UNA sola: la primera, en el orden configurado, cuyas
//   reglas cumple). Reglas: estados, etiquetas (propias de la tarea) y propiedades (NOMBRE o
//   NOMBRE=valor); se suman (basta con una). Además: Inbox → «sin estado en el fichero de
//   entrada»; Reference → «sin estado ni tareas debajo».
// - 'view': vistas que cruzan listas (Focus, Scheduled, Deadline, Logbook), con su criterio propio
//   (fechas, ★, terminadas) y, si se quiere, reglas extra que añaden tareas.
// - 'agenda' y 'projects': solo se pueden mostrar/ocultar y ordenar.
//
// Ticks de cada sección: habits (incluir hábitos), future (incluir tareas programadas a futuro),
// futurePriority (… pero sí las que tienen prioridad), parked (incluir tareas de proyectos
// dormidos o que aún no empiezan).

export const SECTION_DEFS = [
  { id: 'agenda', kind: 'agenda', label: 'Agenda', icon: 'fas fa-calendar-alt' },
  { id: 'focus', kind: 'view', label: 'Focus', icon: 'fas fa-star' },
  { id: 'inbox', kind: 'list', label: 'Inbox', icon: 'fas fa-inbox' },
  { id: 'next', kind: 'list', label: 'Next', icon: 'fas fa-play' },
  { id: 'later', kind: 'list', label: 'Todo', icon: 'fas fa-forward' },
  { id: 'waiting', kind: 'list', label: 'Waiting', icon: 'fas fa-hourglass-half' },
  { id: 'scheduled', kind: 'view', label: 'Scheduled', icon: 'far fa-calendar-alt' },
  { id: 'deadline', kind: 'view', label: 'Deadline', icon: 'fas fa-flag' },
  { id: 'someday', kind: 'list', label: 'Someday', icon: 'fas fa-cloud' },
  { id: 'projects', kind: 'projects', label: 'Proyectos', icon: 'fas fa-project-diagram' },
  { id: 'reference', kind: 'list', label: 'Reference', icon: 'far fa-file-alt' },
  { id: 'logbook', kind: 'view', label: 'Logbook', icon: 'fas fa-check' },
];
export const SECTION_IDS = SECTION_DEFS.map((s) => s.id);
export const sectionDef = (id) => SECTION_DEFS.find((s) => s.id === id) || null;

const base = { show: true, states: [], tags: [], props: [] };
const listTicks = { habits: false, future: false, futurePriority: true, parked: false };

export const DEFAULT_SECTIONS = {
  agenda: { ...base },
  focus: { ...base, ...listTicks, star: true, due: true },
  inbox: { ...base, ...listTicks, tags: ['@inbox'], inboxFile: true },
  next: { ...base, ...listTicks, states: ['NEXT'] },
  later: { ...base, ...listTicks, states: ['TODO'] },
  waiting: { ...base, ...listTicks, states: ['WAITING'] },
  scheduled: { ...base, habits: true, future: true, futurePriority: true, parked: false },
  deadline: { ...base, ...listTicks },
  someday: { ...base, ...listTicks, states: ['MAYBE'] },
  projects: {
    ...base,
    allProjects: true,
    habits: false,
    future: false,
    futurePriority: true,
    parked: true,
  },
  reference: { ...base, ...listTicks, noStateLeaf: true },
  logbook: { ...base, habits: true, future: true, futurePriority: true, parked: true },
};

const toArr = (v) =>
  Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean)
    : typeof v === 'string'
    ? v
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

// Configuración efectiva a partir de lo guardado (Map de immutable, objeto o nada)
export const normalizeGtdSections = (stored) => {
  const raw = stored && stored.toJS ? stored.toJS() : stored || {};
  const savedOrder = Array.isArray(raw.order) ? raw.order.filter((id) => SECTION_IDS.includes(id)) : [];
  // Las que falten (p. ej. secciones nuevas de una versión futura) van en su sitio por defecto
  const order = [...savedOrder];
  SECTION_IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const prev = SECTION_IDS.slice(0, i)
      .reverse()
      .find((x) => order.includes(x));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
  });
  const sections = {};
  SECTION_IDS.forEach((id) => {
    const saved = (raw.sections && raw.sections[id]) || {};
    const merged = { ...DEFAULT_SECTIONS[id], ...saved };
    merged.states = toArr(merged.states).map((s) => s.toUpperCase());
    merged.tags = toArr(merged.tags);
    merged.props = toArr(merged.props);
    sections[id] = merged;
  });
  return { order, sections };
};

export const DEFAULT_GTD_CONFIG = normalizeGtdSections(null);

// Configuración activa (la pone la vista GTD desde los ajustes; por defecto, la de siempre)
let current = DEFAULT_GTD_CONFIG;
let currentSource;
export const setGtdConfig = (stored) => {
  if (stored === currentSource) return current;
  currentSource = stored;
  current = normalizeGtdSections(stored);
  return current;
};
export const getGtdConfig = () => current;

export const isSectionShown = (id, cfg = current) => {
  const s = cfg.sections[id];
  return !s || s.show !== false;
};

// Listas exclusivas en su orden
export const exclusiveOrder = (cfg = current) =>
  cfg.order.filter((id) => (sectionDef(id) || {}).kind === 'list');

// Etiquetas de Inbox (para @inbox automático)
export const inboxTags = (cfg = current) => {
  const t = cfg.sections.inbox.tags;
  return t.length ? t : [];
};

// ¿Cumple la tarea las reglas de estados / etiquetas / propiedades de la sección?
export const matchesSectionRules = (task, section, propertyOf) => {
  if (!section) return false;
  if (section.states.length && task.keyword && section.states.includes(task.keyword)) return true;
  if (section.tags.length) {
    const own = (task.ownTags || []).map((t) => t.toLowerCase());
    if (section.tags.some((t) => own.includes(t.toLowerCase()))) return true;
  }
  if (section.props.length && propertyOf) {
    for (const rule of section.props) {
      const [name, ...rest] = rule.split('=');
      const value = propertyOf(task, name.trim());
      if (value === null || value === undefined || value === '') continue;
      if (!rest.length) return true;
      if (value.toLowerCase() === rest.join('=').trim().toLowerCase()) return true;
    }
  }
  return false;
};

// Qué poner al llevar una tarea a una lista (editor, arrastrar): el primer estado configurado
// (o ninguno) y la primera etiqueta si la lista no tiene estados
export const keywordForSection = (id, cfg = current) => {
  const s = cfg.sections[id];
  if (!s) return undefined;
  if ((sectionDef(id) || {}).kind !== 'list') return undefined;
  return s.states.length ? s.states[0] : null;
};
