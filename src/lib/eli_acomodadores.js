// ORG Mode para Eli (3.01): turnos de acomodadores (pages/acomodadores.org). Sustituye al proceso
// con bloques de Babel: asignados de la semana → disponibles por grupo (con cuántas veces y cuándo
// fue la última) → tabla del mes → sumar a los contadores → histórico. Todo se guarda en el propio
// .org (legible y editable en Emacs, que usa lo mismo: emacs/lisp/organice-acomodadores.el).
//
// Formato del fichero (lo que se lee y se escribe):
//   #+ACOM_SEMANAS: 5                 nº de semanas por mes (por defecto 5)
//   #+ACOM_DIAS: jue sab              días de reunión de cada semana (por defecto jueves y sábado)
//   #+ACOM_ALIAS: Toni=Antonio Vilchez; Miguel Angel Lliteras=Miguel Lliteras
//   #+ACOM_DESDE: 2026-09             primer mes que se suma a los contadores (los anteriores ya
//                                     están en ellos)
//   #+NAME: Publicadores              contadores (base): | Nombre | Veces | Última |
//   #+NAME: Ancianos                  (la última vez: «Ago» —mes sin año— o una fecha 2026-09-10)
//   #+NAME: Ministeriales
//   * HISTORICO
//   ** 2026, Septiembre               un mes: | Semana | Dia | Acomodador 1 | Acomodador 2 |
//   :PROPERTIES:                      :SUMADO: = ya sumado a los contadores (no se suma dos veces)
//   :SUMADO: 2026-10-13
//   :END:
//   | 7-Sep | Jue-10-Sep | Toni | Juan |
// «Veces» = nº de TURNOS: cada semana asignada cuenta 1 (varios días de la misma semana, 1).

export const ACOM_PATH = '/pages/acomodadores.org';

export const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const MON3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MON3_EN = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
export const DAYS = [
  { id: 'lun', label: 'Lun', offset: 0 },
  { id: 'mar', label: 'Mar', offset: 1 },
  { id: 'mie', label: 'Mie', offset: 2 },
  { id: 'jue', label: 'Jue', offset: 3 },
  { id: 'vie', label: 'Vie', offset: 4 },
  { id: 'sab', label: 'Sab', offset: 5 },
  { id: 'dom', label: 'Dom', offset: 6 },
];
export const GROUPS = [
  { id: 'publicadores', label: 'Publicadores', re: /^public/ },
  { id: 'ancianos', label: 'Ancianos', re: /^ancian/ },
  { id: 'ministeriales', label: 'Ministeriales', re: /^minist/ },
];

export const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const monthIndex = (word) => {
  const w = fold(word).replace(/\./g, '');
  if (!w) return -1;
  let i = MONTHS_ES.findIndex((m) => fold(m) === w);
  if (i >= 0) return i;
  i = MON3.findIndex((m) => fold(m) === w.slice(0, 3));
  if (i >= 0 && w.length >= 3) return i;
  i = MON3_EN.indexOf(w.slice(0, 3));
  if (i >= 0 && w.length >= 3) return i;
  if (w === 'setiembre') return 8;
  return -1;
};

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameOrBefore = (a, b) => a.getTime() <= b.getTime();

// «Última vez» de la base: «2026-09-10», «10-Sep-2026», o solo el mes («Ago») → el más reciente
// que no sea posterior a hoy (día 1). null si no se entiende.
export const parseLast = (raw, today = new Date()) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(?:[A-Za-zÁ-úñ]+[-\s])?(\d{1,2})[-\s/]([A-Za-zÁ-úñ]+)[-\s/](\d{2,4})$/.exec(s);
  if (m && monthIndex(m[2]) >= 0) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(y, monthIndex(m[2]), +m[1]);
  }
  m = /^([A-Za-zÁ-úñ.]+)(?:[\s-]+(\d{4}))?$/.exec(s);
  if (m && monthIndex(m[1]) >= 0) {
    const mi = monthIndex(m[1]);
    if (m[2]) return new Date(+m[2], mi, 1);
    let y = today.getFullYear();
    if (mi > today.getMonth()) y -= 1;
    return new Date(y, mi, 1);
  }
  return null;
};

