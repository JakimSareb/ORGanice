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
    }))
    .filter((c) => {
      if (!c.key || RESERVED_KEYS.includes(c.key) || seen.has(c.key)) return false;
      seen.add(c.key);
      return true;
    })
    .map((c) => ({ ...c, name: c.name || c.key }));
};

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
    monthlyOn: r.monthlyOn !== false,
    counters: Array.isArray(r.counters) ? cleanCounters(r.counters) : DEFAULT_COUNTERS,
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
// (4.27) también el registro mensual (`mensual-AAAA.org`): fuera de GTD, agenda y avisos
export const isDiaryPath = (p) => /(^|\/)(diari|mensual)-\d{4}\.org$/i.test(String(p || ''));
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
// (4.27, usuario) Los apuntes nuevos van como NOTAS del día (líneas de lista en el cuerpo:
// `- 13:23 o texto`, el resto de líneas con dos espacios), no como cabeceras. Los `*** 13:23 …`
// de la 4.26 se siguen leyendo.
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
export const addEntry = (text, date, entry, template = []) => {
  const mark = MARK_IDS.includes(entry.mark) ? entry.mark : '-';
  const time = entry.time || timeOf(date);
  const lines = String(entry.text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const first = lines.shift().trim();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { day } = ensureDayIn(tree, date, template);
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
export const setAnswer = (text, date, question, answer) => {
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { day } = ensureDayIn(tree, date, []);
  const clean = String(answer || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
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
      const fromHeads = d.entries.map((e) => {
        const x = ENTRY.exec(e.line);
        const body = e.body.join('\n').replace(/\s+$/, '');
        if (!x) return { time: '', mark: '-', text: e.line.replace(/^\*+\s*/, ''), body };
        return { time: x[1].padStart(5, '0'), mark: x[2] || '-', text: x[3], body };
      });
      const entries = bodyEntries
        .map((e) => ({ ...e, body: e.body.join('\n') }))
        .concat(fromHeads)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      days.push({ key: d.key, answers, notes, entries, props });
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

// ---- (4.27) Contadores y :ID: ----
// ¿El día tiene algo? (apuntes, notas, respuestas o contadores; el :ID: no cuenta)
export const dayHasData = (d) =>
  !!d &&
  (d.entries.length > 0 ||
    d.notes.length > 0 ||
    d.answers.some((a) => a.answer.trim()) ||
    Object.keys(d.props || {}).some((k) => k !== 'ID' && String(d.props[k]).trim()));

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
export const setDayProp = (text, date, key, value, template = []) => {
  const k = counterKey(key);
  const tree = parseTree(text || newFileText(date.getFullYear()));
  const { day } = ensureDayIn(tree, date, template);
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

// Pone :ID: a los días con algo y a sus meses (para que los enlaces del registro mensual también
// valgan en Emacs). Si no cambia nada devuelve el mismo texto.
export const withDiaryIds = (text) => {
  if (!text) return text;
  const tree = parseTree(text);
  const data = new Map(parseDays(text).map((d) => [d.key, d]));
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
