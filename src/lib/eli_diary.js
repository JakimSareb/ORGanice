// ORG Mode para Eli (4.26): diario. Un fichero por año en la subcarpeta `pages/` junto al de
// entrada: `pages/diari-2026.org`. Dentro: `* 2026-10 octubre` › `** 2026-10-24 sábado` ›
// `*** 13:23 - texto` (marcas BuJo: - nota, o evento, x hecho, ! importante). Las respuestas de
// la plantilla van en el cuerpo del día como lista de descripción (`- Pregunta :: respuesta`).
// El diario se lee y se escribe directamente (como scratch.org): no entra en GTD, la agenda ni
// los avisos. Aquí solo hay funciones puras (y el ajuste en localStorage).
// (4.38) Formato org-journal (https://github.com/bastibe/org-journal): por defecto un fichero por
// año `journal/AAAA.org`; cada día `* sábado, 24 octubre 2026` con `:CREATED: 20261024` (y su
// `:ID:` y contadores) y cada apunte `** 13:23 o texto` (cuerpo = continuación). Las respuestas de la
// plantilla, bajo `** Plantilla del día`. Se siguen LEYENDO (y escribiendo, si el fichero lo es) los
// ficheros del formato anterior (`* AAAA-MM mes` › `** AAAA-MM-DD día`): no se mezclan formatos
// dentro de un fichero. Las funciones de lectura aceptan un texto o un «paquete» de ficheros del año
// (`{ year, files: [{ path, text, fileDay }] }`).
import { DIARY_DEFAULTS } from './eli_defaults';

export const MARKS = [
  { id: '-', label: 'Nota', sign: '–' },
  { id: 'o', label: 'Evento', sign: '○' },
  { id: 'x', label: 'Hecho', sign: '×' },
  { id: '!', label: 'Importante', sign: '!' },
];
const MARK_IDS = MARKS.map((m) => m.id);
export const markSign = (id) => (MARKS.find((m) => m.id === id) || MARKS[0]).sign;

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const DEFAULT_TEMPLATE = [
  '¿Cómo me siento hoy? (1–5 y una palabra)',
  'Lo más importante de hoy',
  'Agradecido por…',
  '¿Qué he aprendido?',
  'Mañana quiero…',
];