// --- tablas Org ---
const isTableLine = (l) => /^\s*\|/.test(l);
const isRuleLine = (l) => /^\s*\|[-+:\s]*\|?\s*$/.test(l) && /-/.test(l);
export const cellsOf = (line) => {
  const t = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '');
  return t.split('|').map((c) => c.trim());
};
export const formatTable = (rows, { headerRows = 1 } = {}) => {
  // rows: [[celdas]…]; null = línea separadora
  const cols = Math.max(...rows.filter(Boolean).map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(1, ...rows.filter(Boolean).map((r) => String(r[i] || '').length))
  );
  const out = rows.map((r) =>
    r === null
      ? '|' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '|'
      : '| ' +
        widths
          .map((w, i) => {
            const c = String(r[i] || '');
            // números a la derecha, como los alinea Org
            return /^\d+$/.test(c) ? c.padStart(w) : c.padEnd(w);
          })
          .join(' | ') +
        ' |'
  );
  return out;
};
const tableAt = (lines, start) => {
  let end = start;
  while (end < lines.length && isTableLine(lines[end])) end++;
  return { start, end }; // [start, end)
};

const isHeaderRow = (cells, words) => cells.some((c) => words.some((w) => fold(c).startsWith(w)));

// --- lectura ---
export const parseAcom = (text, today = new Date()) => {
  const lines = String(text || '').split('\n');
  const out = {
    lines,
    config: { semanas: 5, dias: ['jue', 'sab'], desde: null },
    aliases: {},
    groups: [],
    months: [],
    historicoLine: -1,
  };
  const cfg = (name) => new RegExp(`^\\s*#\\+${name}:\\s*(.*)$`, 'i');
  lines.forEach((l, i) => {
    let m = cfg('ACOM_SEMANAS').exec(l);
    if (m && +m[1] > 0) out.config.semanas = Math.min(6, +m[1]);
    m = cfg('ACOM_DIAS').exec(l);
    if (m) {
      const ds = m[1]
        .split(/[\s,]+/)
        .map((x) => fold(x).slice(0, 3))
        .map((x) => (x === 'mié' ? 'mie' : x === 'sáb' ? 'sab' : x))
        .filter((x) => DAYS.some((d) => d.id === x));
      if (ds.length) out.config.dias = ds;
    }
    m = cfg('ACOM_DESDE').exec(l);
    if (m) {
      const d = /(\d{4})-(\d{1,2})/.exec(m[1]);
      if (d) out.config.desde = { year: +d[1], month: +d[2] - 1 };
    }
    m = cfg('ACOM_ALIAS').exec(l);
    if (m) {
      m[1].split(/[;\n]/).forEach((pair) => {
        const [a, ...rest] = pair.split('=');
        const name = rest.join('=').trim();
        if (a && a.trim() && name) out.aliases[fold(a)] = name;
      });
    }
    // contadores
    m = /^\s*#\+NAME:\s*(.+?)\s*$/i.exec(l);
    if (m) {
      const g = GROUPS.find((x) => x.re.test(fold(m[1])));
      if (g && isTableLine(lines[i + 1] || '')) {
        const { start, end } = tableAt(lines, i + 1);
        const rows = [];
        for (let k = start; k < end; k++) {
          if (isRuleLine(lines[k])) continue;
          const c = cellsOf(lines[k]);
          if (!c[0] || isHeaderRow([c[0]], ['nombre', 'hermano', 'name'])) continue;
          rows.push({
            line: k,
            name: c[0],
            veces: parseInt(c[1], 10) || 0,
            lastRaw: c[2] || '',
            last: parseLast(c[2], today),
          });
        }
        out.groups.push({ id: g.id, label: g.label, nameLine: i, start, end, rows });
      }
    }
    if (/^\*\s+HIST[OÓ]RICO\b/i.test(l)) out.historicoLine = i;
    // meses del histórico
    m = /^(\*+)\s+(\d{4}),\s*([A-Za-zÁ-úñ]+)\s*$/.exec(l);
    if (m && monthIndex(m[3]) >= 0) {
      const level = m[1].length;
      let end = i + 1;
      while (end < lines.length && !/^\*+\s/.test(lines[end])) end++;
      // subencabezados de este mes (de más nivel) también son suyos
      while (end < lines.length) {
        const h = /^(\*+)\s/.exec(lines[end]);
        if (h && h[1].length <= level) break;
        end++;
      }
      let sumado = null;
      let table = null;
      for (let k = i + 1; k < end; k++) {
        const p = /^\s*:SUMADO:\s*(.*)$/i.exec(lines[k]);
        if (p) sumado = p[1].trim() || 't';
        if (!table && isTableLine(lines[k])) table = tableAt(lines, k);
      }
      out.months.push({
        year: +m[2],
        month: monthIndex(m[3]),
        level,
        line: i,
        end,
        sumado,
        table,
        rows: table ? monthRows(lines.slice(table.start, table.end), +m[2], monthIndex(m[3])) : [],
      });
    }
  });
  return out;
};

