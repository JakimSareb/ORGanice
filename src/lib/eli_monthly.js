// ORG Mode para Eli (4.27): registro mensual. Fichero `pages/mensual-AAAA.org` junto a
// `diari-AAAA.org` (aparte: el diari no lleva la tabla). Al principio, «Totales del año» y luego un
// apartado por mes (`* 2026-10 octubre [[id:diari-2026-10][Ver en el diari]]`) con su tabla.
// Las tablas van entre `# BEGIN mensual <id>` y `# END mensual <id>` y se REHACEN solas desde el
// diari: lo de fuera de las marcas se respeta; lo editado dentro se pierde. Solo funciones puras.
import {
  parseDays,
  dayOrgId,
  monthOrgId,
  dayHasData,
  MONTHS,
  parseMonthProps,
  dailyCounters,
  monthlyCounters,
} from './eli_diary';

export const monthlyPath = (year, dir) => `${dir}mensual-${year}.org`;

const WD_SHORT = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
const pad = (n) => String(n).padStart(2, '0');

// «4,5» y «4.5» valen; lo demás no suma
export const parseNum = (s) => {
  const t = String(s == null ? '' : s)
    .trim()
    .replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
};
export const fmtNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
export const isYes = (v) => /^(x|sí|si|s|y|yes|1|✓)$/i.test(String(v || '').trim());

// Columna de texto: la respuesta a «Lo más importante de hoy» (usuario 24-oct: la pregunta de la
// plantilla que diga «importante» o «relevante»). Sin esa pregunta en el día: los apuntes «!».
const IMPORTANT = /importante|relevante/i;
export const highlightOf = (day) => {
  if (!day) return [];
  const a = day.answers.find((x) => IMPORTANT.test(x.question));
  if (a) return a.answer.trim() ? [a.answer.trim()] : [];
  return day.entries.filter((e) => e.mark === '!').map((e) => e.text.trim());
};

const cell = (s) =>
  String(s == null ? '' : s)
    .replace(/\|/g, '¦')
    .replace(/\s+/g, ' ')
    .trim();

const aggregates = (counters) => counters.some((c) => c.type !== 'note');
const newAcc = (counters) => counters.map(() => ({ n: 0, sum: 0, any: false }));
const addTo = (acc, counters, values) =>
  counters.forEach((c, i) => {
    if (c.type === 'bool' && isYes(values[i])) {
      acc[i].n++;
      acc[i].any = true;
    } else if (c.type === 'num') {
      const v = parseNum(values[i]);
      if (v != null) {
        acc[i].sum += v;
        acc[i].any = true;
      }
    }
  });
const accValues = (acc, counters) =>
  counters.map((c, i) => {
    if (!acc[i].any) return '';
    return c.type === 'bool' ? String(acc[i].n) : c.type === 'num' ? fmtNum(acc[i].sum) : '';
  });

// Filas de un mes: todos los días, subtotal por semana (lunes a domingo) y total
export const monthRows = (daysByKey, year, month, counters) => {
  const last = new Date(year, month + 1, 0).getDate();
  const rows = [];
  let week = newAcc(counters);
  const total = newAcc(counters);
  let withData = 0;
  for (let d = 1; d <= last; d++) {
    const date = new Date(year, month, d);
    const key = `${year}-${pad(month + 1)}-${pad(d)}`;
    const day = daysByKey.get(key) || null;
    const has = dayHasData(day);
    if (has) withData++;
    const values = counters.map((c) => (day && day.props[c.key]) || '');
    rows.push({
      type: 'day',
      key,
      label: `${pad(d)} ${WD_SHORT[date.getDay()]}`,
      link: has ? dayOrgId(key) : null,
      lines: highlightOf(day),
      values,
    });
    addTo(week, counters, values);
    addTo(total, counters, values);
    if (date.getDay() === 0 || d === last) {
      rows.push({ type: 'week', values: accValues(week, counters) });
      week = newAcc(counters);
    }
  }
  rows.push({ type: 'total', values: accValues(total, counters), days: withData });
  return rows;
};

const monthHasData = (days, mk) => days.some((d) => d.key.startsWith(mk) && dayHasData(d));

// Datos del año (para el fichero y para el PDF). (4.33) `counters` = los diarios (columnas de la
// tabla del mes); `monthCounters` = los mensuales, con su valor en cada mes (`monthValues`).
export const monthlyData = (diaryText, year, allCounters) => {
  const counters = dailyCounters(allCounters);
  const monthCounters = monthlyCounters(allCounters);
  const days = parseDays(diaryText || '');
  const mprops = monthCounters.length ? parseMonthProps(diaryText || '') : {};
  const byKey = new Map(days.map((d) => [d.key, d]));
  const months = [];
  for (let m = 0; m < 12; m++) {
    const mk = `${year}-${pad(m + 1)}`;
    const monthValues = monthCounters.map((c) => ((mprops[mk] || {})[c.key] || '').trim());
    if (!monthHasData(days, mk) && !monthValues.some(Boolean)) continue;
    months.push({
      key: mk,
      month: m,
      label: MONTHS[m],
      rows: monthRows(byKey, year, m, counters),
      monthValues,
    });
  }
  return { year, counters, monthCounters, months };
};

// (4.33) Línea con los contadores mensuales del mes (encima de la tabla): «CINTURA: 82 · PESO: 70»
export const monthValuesLine = (monthCounters, values) => {
  const parts = (monthCounters || [])
    .map((c, i) => (values && values[i] ? `${c.name || c.key}: ${values[i]}` : ''))
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
};

const orgRow = (cells) => `| ${cells.map(cell).join(' | ')} |`;
const hline = (n) => `|${Array(n).fill('---').join('+')}|`;

