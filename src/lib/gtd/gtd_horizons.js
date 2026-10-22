// ORG Mode para Eli (4.07): horizontes de GTD (de David Allen) en un fichero propio (por defecto
// horizons.org, junto al de entrada, como tickler.org):
//   * Propósito y principios   (H5: el texto de debajo)
//   * Visión (3–5 años)        (H4: el texto de debajo)
//   * Objetivos (1–2 años)     (H3: cada «**» es un objetivo, con :ID: y :AREA:)
//   * Áreas de responsabilidad (H2: cada «**» es un valor de :AREA:)
// Un proyecto apunta a su objetivo con «:OBJETIVO: [[id:UUID][Título]]» (como :PROYECTO:); sin
// objetivo, cuenta su área. Modelo puro: la página es la sección «Horizontes» de GTD y la
// revisión, la tarjeta Gtd/GtdHorizonsReview.
import { Map as IMap } from 'immutable';
import {
  buildTasks,
  projectsOf,
  projectState,
  propertyValue,
  parseProjectLink,
  areasOf,
} from './gtd_model';

export const OBJECTIVE_PROPERTY = 'OBJETIVO';
// (4.16) plazo de cada objetivo (:PLAZO:, texto) y grupos por plazo
export const TERM_PROPERTY = 'PLAZO';
export const HORIZON_TERMS = [
  { id: 'quarter', label: 'Este trimestre' },
  { id: 'year', label: 'Este año' },
  { id: '2y', label: '1–2 años' },
];
export const NO_TERM = { id: 'none', label: 'Sin plazo' };
// del texto de :PLAZO: al id (admite variantes: «trimestre», «año», «1-2 años», «2 años»…)
export const termOf = (value) => {
  const t = String(value || '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (/trimestre|quarter|^q\d?$/.test(t)) return 'quarter';
  if (/2|dos|year.?s|años/.test(t)) return '2y';
  if (/año|year/.test(t)) return 'year';
  return null;
};
export const termLabel = (id) => (HORIZON_TERMS.find((x) => x.id === id) || NO_TERM).label;
// Objetivos agrupados por plazo (en el orden de HORIZON_TERMS; «Sin plazo» al final; sin vacíos)
export const objectivesByTerm = (objectives) =>
  [...HORIZON_TERMS, NO_TERM]
    .map((g) => ({
      ...g,
      items: objectives.filter((o) => (o.term || 'none') === g.id),
    }))
    .filter((g) => g.items.length > 0);
export const HORIZONS_NAME = 'horizons.org';

// Plantilla del fichero nuevo
export const HORIZONS_TEMPLATE = [
  '#+TITLE: Horizontes',
  '',
  '* Propósito y principios',
  'Por qué haces lo que haces y qué es importante para ti.',
  '* Visión (3–5 años)',
  'Cómo te gustaría que fuera tu vida y tu trabajo dentro de unos años.',
  '* Objetivos (1–2 años)',
  '* Áreas de responsabilidad',
  '** Trabajo',
  '** Casa',
  '** Salud',
  '** Familia',
  '** Dinero',
  '',
].join('\n');

// horizons.org junto al fichero dado (o en la raíz)
export const horizonsPathNear = (path) => {
  const i = (path || '').lastIndexOf('/');
  return (i >= 0 ? path.slice(0, i + 1) : '/') + HORIZONS_NAME;
};

// Qué es cada cabecera de primer nivel (por su título)
export const horizonKindOf = (title) => {
  const t = String(title || '').toLowerCase();
  if (/prop[oó]sito|principio/.test(t)) return 'purpose';
  if (/visi[oó]n/.test(t)) return 'vision';
  if (/objetivo|meta/.test(t)) return 'goals';
  if (/[aá]rea|responsabilidad/.test(t)) return 'areas';
  return null;
};

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

// Lo que hay en el fichero de horizontes (`file` = fichero de immutable; null si no está)
export const parseHorizons = (file, path) => {
  const out = {
    path,
    purpose: null,
    vision: null,
    goals: null,
    areas: null,
    objectives: [],
    areaList: [],
  };
  if (!file || !file.get('headers')) return out;
  const items = buildTasks(IMap([[path, file]]), []);
  let section = null;
  items.forEach((t) => {
    if (t.level === 1) {
      const k = horizonKindOf(t.title);
      section = k && !out[k] ? k : null;
      if (section) out[section] = t;
      return;
    }
    if (!section || t.level !== out[section].level + 1 || t.isTrashed) return;
    if (section === 'goals') {
      out.objectives.push({
        task: t,
        key: t.key,
        orgId: t.orgId || null,
        title: t.title,
        area: t.ownArea || null,
        term: termOf(propertyValue(t.header, TERM_PROPERTY)),
        done: !!t.isDone,
      });
    } else if (section === 'areas') {
      out.areaList.push({ task: t, key: t.key, name: t.title });
    }
  });
  return out;
};

// Objetivo al que apunta un proyecto (:OBJETIVO:)
export const objectiveRefOf = (task) =>
  task && task.header ? parseProjectLink(propertyValue(task.header, OBJECTIVE_PROPERTY)) : null;

const isAlive = (p, today) => projectState(p, today) === 'active';

// Página «Horizontes»: cada objetivo con sus proyectos y cada área con los suyos. `empty` = nada
// activo (ningún proyecto, o todos dormidos o por empezar). Proyectos sin objetivo ni área de la
// lista, aparte.
export const horizonsView = (h, tasks, today = new Date()) => {
  const projects = projectsOf(tasks.filter((t) => !t.isTrashed));
  const byObjective = new Map();
  const linked = new Set();
  const ids = new Set(h.objectives.filter((o) => o.orgId).map((o) => norm(o.orgId)));
  projects.forEach((p) => {
    const ref = objectiveRefOf(p);
    if (!ref || !ids.has(norm(ref.id))) return;
    const k = norm(ref.id);
    if (!byObjective.has(k)) byObjective.set(k, []);
    byObjective.get(k).push(p);
    linked.add(p.key);
  });
  const sortP = (list) => list.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const objectives = h.objectives
    .filter((o) => !o.done)
    .map((o) => {
      const list = sortP((o.orgId && byObjective.get(norm(o.orgId))) || []);
      return { ...o, projects: list, empty: !list.some((p) => isAlive(p, today)) };
    });
  const names = new Set(h.areaList.map((a) => norm(a.name)));
  const areas = h.areaList.map((a) => {
    const list = sortP(projects.filter((p) => norm(p.area) === norm(a.name)));
    return { ...a, projects: list, empty: !list.some((p) => isAlive(p, today)) };
  });
  const loose = sortP(projects.filter((p) => !linked.has(p.key) && !names.has(norm(p.area))));
  return { objectives, areas, loose };
};

// Áreas usadas en las tareas que no están en el fichero (para añadirlas)
export const missingAreas = (h, tasks) => {
  const names = new Set(h.areaList.map((a) => norm(a.name)));
  return areasOf(tasks.filter((t) => !t.isTrashed && !t.isDone)).filter((a) => !names.has(norm(a)));
};

// Objetivos para elegir en el editor de un proyecto
export const objectivePickItems = (h) =>
  h.objectives
    .filter((o) => !o.done)
    .map((o) => ({ id: o.key, label: o.title, hint: o.area || '' }));

// Pasos de la Revisión de horizontes (de abajo arriba)
export const HORIZON_STEPS = [
  {
    id: 'areas',
    label: 'Áreas de responsabilidad',
    icon: 'fas fa-map-signs',
    hint: '¿Cada área tiene algún proyecto en marcha? ¿Falta alguna?',
  },
  {
    id: 'goals',
    label: 'Objetivos (1–2 años)',
    icon: 'fas fa-bullseye',
    hint: '¿Algún proyecto mueve cada objetivo? ¿Sobra o falta alguno?',
  },
  {
    id: 'vision',
    label: 'Visión (3–5 años)',
    icon: 'fas fa-eye',
    hint: '¿Sigue siendo lo que quieres? Cámbiala si hace falta.',
  },
  {
    id: 'purpose',
    label: 'Propósito y principios',
    icon: 'fas fa-compass',
    hint: '¿Por qué haces lo que haces? Léelo con calma.',
  },
];

// (4.16) Frecuencias oficiales de revisión (aviso suave). `days` = cada cuántos días; `recal` = el
// recalibrado trimestral de los objetivos. Visión y propósito: «cuando haga falta» (sin aviso).
export const HORIZON_FREQ = [
  { id: 'projects', label: 'Proyectos', every: 'semanal', days: 7 },
  { id: 'areas', label: 'Áreas', every: 'mensual', days: 30 },
  {
    id: 'goals',
    label: 'Objetivos',
    every: 'anual (recalibrar cada trimestre)',
    days: 365,
    recal: 91,
  },
  { id: 'vision', label: 'Visión', every: 'cuando haga falta', days: null },
  { id: 'purpose', label: 'Propósito y principios', every: 'cuando haga falta', days: null },
];
export const LS_HZ_LAST = 'eliHzLastReview';

const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0'
  )}`;
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

export const getHzLastReview = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(LS_HZ_LAST) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
};
export const markHzReviewed = (level, today = new Date()) => {
  const v = { ...getHzLastReview(), [level]: isoDay(today) };
  try {
    window.localStorage.setItem(LS_HZ_LAST, JSON.stringify(v));
  } catch (e) {
    // sin almacenamiento
  }
  return v;
};

// Avisos: [{ id, label, every, days (desde la última o null = nunca), kind: 'due' | 'recal' }]
// `last` = { projects, areas, goals… } con fechas AAAA-MM-DD (projects = la revisión semanal)
export const horizonReminders = (last = {}, today = new Date()) => {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out = [];
  HORIZON_FREQ.forEach((f) => {
    if (!f.days) return;
    const d = parseDay(last[f.id]);
    const since = d ? Math.round((+t0 - +d) / 86400000) : null;
    if (since === null || since >= f.days) out.push({ ...f, since, kind: 'due' });
    else if (f.recal && since >= f.recal) out.push({ ...f, since, kind: 'recal' });
  });
  return out;
};
