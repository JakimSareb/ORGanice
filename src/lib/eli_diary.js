// ORG Mode para Eli (4.26): diario. Un fichero por año en la subcarpeta `pages/` junto al de
// entrada: `pages/diari-2026.org`. Dentro: `* 2026-10 octubre` › `** 2026-10-24 sábado` ›
// `*** 13:23 - texto` (marcas BuJo: - nota, o evento, x hecho, ! importante). Las respuestas de
// la plantilla van en el cuerpo del día como lista de descripción (`- Pregunta :: respuesta`).
// El diario se lee y se escribe directamente (como scratch.org): no entra en GTD, la agenda ni
// los avisos. Aquí solo hay funciones puras (y el ajuste en localStorage).

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
const DEFAULT_CFG = { dir: '', templateOn: true, template: DEFAULT_TEMPLATE, inSystem: true };
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
export const diaryPath = (year, dir) => `${dir}diari-${year}.org`;
export const isDiaryPath = (p) => /(^|\/)diari-\d{4}\.org$/i.test(String(p || ''));
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
export const openDiary = (detail = {}) =>
  window.dispatchEvent(new CustomEvent('eli:diary', { detail }));

// ---- Fichero → árbol ----
const HEADING = /^(\*+)\s+(.*)$/;
export const parseTree = (text) => {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const tree = { head: [], months: [] };
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
export const serializeTree = (tree) => {
  const out = [...tree.head];
  tree.months.forEach((m) => {
    out.push(m.line, ...m.body);
    m.days.forEach((d) => {
      out.push(d.line, ...d.body);
      d.entries.forEach((e) => out.push(e.line, ...e.body));
    });
  });
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n') + '\n';
};

export const newFileText = (year) => `#+TITLE: Diari ${year}\n#+STARTUP: overview\n\n`;
const monthLine = (d) => `* ${monthKey(d)} ${MONTHS[d.getMonth()]}`;
const dayLine = (d) => `** ${dayKey(d)} ${WEEKDAYS[d.getDay()]}`;
export const answerLine = (q, a = '') => `- ${q} ::${a ? ' ' + a : ''}`;

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
export const ensureDayIn = (tree, date, template = []) => {
  const key = dayKey(date);
  const found = findDay(tree, key);
  if (found) return { tree, day: found, created: false };
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

export const ensureDay = (text, date, template = []) => {
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { created } = ensureDayIn(tree, date, template);
  return { text: serializeTree(tree), created };
};

// Apunte: `*** HH:MM <marca> primera línea` y el resto de líneas como cuerpo. En orden por hora.
const ENTRY = /^\*{3}\s+(\d{1,2}:\d{2})(?:\s+([-ox!])(?=\s|$))?\s*(.*)$/;
export const entryTime = (line) => {
  const m = ENTRY.exec(line || '');
  return m ? m[1].padStart(5, '0') : null;
};
export const addEntry = (text, date, entry, template = []) => {
  const mark = MARK_IDS.includes(entry.mark) ? entry.mark : '-';
  const time = entry.time || timeOf(date);
  const lines = String(entry.text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const first = lines.shift().trim();
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { day } = ensureDayIn(tree, date, template);
  const item = { line: `*** ${time} ${mark}${first ? ' ' + first : ''}`, body: lines };
  // cuerpo: sin espacios finales; líneas en blanco del final fuera
  while (item.body.length && !item.body[item.body.length - 1].trim()) item.body.pop();
  const i = day.entries.findIndex((x) => (entryTime(x.line) || '') > time);
  if (i < 0) day.entries.push(item);
  else day.entries.splice(i, 0, item);
  return serializeTree(tree);
};

// Respuesta de la plantilla: cambia (o añade) `- Pregunta :: respuesta` en el cuerpo del día
export const setAnswer = (text, date, question, answer) => {
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { day } = ensureDayIn(tree, date, []);
  const clean = String(answer || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  const i = day.body.findIndex((l) => l.startsWith(`- ${question} ::`));
  if (i >= 0) day.body[i] = answerLine(question, clean);
  else {
    let at = day.body.length;
    while (at > 0 && !day.body[at - 1].trim()) at--;
    day.body.splice(at, 0, answerLine(question, clean));
  }
  return serializeTree(tree);
};

// :ID: del día (para enlazar desde una tarea). Devuelve { text, id }.
export const ensureDayId = (text, date) => {
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { day } = ensureDayIn(tree, date, []);
  const idLine = day.body.find((l) => /^\s*:ID:\s*\S/i.test(l));
  if (idLine) return { text: serializeTree(tree), id: idLine.replace(/^\s*:ID:\s*/i, '').trim() };
  const id = dayOrgId(day.key);
  const start = day.body.findIndex((l) => /^\s*:PROPERTIES:\s*$/i.test(l));
  if (start === 0) day.body.splice(1, 0, `:ID: ${id}`);
  else day.body.unshift(':PROPERTIES:', `:ID: ${id}`, ':END:');
  return { text: serializeTree(tree), id };
};

// ---- Lectura ----
const ANSWER = /^- (.+?) ::\s?(.*)$/;
export const parseDays = (text) => {
  const tree = parseTree(text);
  const days = [];
  tree.months.forEach((m) =>
    m.days.forEach((d) => {
      if (!d.key) return;
      const answers = [];
      const notes = [];
      let inDrawer = false;
      d.body.forEach((l) => {
        if (/^\s*:PROPERTIES:\s*$/i.test(l)) inDrawer = true;
        else if (inDrawer) inDrawer = !/^\s*:END:\s*$/i.test(l);
        else {
          const a = ANSWER.exec(l);
          if (a) answers.push({ question: a[1], answer: a[2].trim() });
          else if (l.trim()) notes.push(l);
        }
      });
      const entries = d.entries.map((e) => {
        const x = ENTRY.exec(e.line);
        const body = e.body.join('\n').replace(/\s+$/, '');
        if (!x) return { time: '', mark: '-', text: e.line.replace(/^\*+\s*/, ''), body };
        return { time: x[1].padStart(5, '0'), mark: x[2] || '-', text: x[3], body };
      });
      days.push({ key: d.key, answers, notes, entries });
    })
  );
  return days;
};

// Días con algo apuntado (apuntes, respuestas o notas)
export const daysWithEntries = (text) =>
  new Set(
    parseDays(text)
      .filter((d) => d.entries.length || d.notes.length || d.answers.some((a) => a.answer.trim()))
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