// Filas de la tabla de un mes: { semana, dia, date, names: [a1, a2] } (la semana vacía = la de
// la fila de arriba). Se toleran filas raras (ASAMBLEA, «XX-May», vacías).
export const monthRows = (tableLines, year, month) => {
  const out = [];
  let semana = '';
  tableLines.forEach((l) => {
    if (isRuleLine(l)) return;
    const c = cellsOf(l);
    if (isHeaderRow(c.slice(0, 2), ['semana', 'dia', 'día'])) return;
    if (c[0]) semana = c[0];
    const dia = c[1] || '';
    out.push({ semana, dia, date: dateOfDia(dia, year, month), names: [c[2] || '', c[3] || ''] });
  });
  return out;
};

// «Jue-10-Sep» (o «10-Sep», «7-Sep») → fecha (año del mes; diciembre/enero se ajustan)
export const dateOfDia = (dia, year, month) => {
  const m = /(\d{1,2})[-\s/]([A-Za-zÁ-úñ]+)/.exec(String(dia || ''));
  if (!m) return null;
  const mi = monthIndex(m[2]);
  if (mi < 0) return null;
  let y = year;
  if (month === 0 && mi === 11) y -= 1;
  if (month === 11 && mi === 0) y += 1;
  const d = new Date(y, mi, +m[1]);
  return d.getMonth() === mi ? d : null;
};

const NOT_A_NAME = /^(asamblea|congreso|visita|reunion|reunión|-+|x+|\?+|n\/a)$/i;
const isNameCell = (s) => !!String(s || '').trim() && !NOT_A_NAME.test(String(s).trim());

// Nombre de la lista (por alias o sin acentos/mayúsculas); null si no está
export const resolveName = (acom, name) => {
  const f = fold(name);
  if (!f) return null;
  const target = acom.aliases[f] ? fold(acom.aliases[f]) : f;
  for (const g of acom.groups) {
    const r = g.rows.find((x) => fold(x.name) === target);
    if (r) return r.name;
  }
  return null;
};
export const allPeople = (acom) =>
  acom.groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.id, groupLabel: g.label })));

// Turnos de un mes: { nombre: { turns, last } } + nombres que no están en la lista
export const monthTurns = (acom, rows) => {
  const byWeek = {};
  const unknown = new Set();
  const lastOf = {};
  rows.forEach((r) => {
    r.names.forEach((n) => {
      if (!isNameCell(n)) return;
      const who = resolveName(acom, n);
      if (!who) {
        unknown.add(n.trim());
        return;
      }
      const wk = r.semana || r.dia;
      (byWeek[who] = byWeek[who] || new Set()).add(wk);
      if (r.date && (!lastOf[who] || r.date > lastOf[who])) lastOf[who] = r.date;
    });
  });
  const out = {};
  Object.keys(byWeek).forEach((who) => {
    out[who] = { turns: byWeek[who].size, last: lastOf[who] || null };
  });
  return { turns: out, unknown: Array.from(unknown) };
};