export const monthTableLines = (rows, counters) => {
  const n = 2 + counters.length;
  const agg = aggregates(counters);
  const out = [
    '#+ATTR_LATEX: :environment longtable',
    orgRow(['Día', 'Lo más importante', ...counters.map((c) => c.key)]),
    hline(n),
  ];
  const blank = counters.map(() => '');
  rows.forEach((r, i) => {
    if (r.type === 'day') {
      const day = r.link ? `[[id:${r.link}][${r.label}]]` : r.label;
      const lines = r.lines.length ? r.lines : [''];
      out.push(orgRow([day, lines[0], ...r.values]));
      lines.slice(1).forEach((l) => out.push(orgRow(['', l, ...blank])));
    } else if (r.type === 'week') {
      const lastWeek = rows[i + 1] && rows[i + 1].type === 'total';
      if (agg) out.push(hline(n), orgRow(['Semana', '', ...r.values]));
      if (!lastWeek) out.push(hline(n));
    } else if (r.type === 'total') {
      out.push(hline(n), orgRow(['Total', `${r.days} días con algo`, ...r.values]));
    }
  });
  return out;
};

export const totalsTableLines = (data) => {
  const { counters, months } = data;
  const monthCounters = data.monthCounters || [];
  const n = 2 + counters.length + monthCounters.length;
  const out = [
    orgRow(['Mes', 'Días', ...counters.map((c) => c.key), ...monthCounters.map((c) => c.key)]),
    hline(n),
  ];
  const acc = newAcc(counters);
  let days = 0;
  months.forEach((m) => {
    const t = m.rows[m.rows.length - 1];
    out.push(orgRow([m.label, String(t.days), ...t.values, ...(m.monthValues || [])]));
    days += t.days;
    counters.forEach((c, i) => {
      const v = c.type === 'bool' ? parseInt(t.values[i] || '0', 10) : parseNum(t.values[i]);
      if (c.type === 'bool' && v) {
        acc[i].n += v;
        acc[i].any = true;
      } else if (c.type === 'num' && v != null) {
        acc[i].sum += v;
        acc[i].any = true;
      }
    });
  });
  // (los mensuales no se suman: en «Total» van vacíos)
  out.push(
    hline(n),
    orgRow(['Total', String(days), ...accValues(acc, counters), ...monthCounters.map(() => '')])
  );
  return out;
};

export const BEGIN = (id) => `# BEGIN mensual ${id}`;
export const END = (id) => `# END mensual ${id}`;
export const MONTHLY_WARNING =
  '# Las tablas entre «# BEGIN mensual» y «# END mensual» se rehacen solas desde el diari: lo que cambies dentro se pierde; lo de fuera se respeta.';

export const newMonthlyText = (year) =>
  [
    `#+TITLE: Mensual ${year}`,
    '#+STARTUP: showall',
    MONTHLY_WARNING,
    '',
    '* Totales del año',
    BEGIN('totales'),
    END('totales'),
    '',
  ].join('\n');

// Cambia el contenido entre las marcas. false si no están.
const replaceBlock = (lines, id, content) => {
  const b = lines.indexOf(BEGIN(id));
  const e = b < 0 ? -1 : lines.indexOf(END(id), b + 1);
  if (b < 0 || e < 0) return false;
  lines.splice(b + 1, e - b - 1, ...content);
  return true;
};
const MONTH_HEAD = /^\*\s+(\d{4}-\d{2})\b/;

// Rehace las tablas. `old` = texto actual del fichero ('' si no existe). Devuelve el texto nuevo,
// o null si no hay nada que escribir (sin fichero y sin datos).
export const regenerateMonthly = (old, year, diaryText, counters) => {
  const data = monthlyData(diaryText, year, counters);
  if (!old && !data.months.length) return null;
  const lines = String(old || newMonthlyText(year))
    .replace(/\r\n/g, '\n')
    .split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  // (si el usuario quitó «Totales del año», no se vuelve a poner)
  replaceBlock(lines, 'totales', totalsTableLines(data));
  for (let m = 0; m < 12; m++) {
    const mk = `${year}-${pad(m + 1)}`;
    const md = data.months.find((x) => x.key === mk);
    const rows = md ? md.rows : monthRows(new Map(), year, m, data.counters);
    const mline = md ? monthValuesLine(data.monthCounters, md.monthValues) : '';
    const content = [...(mline ? [mline, ''] : []), ...monthTableLines(rows, data.counters)];
    if (replaceBlock(lines, mk, content) || !md) continue;
    const hi = lines.findIndex((l) => (MONTH_HEAD.exec(l) || [])[1] === mk);
    if (hi >= 0) {
      // apartado del mes sin marcas: la tabla al principio (tras su cajón, si lo tiene)
      let at = hi + 1;
      if (/^\s*:PROPERTIES:\s*$/i.test(lines[at] || '')) {
        while (at < lines.length && !/^\s*:END:\s*$/i.test(lines[at])) at++;
        at++;
      }
      lines.splice(at, 0, BEGIN(mk), ...content, END(mk));
      continue;
    }
    const section = [
      `* ${mk} ${MONTHS[m]} [[id:${monthOrgId(mk)}][Ver en el diari]]`,
      BEGIN(mk),
      ...content,
      END(mk),
      '',
    ];
    const next = lines.findIndex((l) => {
      const k = (MONTH_HEAD.exec(l) || [])[1];
      return k && k > mk;
    });
    if (next >= 0) lines.splice(next, 0, ...section);
    else {
      if (lines.length && lines[lines.length - 1].trim()) lines.push('');
      lines.push(...section);
    }
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n') + '\n';
};