// ---- Ajuste (localStorage `eliDiary`) ----
const KEY = 'eliDiary';
// (4.27) Contadores del registro mensual: se guardan como propiedades del día (`:B: X`, `:KM: 4,5`)
export const COUNTER_TYPES = [
  { id: 'bool', label: 'Sí/No' },
  { id: 'num', label: 'Número' },
  { id: 'note', label: 'Nota' },
];
export const DEFAULT_COUNTERS = [
  { key: 'B', name: 'Biblia', type: 'bool' },
  { key: 'KM', name: 'Kilómetros', type: 'num' },
];
// (4.33) Frecuencia: los diarios van en el día; los mensuales (p. ej. Cintura) en el MES del diari
export const COUNTER_FREQS = [
  { id: 'day', label: 'Diario' },
  { id: 'month', label: 'Mensual' },
];
export const isMonthlyCounter = (c) => !!c && c.freq === 'month';
export const dailyCounters = (list) => (list || []).filter((c) => !isMonthlyCounter(c));
export const monthlyCounters = (list) => (list || []).filter(isMonthlyCounter);
const RESERVED_KEYS = ['ID', 'CREATED', 'PROPERTIES', 'END'];
export const counterKey = (k) =>
  String(k || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
export const cleanCounters = (list) => {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((c) => ({
      key: counterKey(c && c.key),
      name: String((c && c.name) || '').trim(),
      type: COUNTER_TYPES.some((t) => t.id === (c && c.type)) ? c.type : 'bool',
      // (4.33) solo los mensuales llevan `freq` (los diarios, como antes)
      ...(c && c.freq === 'month' ? { freq: 'month' } : {}),
    }))
    .filter((c) => {
      if (!c.key || RESERVED_KEYS.includes(c.key) || seen.has(c.key)) return false;
      seen.add(c.key);
      return true;
    })
    .map((c) => ({ ...c, name: c.name || c.key }));
};

// ---- (4.38) org-journal: ajustes ----
export const JOURNAL_TYPES = [
  { id: 'daily', label: 'Día' },
  { id: 'weekly', label: 'Semana' },
  { id: 'monthly', label: 'Mes' },
  { id: 'yearly', label: 'Año' },
];
export const PLANTILLA = 'Plantilla del día';
export const cleanJournal = (j) => {
  const r = j && typeof j === 'object' ? j : {};
  const D = DIARY_DEFAULTS.journal;
  const str = (v, d) => (typeof v === 'string' && v.trim() ? v.trim() : d);
  const ws = parseInt(r.weekStart, 10);
  return {
    type: JOURNAL_TYPES.some((t) => t.id === r.type) ? r.type : D.type,
    fileFormat: str(r.fileFormat, D.fileFormat).replace(/\.org$/i, '') || D.fileFormat,
    header: typeof r.header === 'string' ? r.header : D.header,
    dateFormat: str(r.dateFormat, D.dateFormat),
    weekStart: ws >= 1 && ws <= 7 ? ws : D.weekStart,
  };
};

const DEFAULT_CFG = {
  dir: DIARY_DEFAULTS.dir, // (4.37) `journal/` (solo el valor por DEFECTO: lo guardado se respeta)
  templateOn: true,
  template: DEFAULT_TEMPLATE,
  inSystem: true,
};
export const getDiaryCfg = () => {
  let raw = null;
  try {
    raw = JSON.parse(window.localStorage.getItem(KEY) || 'null');
  } catch (e) {
    raw = null;
  }
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    dir: typeof r.dir === 'string' ? r.dir : DEFAULT_CFG.dir,
    templateOn: r.templateOn !== false,
    template: Array.isArray(r.template)
      ? r.template.map((q) => String(q).trim()).filter(Boolean)
      : DEFAULT_CFG.template,
    inSystem: r.inSystem !== false,
    monthlyOn: r.monthlyOn !== false,
    counters: Array.isArray(r.counters)
      ? cleanCounters(r.counters)
      : cleanCounters(DEFAULT_COUNTERS),
    // (4.33) al abrir la app (desde el icono): 'diary' = Diario de hoy | 'last' = última vista
    startView:
      r.startView === 'last' || r.startView === 'diary' ? r.startView : DIARY_DEFAULTS.startView,
    // (4.38) formato org-journal y franja «Hábitos de hoy»
    journal: cleanJournal(r.journal),
    habitsOn: typeof r.habitsOn === 'boolean' ? r.habitsOn : DIARY_DEFAULTS.habitsOn,
  };
};
export const setDiaryCfg = (patch) => {
  const next = { ...getDiaryCfg(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    // sin almacenamiento: no se guarda
  }
  return next;
};

// ---- Rutas ----
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const parseDayKey = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
export const timeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const longDate = (d) =>
  `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;

const dirOf = (path) => {
  const i = String(path || '').lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '/';
};
// Carpeta del diario: la del ajuste (absoluta, o relativa a la del de entrada) o `pages/` junto al
// de entrada
export const diaryDir = (chosenDir, inboxPath) => {
  const base = dirOf(inboxPath || '/');
  let d = String(chosenDir || '').trim();
  if (!d) d = 'pages/';
  if (!d.startsWith('/')) d = base + d;
  if (!d.endsWith('/')) d += '/';
  return d.replace(/\/{2,}/g, '/');
};
// Fichero del formato anterior (4.26–4.37): `diari-AAAA.org`. (4.38) Se sigue leyendo.
export const diaryPath = (year, dir) => `${dir}diari-${year}.org`;
export const legacyDiaryPath = diaryPath;

// ---- (4.38) org-journal: nombres de fichero, fechas ----
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const isoWeek = (d) => {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const y = t.getFullYear();
  const first = new Date(y, 0, 4);
  const thu1 = new Date(y, 0, 4 + 3 - ((first.getDay() + 6) % 7));
  return { y, w: 1 + Math.round((t - thu1) / (7 * 86400000)) };
};
// `format-time-string` reducido (nombres en español): %Y %y %m %d %e %H %M %R %A %a %B %b %F %V %G %j
export const strftime = (fmt, d) =>
  String(fmt || '').replace(/%([a-zA-Z%])/g, (all, c) => {
    const Y = d.getFullYear();
    switch (c) {
      case 'Y':
        return String(Y);
      case 'y':
        return pad(Y % 100);
      case 'm':
        return pad(d.getMonth() + 1);
      case 'd':
        return pad(d.getDate());
      case 'e':
        return String(d.getDate());
      case 'H':
        return pad(d.getHours());
      case 'M':
        return pad(d.getMinutes());
      case 'R':
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      case 'A':
        return WEEKDAYS[d.getDay()];
      case 'a':
        return WEEKDAYS_SHORT[d.getDay()];
      case 'B':
        return MONTHS[d.getMonth()];
      case 'b':
        return MONTHS_SHORT[d.getMonth()];
      case 'F':
        return `${Y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      case 'V':
        return pad(isoWeek(d).w);
      case 'G':
        return String(isoWeek(d).y);
      case 'j':
        return String(
          Math.round((new Date(Y, d.getMonth(), d.getDate()) - new Date(Y, 0, 1)) / 86400000) + 1
        ).padStart(3, '0');
      case '%':
        return '%';
      default:
        return all;
    }
  });

// Inicio del periodo del fichero (como `org-journal--convert-time-to-file-type-time`)
export const periodStart = (date, j) => {
  const jc = cleanJournal(j);
  const y = date.getFullYear();
  const m = date.getMonth();
  if (jc.type === 'yearly') return new Date(y, 0, 1);
  if (jc.type === 'monthly') return new Date(y, m, 1);
  if (jc.type === 'weekly') {
    const back = (date.getDay() - (jc.weekStart % 7) + 7) % 7;
    return new Date(y, m, date.getDate() - back);
  }
  return new Date(y, m, date.getDate());
};
export const journalFileName = (date, j) =>
  `${strftime(cleanJournal(j).fileFormat, periodStart(date, j))}.org`;
export const journalFilePath = (date, j, dir) => `${dir}${journalFileName(date, j)}`;