const ymKey = (y, m) => y * 12 + m;
// Meses aún sin sumar (desde #+ACOM_DESDE, por defecto septiembre de 2026)
export const pendingMonths = (acom) => {
  const desde = acom.config.desde || { year: 2026, month: 8 };
  return acom.months.filter(
    (m) => !m.sumado && ymKey(m.year, m.month) >= ymKey(desde.year, desde.month)
  );
};

// Una semana (desde su lunes) con sus días de reunión
export const weekFrom = (monday, config) => {
  const days = (config.dias || ['jue', 'sab'])
    .map((id) => DAYS.find((x) => x.id === id))
    .filter(Boolean)
    .sort((a, b) => a.offset - b.offset)
    .map((day) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + day.offset);
      return { day: day.id, date, dia: `${day.label}-${date.getDate()}-${MON3[date.getMonth()]}` };
    });
  return {
    semana: `${monday.getDate()}-${MON3[monday.getMonth()]}`,
    monday: new Date(monday),
    days,
  };
};

// Semanas de un mes: los lunes que caen en él (hasta `semanas`), con sus días de reunión
export const weeksOf = (year, month, config) => {
  const out = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month && out.length < (config.semanas || 5)) {
    out.push(weekFrom(d, config));
    d.setDate(d.getDate() + 7);
  }
  return out;
};

// (3.03) Lunes de una fila de la tabla (por su Semana «7-Sep», o por el día «Jue-10-Sep»)
const mondayOfRow = (r, year, month) => {
  const d = dateOfDia(r.semana, year, month) || r.date || dateOfDia(r.dia, year, month);
  if (!d) return null;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (m.getDay() !== 1) m.setDate(m.getDate() - 1);
  return m;
};

// (3.03) Añadir a la tabla del mes la semana de antes de la primera (p. ej. la última del mes
// anterior) o la de después de la última (la primera del mes siguiente). Devuelve las filas nuevas
// (o las mismas si no se puede calcular).
export const addWeek = (rows, where, { year, month }, config) => {
  const dated = rows.filter((r) => mondayOfRow(r, year, month));
  let monday;
  if (!dated.length) {
    const first = weeksOf(year, month, config)[0];
    monday = first ? new Date(first.monday) : new Date(year, month, 1);
    monday.setDate(monday.getDate() + (where === 'before' ? -7 : 0));
  } else {
    const ref = mondayOfRow(where === 'before' ? dated[0] : dated[dated.length - 1], year, month);
    monday = new Date(ref);
    monday.setDate(ref.getDate() + (where === 'before' ? -7 : 7));
  }
  const w = weekFrom(monday, config);
  const fresh = w.days.map((d) => ({
    semana: w.semana,
    dia: d.dia,
    date: d.date,
    names: ['', ''],
  }));
  return where === 'before' ? [...fresh, ...rows] : [...rows, ...fresh];
};

// (3.03) Quitar la primera o la última semana de la tabla
export const removeWeek = (rows, where) => {
  if (!rows.length) return rows;
  const keyOf = [];
  let cur = '';
  rows.forEach((r) => {
    cur = r.semana || cur;
    keyOf.push(cur);
  });
  const target = where === 'first' ? keyOf[0] : keyOf[keyOf.length - 1];
  return rows.filter((r, i) => keyOf[i] !== target);
};

// Filas vacías de un mes nuevo
export const emptyMonth = (year, month, config) =>
  weeksOf(year, month, config).flatMap((w) =>
    w.days.map((d, i) => ({
      semana: i === 0 ? w.semana : w.semana,
      dia: d.dia,
      date: d.date,
      names: ['', ''],
    }))
  );

