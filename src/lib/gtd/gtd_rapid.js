// ORG Mode para Eli (3.0): Entrada rápida, como la de Nirvana. Una línea con el título y, detrás,
// etiquetas y opciones con «#»:
//   Comprar la compra #Personal #recado #star #due 1 agosto
//   #etiqueta           etiqueta (sin espacios)
//   #due <fecha>        fecha límite: today/hoy, tomorrow/mañana, un día de la semana (lunes,
//                       monday…), «1 agosto», «August 1», «1/8», «2026-08-01» (con año o sin él)
//   #focus o #star      con ★ (Focus)            (también #enfoque, #estrella)
//   #next o #someday    a Next o a Someday       (también #siguiente, #algundia)
//   #project            crea un proyecto         (también #proyecto)

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const MONTHS = {
  ene: 0,
  enero: 0,
  jan: 0,
  january: 0,
  feb: 1,
  febrero: 1,
  february: 1,
  mar: 2,
  marzo: 2,
  march: 2,
  abr: 3,
  abril: 3,
  apr: 3,
  april: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  june: 5,
  jul: 6,
  julio: 6,
  july: 6,
  ago: 7,
  agosto: 7,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  setiembre: 8,
  september: 8,
  oct: 9,
  octubre: 9,
  october: 9,
  nov: 10,
  noviembre: 10,
  november: 10,
  dic: 11,
  diciembre: 11,
  dec: 11,
  december: 11,
};
const WEEKDAYS = {
  domingo: 0,
  sunday: 0,
  sun: 0,
  dom: 0,
  lunes: 1,
  monday: 1,
  mon: 1,
  lun: 1,
  martes: 2,
  tuesday: 2,
  tue: 2,
  mar: 2,
  miercoles: 3,
  wednesday: 3,
  wed: 3,
  mie: 3,
  jueves: 4,
  thursday: 4,
  thu: 4,
  jue: 4,
  viernes: 5,
  friday: 5,
  fri: 5,
  vie: 5,
  sabado: 6,
  saturday: 6,
  sat: 6,
  sab: 6,
};

const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Día sin año: este año o, si ya ha pasado, el que viene
const upcoming = (month, day, year, today) => {
  if (year !== undefined) {
    const y = year < 100 ? 2000 + year : year;
    const d = new Date(y, month, day);
    return d.getMonth() === month ? d : null;
  }
  let d = new Date(today.getFullYear(), month, day);
  if (d.getMonth() !== month) return null;
  if (d < startOfDay(today)) d = new Date(today.getFullYear() + 1, month, day);
  return d;
};

export const parseRapidDate = (text, today = new Date()) => {
  const t0 = startOfDay(today);
  const s = plain(text).replace(/\bde\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (['today', 'hoy'].includes(s)) return t0;
  if (['tomorrow', 'manana'].includes(s)) return new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + 1);
  if (Object.prototype.hasOwnProperty.call(WEEKDAYS, s) && MONTHS[s] === undefined) {
    const diff = (WEEKDAYS[s] - t0.getDay() + 7) % 7 || 7;
    return new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + diff);
  }
  // «el lunes», «next monday»
  let m = /^(?:el|next|proximo|este)\s+(\S+)$/.exec(s);
  if (m && Object.prototype.hasOwnProperty.call(WEEKDAYS, m[1])) {
    const diff = (WEEKDAYS[m[1]] - t0.getDay() + 7) % 7 || 7;
    return new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + diff);
  }
  // 2026-08-01
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return upcoming(+m[2] - 1, +m[3], +m[1], today);
  // 1/8, 1/8/2026, 1-8-26 (día/mes, como en España)
  m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (m) return upcoming(+m[2] - 1, +m[1], m[3] !== undefined ? +m[3] : undefined, today);
  // 1 agosto [2026]
  m = /^(\d{1,2}) ([a-z]+)(?: (\d{2,4}))?$/.exec(s);
  if (m && MONTHS[m[2]] !== undefined) {
    return upcoming(MONTHS[m[2]], +m[1], m[3] !== undefined ? +m[3] : undefined, today);
  }
  // August 1 [2026]
  m = /^([a-z]+) (\d{1,2})(?: (\d{2,4}))?$/.exec(s);
  if (m && MONTHS[m[1]] !== undefined) {
    return upcoming(MONTHS[m[1]], +m[2], m[3] !== undefined ? +m[3] : undefined, today);
  }
  return null;
};

const FLAGS = {
  focus: 'focus',
  star: 'focus',
  enfoque: 'focus',
  estrella: 'focus',
  next: 'next',
  siguiente: 'next',
  siguientes: 'next',
  someday: 'someday',
  algundia: 'someday',
  project: 'project',
  proyecto: 'project',
};

/**
 * @returns { title, tags, deadline, focus, list ('next' | 'someday' | null), project, badDate }
 */
export const parseRapidEntry = (input, today = new Date()) => {
  const text = String(input || '');
  const first = text.search(/(^|\s)#\S/);
  const title = (first < 0 ? text : text.slice(0, first)).trim();
  const out = {
    title,
    tags: [],
    deadline: null,
    focus: false,
    list: null,
    project: false,
    badDate: null,
  };
  if (first < 0) return out;
  // Trozos que empiezan por «#» (lo que va detrás de #due es la fecha)
  const parts = text
    .slice(first)
    .split(/(?:^|\s)#(?=\S)/)
    .map((p) => p.trim())
    .filter(Boolean);
  parts.forEach((part) => {
    const [word, ...rest] = part.split(/\s+/);
    const key = plain(word);
    if (key === 'due' || key === 'vence') {
      const d = parseRapidDate(rest.join(' '), today);
      if (d) out.deadline = d;
      else out.badDate = rest.join(' ');
      return;
    }
    const flag = FLAGS[key];
    if (flag === 'focus') out.focus = true;
    else if (flag === 'project') out.project = true;
    else if (flag) out.list = flag;
    else {
      const tag = word.replace(/[:]+/g, '');
      if (tag && !out.tags.includes(tag)) out.tags.push(tag);
    }
    // texto suelto detrás de una etiqueta: se añade al título (Nirvana solo admite el orden
    // título → etiquetas, pero así no se pierde nada)
    if (rest.length && key !== 'due') out.title = `${out.title} ${rest.join(' ')}`.trim();
  });
  return out;
};