// Patrón de nombre (como `org-journal--format->regex`) → fecha del fichero
const fileRe = (fmt) => {
  const groups = [];
  let src = '';
  String(fmt || '')
    .replace(/%F/g, '%Y-%m-%d')
    .split(/(%[a-zA-Z%])/)
    .forEach((part) => {
      if (!part) return;
      if (part === '%Y' || part === '%G') {
        groups.push('y');
        src += '(\\d{4})';
      } else if (part === '%m') {
        groups.push('m');
        src += '(\\d{2})';
      } else if (part === '%d') {
        groups.push('d');
        src += '(\\d{2})';
      } else if (part === '%V') src += '\\d{2}';
      else if (/^%[aAbB]$/.test(part)) src += '[^\\d\\s/._-]{3,}';
      else if (part === '%%') src += '%';
      else if (part.startsWith('%')) src += '.+?';
      else src += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
  return { re: new RegExp(`^${src}\\.org$`, 'i'), groups };
};
const baseName = (p) => String(p || '').replace(/^.*\//, '');
export const journalFileDate = (path, fmt) => {
  const { re, groups } = fileRe(fmt);
  const m = re.exec(baseName(path));
  if (!m) return null;
  const v = { y: null, m: 1, d: 1 };
  groups.forEach((g, i) => (v[g] = +m[i + 1]));
  if (!v.y) return null;
  const date = new Date(v.y, v.m - 1, v.d);
  return date.getMonth() === v.m - 1 ? date : null;
};
// Patrones que se reconocen al leer: el del ajuste y los habituales de org-journal
export const journalPatterns = (j) =>
  Array.from(new Set([cleanJournal(j).fileFormat, '%Y%m%d', '%Y']));
// Fecha de un fichero del diario con cualquiera de los patrones (o null)
export const journalFileDateAny = (path, j) => {
  for (const f of journalPatterns(j)) {
    const d = journalFileDate(path, f);
    if (d) return { date: d, daily: /%d|%F/.test(f) };
  }
  return null;
};

// (4.27) también el registro mensual (`mensual-AAAA.org`): fuera de GTD, agenda y avisos
// (4.38) y los ficheros org-journal (`AAAA.org`…) que estén en la carpeta del diario
let diaryFolderCache = { raw: undefined, name: '' };
const diaryFolderName = () => {
  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch (e) {
    raw = null;
  }
  if (raw !== diaryFolderCache.raw) {
    const c = getDiaryCfg();
    const dir = String(c.dir || '').trim() || 'pages/';
    diaryFolderCache = {
      raw,
      name: dir.replace(/\/+$/, '').replace(/^.*\//, '').toLowerCase(),
      journal: c.journal,
    };
  }
  return diaryFolderCache;
};
export const isDiaryPath = (p) => {
  const s = String(p || '');
  if (/(^|\/)(diari|mensual)-\d{4}\.org$/i.test(s)) return true;
  const parts = s.split('/');
  if (parts.length < 2) return false;
  const folder = diaryFolderName();
  if (!folder.name || String(parts[parts.length - 2]).toLowerCase() !== folder.name) return false;
  return !!journalFileDateAny(s, folder.journal);
};
// Inbox junto al que va el diario: el elegido en Ajustes o el inbox.org cargado de ruta más corta
export const inboxNear = (chosenInbox, loadedPaths) =>
  chosenInbox ||
  (loadedPaths || [])
    .filter((p) => /(^|\/)inbox\.org$/i.test(p))
    .sort((a, b) => a.length - b.length)[0] ||
  '/inbox.org';

// :ID: de un día (legible y estable: así un enlace [[id:diari-2026-10-24]] lleva al día)
export const dayOrgId = (key) => `diari-${key}`;
export const dayOfOrgId = (id) => {
  const m = /^diari-(\d{4}-\d{2}-\d{2})$/.exec(id || '');
  return m ? m[1] : null;
};
// (4.27) :ID: de un mes del diario (`diari-2026-10`): el enlace «Ver en el diari» del registro
export const monthOrgId = (mk) => `diari-${mk}`;
// Qué abrir con un [[id:…]] del diario: { date } (día) o { month } (mes, en el calendario)
export const diaryLinkDetail = (id) => {
  const day = dayOfOrgId(id);
  if (day) return { date: day };
  const m = /^diari-(\d{4}-\d{2})$/.exec(id || '');
  return m ? { month: m[1] } : null;
};
export const openDiary = (detail = {}) =>
  window.dispatchEvent(new CustomEvent('eli:diary', { detail }));

// ---- Fichero → árbol ----
const HEADING = /^(\*+)\s+(.*)$/;
// (4.38) ¿Fichero del formato anterior? Hay `* AAAA-MM mes` y ningún `:CREATED: AAAAMMDD`.
const LEGACY_MONTH = /^\* \d{4}-\d{2}(\s|$)/m;
const CREATED8 = /^\s*:CREATED:\s+\d{8}\s*$/m;
export const isLegacyText = (text) => {
  const t = String(text || '');
  return LEGACY_MONTH.test(t) && !CREATED8.test(t);
};
const createdOf = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const keyOf = (y, m, d) => {
  const date = new Date(+y, +m - 1, +d);
  return date.getMonth() === +m - 1 && date.getDate() === +d ? dayKey(date) : null;
};
// Meses por las 3 primeras letras (español, catalán, inglés)
const MONTH3 = {
  ene: 1, gen: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, mai: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, des: 12, dec: 12,
}; // prettier-ignore
const monthOfName = (s) =>
  MONTH3[
    String(s || '')
      .toLowerCase()
      .slice(0, 3)
  ] || null;
// Fecha del día por su título: «2026-10-24 sábado», «sábado, 24 octubre 2026», «24 de octubre de
// 2026», «Saturday, October 24, 2026»
export const titleDayKey = (title) => {
  const t = String(title || '');
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return keyOf(m[1], m[2], m[3]);
  m = /(\d{1,2})\.?\s+(?:de\s+|d')?([A-Za-zÀ-ÿ]{3,})\.?,?\s+(?:de\s+)?(\d{4})/.exec(t);
  if (m && monthOfName(m[2])) return keyOf(m[3], monthOfName(m[2]), m[1]);
  m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && monthOfName(m[1])) return keyOf(m[3], monthOfName(m[1]), m[2]);
  return null;
};
const drawerProp = (body, key) => {
  if (!/^\s*:PROPERTIES:\s*$/i.test(body[0] || '')) return null;
  const re = new RegExp(`^\\s*:${key}:\\s*(.*)$`, 'i');
  for (let i = 1; i < body.length; i++) {
    if (/^\s*:END:\s*$/i.test(body[i])) break;
    const p = re.exec(body[i]);
    if (p) return p[1].trim();
  }
  return null;
};
const journalDayKey = (d) => {
  const c = /^(\d{4})(\d{2})(\d{2})$/.exec(drawerProp(d.body, 'CREATED') || '');
  if (c) return keyOf(c[1], c[2], c[3]);
  return titleDayKey(d.line.replace(/^\*+\s*/, ''));
};

// `opts.fileDay` (AAAA-MM-DD): fecha del fichero (diarios de org-journal, sin `:CREATED:`)
export const parseTree = (text, opts = {}) => {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!isLegacyText(text)) return parseJournalTree(lines, opts);
  const tree = { head: [], months: [], fmt: 'legacy' };
  let m = null;
  let d = null;
  let e = null;
  const sink = () => (e ? e.body : d ? d.body : m ? m.body : tree.head);
  lines.forEach((line) => {
    const h = HEADING.exec(line);
    const level = h ? h[1].length : 0;
    if (level === 1) {
      const key = (/^(\d{4}-\d{2})\b/.exec(h[2]) || [])[1] || null;
      m = { line, key, body: [], days: [] };
      tree.months.push(m);
      d = e = null;
    } else if (level === 2 && m) {
      const key = (/^(\d{4}-\d{2}-\d{2})\b/.exec(h[2]) || [])[1] || null;
      d = { line, key, body: [], entries: [] };
      m.days.push(d);
      e = null;
    } else if (level === 3 && d) {
      e = { line, body: [] };
      d.entries.push(e);
    } else sink().push(line);
  });
  return tree;
};
// (4.38) org-journal: `* día` › `** apunte`; todo lo de nivel 3 o más va en el cuerpo del apunte.
// Para no cambiar el resto del código, los días van en un «mes» sin línea (`line: null`).
const parseJournalTree = (lines, opts) => {
  const all = { line: null, key: null, body: [], days: [] };
  const tree = { head: [], months: [all], fmt: 'journal' };
  let d = null;
  let e = null;
  lines.forEach((line) => {
    const h = HEADING.exec(line);
    const level = h ? h[1].length : 0;
    if (level === 1) {
      d = { line, key: null, body: [], entries: [] };
      all.days.push(d);
      e = null;
    } else if (level === 2 && d) {
      e = { line, body: [] };
      d.entries.push(e);
    } else (e ? e.body : d ? d.body : tree.head).push(line);
  });
  all.days.forEach((x) => (x.key = journalDayKey(x)));
  // ficheros diarios: la fecha sale del nombre (solo si ningún día lleva fecha propia)
  if (opts && opts.fileDay && !all.days.some((x) => x.key))
    all.days.forEach((x) => (x.key = opts.fileDay));
  return tree;
};
export const serializeTree = (tree) => {
  const out = [...tree.head];
  tree.months.forEach((m) => {
    if (m.line != null) out.push(m.line, ...m.body);
    m.days.forEach((d) => {
      out.push(d.line, ...d.body);
      d.entries.forEach((e) => out.push(e.line, ...e.body));
    });
  });
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n') + '\n';
};

// Texto de un fichero nuevo. (4.38) Cabecera del ajuste (org-journal), con las fechas del inicio del
// periodo. `when` = fecha o año.
export const newFileText = (when, j) => {
  const date = typeof when === 'number' ? new Date(when, 0, 1) : when || new Date();
  const jc = cleanJournal(j);
  const head = strftime(jc.header, periodStart(date, jc)).replace(/\s+$/, '');
  return head ? `${head}\n\n` : '';
};
const monthLine = (d) => `* ${monthKey(d)} ${MONTHS[d.getMonth()]}`;
const dayLine = (d) => `** ${dayKey(d)} ${WEEKDAYS[d.getDay()]}`;
export const answerLine = (q, a = '') => `- ${q} ::${a ? ' ' + a : ''}`;
const isPlantilla = (e) => !!e && e.line.replace(/^\*+\s*/, '').trim() === PLANTILLA;

const findDay = (tree, key) => {
  for (const m of tree.months) {
    const d = m.days.find((x) => x.key === key);
    if (d) return d;
  }
  return null;
};

// Inserta en orden cronológico (ascendente) por `key`
const insertSorted = (list, item) => {
  const i = list.findIndex((x) => x.key && item.key && x.key > item.key);
  if (i < 0) list.push(item);
  else list.splice(i, 0, item);
};

// Asegura el mes y el día (con la plantilla si se crea). Devuelve { tree, day, created }.
// (4.38) En org-journal: `* <fecha>` con `:CREATED:` (salvo ficheros diarios) y la plantilla bajo
// `** Plantilla del día`.
export const ensureDayIn = (tree, date, template = [], j) => {
  const key = dayKey(date);
  const found = findDay(tree, key);
  if (found) return { tree, day: found, created: false };
  if (tree.fmt === 'journal') {
    const jc = cleanJournal(j);
    const day = {
      line: `* ${strftime(jc.dateFormat, date)}`,
      key,
      body: jc.type === 'daily' ? [] : [':PROPERTIES:', `:CREATED:  ${createdOf(date)}`, ':END:'],
      entries: (template || []).length
        ? [{ line: `** ${PLANTILLA}`, body: template.map((q) => answerLine(q)) }]
        : [],
    };
    insertSorted(tree.months[0].days, day);
    return { tree, day, created: true };
  }
  let m = tree.months.find((x) => x.key === monthKey(date));
  if (!m) {
    m = { line: monthLine(date), key: monthKey(date), body: [], days: [] };
    insertSorted(tree.months, m);
  }
  const day = {
    line: dayLine(date),
    key,
    body: (template || []).map((q) => answerLine(q)),
    entries: [],
  };
  insertSorted(m.days, day);
  return { tree, day, created: true };
};

// Árbol del texto para escribir en el día `date` (fichero nuevo = cabecera del ajuste)
const treeFor = (text, date, j) =>
  parseTree(text || newFileText(date, j), {
    fileDay: cleanJournal(j).type === 'daily' ? dayKey(date) : null,
  });

export const ensureDay = (text, date, template = [], j) => {
  const tree = treeFor(text, date, j);
  const { created } = ensureDayIn(tree, date, template, j);
  return { text: serializeTree(tree), created };
};

// Apunte: `*** HH:MM <marca> primera línea` (formato anterior) o `** HH:MM …` (org-journal)
const ENTRY = /^\*+\s+(\d{1,2}:\d{2})(?:\s+([-ox!])(?=\s|$))?\s*(.*)$/;
export const entryTime = (line) => {
  const m = ENTRY.exec(line || '');
  return m ? m[1].padStart(5, '0') : null;
};
// (4.27, usuario) En el formato anterior los apuntes nuevos van como NOTAS del día (líneas de lista
// en el cuerpo: `- 13:23 o texto`, el resto de líneas con dos espacios). (4.38) En org-journal son
// cabeceras `** 13:23 o texto` con la continuación como cuerpo.
const ENTRY_LINE = /^- (\d{1,2}:\d{2})(?:\s+([-ox!])(?=\s|$))?\s*(.*)$/;
const isEntryLine = (l) => ENTRY_LINE.test(l || '') && !/ ::(\s|$)/.test(l || '');
// Bloques de apuntes del cuerpo: [{ start, end (excl.), time }]
const entryBlocks = (body) => {
  const out = [];
  body.forEach((l, i) => {
    if (isEntryLine(l))
      out.push({ start: i, end: i + 1, time: ENTRY_LINE.exec(l)[1].padStart(5, '0') });
    else if (out.length && out[out.length - 1].end === i && /^ {2,}\S/.test(l))
      out[out.length - 1].end = i + 1;
  });
  return out;
};
export const addEntry = (text, date, entry, template = [], j) => {
  const mark = MARK_IDS.includes(entry.mark) ? entry.mark : '-';
  const time = entry.time || timeOf(date);
  const lines = String(entry.text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const first = lines.shift().trim();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const tree = treeFor(text, date, j);
  const { day } = ensureDayIn(tree, date, template, j);
  if (tree.fmt === 'journal') {
    const item = {
      line: `** ${time} ${mark}${first ? ' ' + first : ''}`,
      // (una línea que empiece por «* » sería una cabecera: se separa con un espacio)
      body: lines.map((l) => {
        const t = l.replace(/\s+$/, '');
        return /^\*+\s/.test(t) ? ' ' + t : t;
      }),
    };
    const at = day.entries.findIndex((e) => (entryTime(e.line) || '') > time);
    if (at < 0) day.entries.push(item);
    else day.entries.splice(at, 0, item);
    return serializeTree(tree);
  }
  const item = [
    `- ${time} ${mark}${first ? ' ' + first : ''}`,
    ...lines.map((l) => '  ' + l.trim()),
  ];
  const blocks = entryBlocks(day.body);
  const after = blocks.find((b) => b.time > time);
  let at;
  if (after) at = after.start;
  else if (blocks.length) at = blocks[blocks.length - 1].end;
  else {
    at = day.body.length;
    while (at > 0 && !day.body[at - 1].trim()) at--;
  }
  day.body.splice(at, 0, ...item);
  return serializeTree(tree);
};

// Respuesta de la plantilla: cambia (o añade) `- Pregunta :: respuesta` en el cuerpo del día
// (4.38: en org-journal, en el de `** Plantilla del día`)
export const setAnswer = (text, date, question, answer, j) => {
  const tree = treeFor(text, date, j);
  const { day } = ensureDayIn(tree, date, [], j);
  const clean = String(answer || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  if (tree.fmt === 'journal') {
    const inBody = day.body.findIndex((l) => l.startsWith(`- ${question} ::`));
    if (inBody >= 0) {
      day.body[inBody] = answerLine(question, clean);
      return serializeTree(tree);
    }
    let p = day.entries.find(isPlantilla);
    if (!p) {
      p = { line: `** ${PLANTILLA}`, body: [] };
      day.entries.unshift(p);
    }
    const i = p.body.findIndex((l) => l.startsWith(`- ${question} ::`));
    if (i >= 0) p.body[i] = answerLine(question, clean);
    else {
      let at = p.body.length;
      while (at > 0 && !p.body[at - 1].trim()) at--;
      p.body.splice(at, 0, answerLine(question, clean));
    }
    return serializeTree(tree);
  }
  const i = day.body.findIndex((l) => l.startsWith(`- ${question} ::`));
  if (i >= 0) day.body[i] = answerLine(question, clean);
  else {
    const blocks = entryBlocks(day.body);
    let at = blocks.length ? blocks[0].start : day.body.length;
    while (at > 0 && !day.body[at - 1].trim()) at--;
    day.body.splice(at, 0, answerLine(question, clean));
  }
  return serializeTree(tree);
};

// :ID: del día (para enlazar desde una tarea). Devuelve { text, id }.
export const ensureDayId = (text, date, j) => {
  const tree = treeFor(text, date, j);
  const { day } = ensureDayIn(tree, date, [], j);
  const idLine = day.body.find((l) => /^\s*:ID:\s*\S/i.test(l));
  if (idLine) return { text: serializeTree(tree), id: idLine.replace(/^\s*:ID:\s*/i, '').trim() };
  const id = dayOrgId(day.key);
  const start = day.body.findIndex((l) => /^\s*:PROPERTIES:\s*$/i.test(l));
  // (4.38) tras `:CREATED:` (org-journal la quiere la primera)
  if (start === 0)
    day.body.splice(/^\s*:CREATED:/i.test(day.body[1] || '') ? 2 : 1, 0, `:ID: ${id}`);
  else day.body.unshift(':PROPERTIES:', `:ID: ${id}`, ':END:');
  return { text: serializeTree(tree), id };
};

// ---- Lectura ----
const ANSWER = /^- (.+?) ::\s?(.*)$/;
const parseDaysText = (text, fileDay) => {
  const tree = parseTree(text, { fileDay });
  const days = [];
  tree.months.forEach((m) =>
    m.days.forEach((d) => {
      if (!d.key) return;
      const answers = [];
      const notes = [];
      const props = {};
      const bodyEntries = [];
      let inDrawer = false;
      let lastWasEntry = false;
      d.body.forEach((l) => {
        const wasEntry = lastWasEntry;
        lastWasEntry = false;
        if (!inDrawer && (isEntryLine(l) || (wasEntry && /^ {2,}\S/.test(l)))) lastWasEntry = true;
        if (/^\s*:PROPERTIES:\s*$/i.test(l)) inDrawer = true;
        else if (inDrawer) {
          inDrawer = !/^\s*:END:\s*$/i.test(l);
          const p = /^\s*:([^:\s]+):\s*(.*)$/.exec(l);
          if (inDrawer && p) props[p[1].toUpperCase()] = p[2].trim();
        } else if (isEntryLine(l)) {
          const x = ENTRY_LINE.exec(l);
          bodyEntries.push({
            time: x[1].padStart(5, '0'),
            mark: x[2] || '-',
            text: x[3],
            body: [],
          });
        } else if (bodyEntries.length && /^ {2,}\S/.test(l) && lastWasEntry) {
          bodyEntries[bodyEntries.length - 1].body.push(l.trim());
          return;
        } else {
          const a = ANSWER.exec(l);
          if (a) answers.push({ question: a[1], answer: a[2].trim() });
          else if (l.trim()) notes.push(l);
        }
      });
      // (4.36) Las subcabeceras del usuario bajo el día (`*** Título`, sin hora) ya no son apuntes:
      // salen aparte (`heads`, plegadas y con su título) y siguen contando como «algo del día»
      // (4.38) `** Plantilla del día`: sus `- Pregunta :: respuesta` son las respuestas
      const heads = [];
      const fromHeads = [];
      d.entries.forEach((e) => {
        if (isPlantilla(e)) {
          e.body.forEach((l) => {
            const a = ANSWER.exec(l);
            if (a) answers.push({ question: a[1], answer: a[2].trim() });
            else if (l.trim()) notes.push(l);
          });
          return;
        }
        const x = ENTRY.exec(e.line);
        const body = e.body.join('\n').replace(/\s+$/, '');
        if (!x) heads.push({ title: e.line.replace(/^\*+\s*/, ''), body });
        else fromHeads.push({ time: x[1].padStart(5, '0'), mark: x[2] || '-', text: x[3], body });
      });
      const entries = bodyEntries
        .map((e) => ({ ...e, body: e.body.join('\n') }))
        .concat(fromHeads)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      days.push({ key: d.key, answers, notes, entries, heads, props });
    })
  );
  return days;
};
// (4.38) Varios ficheros del año (`{ year, files }`): los días se juntan (si un día está en dos
// ficheros, p. ej. durante la migración a mano, se suman sus cosas) y cada día sabe su `path`.
const isBundle = (src) => !!src && typeof src === 'object' && Array.isArray(src.files);
const mergeDay = (a, b) => ({
  ...a,
  answers: a.answers.concat(
    b.answers.filter((x) => !a.answers.some((y) => y.question === x.question && y.answer))
  ),
  notes: a.notes.concat(b.notes),
  entries: a.entries.concat(b.entries).sort((x, y) => (x.time || '').localeCompare(y.time || '')),
  heads: a.heads.concat(b.heads),
  props: { ...b.props, ...a.props },
});
export const parseDays = (src, fileDay) => {
  if (!isBundle(src)) return parseDaysText(src, fileDay);
  const byKey = new Map();
  src.files.forEach((f) =>
    parseDaysText(f.text, f.fileDay).forEach((d) => {
      if (src.year && !d.key.startsWith(`${src.year}-`)) return;
      const prev = byKey.get(d.key);
      byKey.set(d.key, prev ? mergeDay(prev, d) : { ...d, path: f.path });
    })
  );
  return Array.from(byKey.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
};

// Días con algo apuntado (apuntes, respuestas o notas)
export const daysWithEntries = (text) =>
  new Set(
    parseDays(text)
      .filter(
        (d) =>
          d.entries.length ||
          (d.heads || []).length ||
          d.notes.length ||
          d.answers.some((a) => a.answer.trim())
      )
      .map((d) => d.key)
  );

// Tal día como hoy: el mismo día (mes y día) de otros años. `texts` = { año: texto }
export const onThisDay = (texts, date) => {
  const md = dayKey(date).slice(5);
  const out = [];
  Object.keys(texts || {})
    .map(Number)
    .filter((y) => y < date.getFullYear())
    .sort((a, b) => b - a)
    .forEach((y) => {
      const day = parseDays(texts[y]).find((d) => d.key === `${y}-${md}`);
      if (day && (day.entries.length || day.answers.some((a) => a.answer)))
        out.push({ year: y, day });
    });
  return out;
};

// Hecho hoy: tareas cerradas (CLOSED) ese día. `tasks` = las de buildTasks (con `closed`: Date)
export const doneOn = (tasks, date) => {
  const key = dayKey(date);
  return (tasks || [])
    .filter((t) => t && t.closed && !t.isTrashed && dayKey(new Date(t.closed)) === key)
    .sort((a, b) => +new Date(a.closed) - +new Date(b.closed));
};

// Mes para el calendario: semanas (lunes primero) con { key, day, inMonth }
export const monthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      week.push({ key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month });
    }
    if (w > 3 && !week.some((x) => x.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
};

// Plantilla editada en Ajustes (una pregunta por línea)
export const templateFromText = (s) =>
  String(s || '')
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

// ---- (4.27) Contadores y :ID: ----
// ¿El día tiene algo? (apuntes, notas, respuestas o contadores; el :ID: y el :CREATED: no cuentan)
export const dayHasData = (d) =>
  !!d &&
  (d.entries.length > 0 ||
    (d.heads || []).length > 0 ||
    d.notes.length > 0 ||
    d.answers.some((a) => a.answer.trim()) ||
    Object.keys(d.props || {}).some(
      (k) => k !== 'ID' && k !== 'CREATED' && String(d.props[k]).trim()
    ));

// Cajón PROPERTIES al principio del cuerpo (lo crea si falta). Devuelve el índice de :END:.
const drawerEnd = (body) => {
  if (!/^\s*:PROPERTIES:\s*$/i.test(body[0] || '')) body.unshift(':PROPERTIES:', ':END:');
  const end = body.findIndex((l, i) => i > 0 && /^\s*:END:\s*$/i.test(l));
  if (end < 0) {
    body.splice(1, 0, ':END:');
    return 1;
  }
  return end;
};
const ensureIdIn = (body, id) => {
  if (body.some((l) => /^\s*:ID:\s*\S/i.test(l))) return false;
  const end = drawerEnd(body);
  body.splice(end, 0, `:ID: ${id}`);
  return true;
};

// Contador del día: `:KEY: valor` en el cajón del día (vacío = se quita)
export const setDayProp = (text, date, key, value, template = [], j) => {
  const k = counterKey(key);
  const tree = treeFor(text, date, j);
  const { day } = ensureDayIn(tree, date, template, j);
  const v = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  const hadDrawer = /^\s*:PROPERTIES:\s*$/i.test(day.body[0] || '');
  if (!hadDrawer && !v) return serializeTree(tree);
  const end = drawerEnd(day.body);
  const re = new RegExp(`^\\s*:${k}:(\\s|$)`, 'i');
  const i = day.body.findIndex((l, j) => j > 0 && j < end && re.test(l));
  if (i >= 0) {
    if (v) day.body[i] = `:${k}: ${v}`;
    else day.body.splice(i, 1);
  } else if (v) day.body.splice(end, 0, `:${k}: ${v}`);
  // cajón vacío: fuera
  if (/^\s*:END:\s*$/i.test(day.body[1] || '')) day.body.splice(0, 2);
  return serializeTree(tree);
};
const setDrawerProp = (body, k, v) => {
  const end = drawerEnd(body);
  const re = new RegExp(`^\\s*:${k}:(\\s|$)`, 'i');
  const i = body.findIndex((l, j) => j > 0 && j < end && re.test(l));
  if (i >= 0) {
    if (v) body[i] = `:${k}: ${v}`;
    else body.splice(i, 1);
  } else if (v) body.splice(end, 0, `:${k}: ${v}`);
  if (/^\s*:END:\s*$/i.test(body[1] || '')) body.splice(0, 2);
};

// Pone :ID: a los días con algo y a sus meses (para que los enlaces del registro mensual también
// valgan en Emacs). Si no cambia nada devuelve el mismo texto.
export const withDiaryIds = (text, fileDay) => {
  if (!text) return text;
  const tree = parseTree(text, { fileDay });
  const data = new Map(parseDays(text, fileDay).map((d) => [d.key, d]));
  let changed = false;
  tree.months.forEach((m) => {
    let any = false;
    m.days.forEach((d) => {
      if (d.key && dayHasData(data.get(d.key))) {
        any = true;
        if (ensureIdIn(d.body, dayOrgId(d.key))) changed = true;
      }
    });
    if (any && m.key && ensureIdIn(m.body, monthOrgId(m.key))) changed = true;
  });
  return changed ? serializeTree(tree) : text;
};

// ---- (4.33) Contadores mensuales: propiedades del MES en el diari (`* 2026-10 octubre` › `:CINTURA: 82`) ----
// (4.38) En org-journal no hay mes: el contador mensual es una propiedad del DÍA en que se anota y
// el valor del mes es el último registrado en ese mes.
// Propiedades de cada mes: { 'AAAA-MM': { CLAVE: valor } }
const monthPropsOfText = (text) => {
  const out = {};
  const tree = parseTree(text);
  if (tree.fmt === 'journal') {
    parseDaysText(text).forEach((d) => {
      const mk = d.key.slice(0, 7);
      const props = out[mk] || (out[mk] = {});
      Object.keys(d.props).forEach((k) => {
        if (k !== 'ID' && k !== 'CREATED' && String(d.props[k]).trim()) props[k] = d.props[k];
      });
    });
    return out;
  }
  tree.months.forEach((m) => {
    if (!m.key) return;
    const props = {};
    if (/^\s*:PROPERTIES:\s*$/i.test(m.body[0] || '')) {
      for (let i = 1; i < m.body.length; i++) {
        if (/^\s*:END:\s*$/i.test(m.body[i])) break;
        const p = /^\s*:([^:\s]+):\s*(.*)$/.exec(m.body[i]);
        if (p) props[p[1].toUpperCase()] = p[2].trim();
      }
    }
    out[m.key] = props;
  });
  return out;
};
export const parseMonthProps = (src) => {
  if (!isBundle(src)) return monthPropsOfText(src);
  const out = {};
  const put = (mk, props) => (out[mk] = { ...(out[mk] || {}), ...props });
  // formato anterior: los cajones de los meses; org-journal: los días, por fecha (el último manda)
  const days = [];
  src.files.forEach((f) => {
    if (isLegacyText(f.text)) {
      const mp = monthPropsOfText(f.text);
      Object.keys(mp).forEach((mk) => put(mk, mp[mk]));
    } else days.push(...parseDaysText(f.text, f.fileDay));
  });
  days
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .forEach((d) => {
      const props = {};
      Object.keys(d.props).forEach((k) => {
        if (k !== 'ID' && k !== 'CREATED' && String(d.props[k]).trim()) props[k] = d.props[k];
      });
      put(d.key.slice(0, 7), props);
    });
  return out;
};

// Contador del mes: `:KEY: valor` en el cajón del mes (vacío = se quita). Crea el mes si falta.
// (4.38) org-journal: en el día del mes que ya lo tiene (el último); si no, en el día `date`.
export const setMonthProp = (text, date, key, value, j) => {
  const k = counterKey(key);
  const tree = treeFor(text, date, j);
  const mk = monthKey(date);
  const v = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  if (tree.fmt === 'journal') {
    const has = tree.months[0].days.filter(
      (d) => d.key && d.key.startsWith(mk) && drawerProp(d.body, k) != null
    );
    if (has.length) {
      setDrawerProp(has[has.length - 1].body, k, v);
      return serializeTree(tree);
    }
    if (!v) return serializeTree(tree);
    const { day } = ensureDayIn(tree, date, [], j);
    setDrawerProp(day.body, k, v);
    return serializeTree(tree);
  }
  let m = tree.months.find((x) => x.key === mk);
  if (!m) {
    m = { line: monthLine(date), key: mk, body: [], days: [] };
    insertSorted(tree.months, m);
  }
  const hadDrawer = /^\s*:PROPERTIES:\s*$/i.test(m.body[0] || '');
  if (!hadDrawer && !v) return serializeTree(tree);
  setDrawerProp(m.body, k, v);
  return serializeTree(tree);
};

// (4.33) Título del día como en Logseq: «Domingo, 25 oct 2026»
const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
];
export const journalTitle = (d) => {
  const w = WEEKDAYS[d.getDay()];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${d.getDate()} ${
    MONTHS_SHORT[d.getMonth()]
  } ${d.getFullYear()}`;
};

// ---- (4.38) Franja «Hábitos de hoy» ----
// Hábitos (`:STYLE: habit`) que tocan hoy (programados para hoy o antes) y los ya hechos hoy (con
// su `- State "DONE" … [hoy` en las notas). `tasks` = las de buildTasks. Devuelve
// [{ task, done }] por título.
export const habitsToday = (tasks, today = new Date()) => {
  const k = dayKey(today);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const doneRe = new RegExp(`- State "[^"]+"\\s+from[^\\n]*\\[${k}`);
  return (
    (tasks || [])
      // (fuera el manual —sample.org— y otros ficheros internos, como en los avisos, y el diario)
      .filter((t) => t && t.isHabit && t.keyword && !t.isTrashed)
      .filter((t) => !/^\/?(__|organice_internal_)/.test(t.path || '') && !isDiaryPath(t.path))
      .map((t) => ({
        task: t,
        done: doneRe.test(t.description || ''),
        due: !t.isDone && !!t.scheduled && new Date(t.scheduled) < end,
      }))
      .filter((x) => x.done || x.due)
      .map((x) => ({ task: x.task, done: x.done && !x.due }))
      .sort((a, b) => String(a.task.title).localeCompare(String(b.task.title)))
  );
};