// Mes que se propone: el siguiente al último del histórico (o el que viene)
export const suggestedMonth = (acom, today = new Date()) => {
  if (!acom.months.length) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  const last = acom.months.reduce((a, b) =>
    ymKey(b.year, b.month) > ymKey(a.year, a.month) ? b : a
  );
  const d = new Date(last.year, last.month + 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

// Contadores con lo de los meses dados sumado (sin escribir nada): para ordenar los disponibles
export const countersWith = (acom, extraRowsList = []) => {
  const map = {};
  allPeople(acom).forEach((p) => {
    map[p.name] = {
      name: p.name,
      group: p.group,
      groupLabel: p.groupLabel,
      veces: p.veces,
      last: p.last,
    };
  });
  extraRowsList.forEach((rows) => {
    const { turns } = monthTurns(acom, rows);
    Object.keys(turns).forEach((who) => {
      if (!map[who]) return;
      map[who].veces += turns[who].turns;
      if (turns[who].last && (!map[who].last || turns[who].last > map[who].last))
        map[who].last = turns[who].last;
    });
  });
  return map;
};

// Disponibles para una semana: por grupo, sin los asignados (texto, un nombre por línea) ni los
// ya puestos esa semana; ordenados por menos turnos y, a igualdad, fecha más antigua
export const availableFor = (counters, { exclude = [] } = {}) => {
  const ex = new Set(exclude.map(fold));
  const byGroup = {};
  Object.values(counters).forEach((p) => {
    if (ex.has(fold(p.name))) return;
    (byGroup[p.group] = byGroup[p.group] || []).push(p);
  });
  Object.values(byGroup).forEach((list) =>
    list.sort(
      (a, b) =>
        a.veces - b.veces ||
        (a.last ? a.last.getTime() : 0) - (b.last ? b.last.getTime() : 0) ||
        a.name.localeCompare(b.name)
    )
  );
  return GROUPS.map((g) => ({ ...g, people: byGroup[g.id] || [] })).filter((g) => g.people.length);
};

// Asignados escritos (uno por línea): resueltos a nombres de la lista y los que no están
export const parseAssigned = (acom, text) => {
  const names = [];
  const unknown = [];
  String(text || '')
    .split('\n')
    .map((x) => x.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean)
    .forEach((n) => {
      const who = resolveName(acom, n);
      if (who) names.push(who);
      else unknown.push(n);
    });
  return { names, unknown };
};

// --- escritura ---
const lastText = (d) => (d ? isoDate(d) : '');

// Guardar un mes (crea o sustituye su tabla en HISTORICO) y sumar a los contadores todos los meses
// pendientes (también éste). Si el mes ya estaba sumado y se cambia, se suma solo la diferencia.
// Devuelve { text, unknown, summed: [«2026, Septiembre»…] }.
export const saveMonth = (text, { year, month, rows }, today = new Date()) => {
  let acom = parseAcom(text, today);
  let lines = acom.lines.slice();
  const title = `${year}, ${MONTHS_ES[month]}`;
  const tableRows = [
    ['Semana', 'Dia', 'Acomodador 1', 'Acomodador 2'],
    null,
    ...rows.map((r) => [r.semana, r.dia, r.names[0] || '', r.names[1] || '']),
  ];
  const table = formatTable(tableRows);
  const existing = acom.months.find((m) => m.year === year && m.month === month);
  let before = null; // turnos que ya estaban sumados de este mes
  if (existing) {
    if (existing.sumado) before = monthTurns(acom, existing.rows).turns;
    if (existing.table) {
      lines.splice(existing.table.start, existing.table.end - existing.table.start, ...table);
    } else {
      lines.splice(existing.line + 1, 0, ...table);
    }
  } else {
    // dentro de HISTORICO (si no existe, al final), en orden de fecha
    const level = acom.months.length ? acom.months[0].level : 2;
    const block = [`${'*'.repeat(level)} ${title}`, ...table];
    const later = acom.months
      .filter((m) => ymKey(m.year, m.month) > ymKey(year, month))
      .sort((a, b) => a.line - b.line)[0];
    let at;
    if (later) at = later.line;
    else if (acom.historicoLine >= 0) {
      at = acom.historicoLine + 1;
      while (at < lines.length && !/^\*\s/.test(lines[at])) at++;
    } else {
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      lines.push('* HISTORICO');
      at = lines.length;
    }
    lines.splice(at, 0, ...block);
  }
  // sumar lo pendiente
  acom = parseAcom(lines.join('\n'), today);
  const mine = acom.months.find((m) => m.year === year && m.month === month);
  const toSum = pendingMonths(acom);
  const adds = {};
  const lastBy = {};
  const unknown = new Set();
  const addTurns = (turns, sign = 1) =>
    Object.keys(turns).forEach((who) => {
      adds[who] = (adds[who] || 0) + sign * turns[who].turns;
      if (sign > 0 && turns[who].last && (!lastBy[who] || turns[who].last > lastBy[who]))
        lastBy[who] = turns[who].last;
    });
  toSum.forEach((m) => {
    const r = monthTurns(acom, m.rows);
    r.unknown.forEach((u) => unknown.add(u));
    addTurns(r.turns);
  });
  if (mine && mine.sumado && before) {
    const r = monthTurns(acom, mine.rows);
    r.unknown.forEach((u) => unknown.add(u));
    addTurns(r.turns);
    addTurns(before, -1);
  }
  // contadores
  lines = acom.lines.slice();
  acom.groups.forEach((g) => {
    g.rows.forEach((r) => {
      const add = adds[r.name] || 0;
      const nl = lastBy[r.name];
      if (!add && !nl) return;
      const veces = Math.max(0, r.veces + add);
      const last = nl && (!r.last || nl > r.last) ? lastText(nl) : r.lastRaw;
      const c = cellsOf(lines[r.line]);
      c[1] = String(veces);
      c[2] = last;
      lines[r.line] = '| ' + c.join(' | ') + ' |';
    });
    // realinear la tabla
    const block = lines.slice(g.start, g.end).map((l) => (isRuleLine(l) ? null : cellsOf(l)));
    lines.splice(g.start, g.end - g.start, ...formatTable(block));
  });
  // marcar los meses sumados (de abajo arriba, para no mover líneas)
  const stamp = isoDate(today);
  const mark = [...toSum].sort((a, b) => b.line - a.line);
  mark.forEach((m) => {
    const drawerAt = lines.findIndex(
      (l, i) => i > m.line && i < m.end && /^\s*:PROPERTIES:\s*$/i.test(l)
    );
    if (drawerAt >= 0) lines.splice(drawerAt + 1, 0, `:SUMADO: ${stamp}`);
    else lines.splice(m.line + 1, 0, ':PROPERTIES:', `:SUMADO: ${stamp}`, ':END:');
  });
  return {
    text: lines.join('\n'),
    unknown: Array.from(unknown),
    summed: toSum.map((m) => `${m.year}, ${MONTHS_ES[m.month]}`),
  };
};

// Guardar los ajustes (#+ACOM_SEMANAS / #+ACOM_DIAS) en el fichero
export const saveConfig = (text, { semanas, dias }) => {
  const lines = String(text || '').split('\n');
  const set = (name, value) => {
    const re = new RegExp(`^\\s*#\\+${name}:`, 'i');
    const i = lines.findIndex((l) => re.test(l));
    const line = `#+${name}: ${value}`;
    if (i >= 0) lines[i] = line;
    else {
      // con los demás #+ del principio (antes del primer encabezado)
      let at = 0;
      while (at < lines.length && /^\s*#\+/.test(lines[at])) at++;
      lines.splice(at, 0, line);
    }
  };
  if (semanas) set('ACOM_SEMANAS', semanas);
  if (dias && dias.length) set('ACOM_DIAS', dias.join(' '));
  return lines.join('\n');
};

export const monthLabel = (y, m) => `${MONTHS_ES[m]} ${y}`;
export const shortDate = (d) =>
  d ? `${d.getDate()}-${MON3[d.getMonth()]}-${d.getFullYear()}` : '—';
export { sameOrBefore };

// Contadores para elegir mientras se rellena un mes: la base + los meses pendientes + lo que se
// lleva escrito de este mes (si este mes ya estaba sumado, sin contarlo dos veces)
export const countersForDraft = (acom, draft) => {
  const isCur = (m) => m.year === draft.year && m.month === draft.month;
  const map = countersWith(
    acom,
    pendingMonths(acom)
      .filter((m) => !isCur(m))
      .map((m) => m.rows)
      .concat([draft.rows])
  );
  const cur = acom.months.find(isCur);
  if (cur && cur.sumado) {
    const { turns } = monthTurns(acom, cur.rows);
    Object.keys(turns).forEach((w) => {
      if (map[w]) map[w].veces -= turns[w].turns;
    });
  }
  return map;
};
