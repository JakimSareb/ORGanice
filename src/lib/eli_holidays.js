// ORG Mode para Eli (2.13): festivos de España para el calendario.
//
// - 2026: los del BOE (Resolución de 17 de octubre de 2025, BOE-A-2025-21667), por comunidad.
// - Otros años: aproximados con las reglas habituales (cada año el BOE cambia algunos: cuando un
//   festivo cae en domingo, muchas comunidades lo pasan al lunes). Se marcan como «aprox.».
// - Festivos propios (locales, de empresa…): líneas «dd/mm Nombre» (todos los años) o
//   «dd/mm/aaaa Nombre» (solo ese año).

export const REGIONS = [
  ['', 'Solo nacionales'],
  ['AN', 'Andalucía'],
  ['AR', 'Aragón'],
  ['AS', 'Asturias'],
  ['IB', 'Illes Balears'],
  ['CN', 'Canarias'],
  ['CB', 'Cantabria'],
  ['CM', 'Castilla-La Mancha'],
  ['CL', 'Castilla y León'],
  ['CT', 'Cataluña'],
  ['VC', 'Comunitat Valenciana'],
  ['EX', 'Extremadura'],
  ['GA', 'Galicia'],
  ['MD', 'Madrid'],
  ['MC', 'Región de Murcia'],
  ['NC', 'Navarra'],
  ['PV', 'País Vasco'],
  ['RI', 'La Rioja'],
  ['CE', 'Ceuta'],
  ['ML', 'Melilla'],
];

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m: 1–12
export const keyOfDate = (date) => dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());

// Domingo de Pascua (algoritmo anónimo gregoriano)
export const easterSunday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// --- 2026 (BOE) -------------------------------------------------------------------------------
const NATIONAL_2026 = [
  ['01-01', 'Año Nuevo'],
  ['01-06', 'Epifanía del Señor'],
  ['04-03', 'Viernes Santo'],
  ['05-01', 'Fiesta del Trabajo'],
  ['08-15', 'Asunción de la Virgen'],
  ['10-12', 'Fiesta Nacional de España'],
  ['11-01', 'Todos los Santos (domingo)'],
  ['12-06', 'Día de la Constitución (domingo)'],
  ['12-08', 'Inmaculada Concepción'],
  ['12-25', 'Natividad del Señor'],
];
const JS = ['04-02', 'Jueves Santo'];
const LP = ['04-06', 'Lunes de Pascua'];
const N2 = ['11-02', 'Lunes siguiente a Todos los Santos'];
const D7 = ['12-07', 'Lunes siguiente al Día de la Constitución'];
const REGIONAL_2026 = {
  AN: [['02-28', 'Día de Andalucía'], JS, N2, D7],
  AR: [JS, ['04-23', 'San Jorge, Día de Aragón'], N2, D7],
  AS: [JS, ['09-08', 'Día de Asturias'], N2, D7],
  IB: [['03-02', 'Lunes siguiente al Día de les Illes Balears'], JS, LP, ['12-26', 'Sant Esteve']],
  CN: [JS, ['05-30', 'Día de Canarias'], N2],
  CB: [JS, ['07-28', 'Día de las Instituciones de Cantabria'], ['09-15', 'La Bien Aparecida'], D7],
  CM: [JS, LP, ['06-04', 'Corpus Christi'], N2],
  CL: [JS, ['04-23', 'Fiesta de Castilla y León'], N2, D7],
  CT: [
    LP,
    ['06-24', 'Sant Joan'],
    ['09-11', 'Diada Nacional de Catalunya'],
    ['12-26', 'Sant Esteve'],
  ],
  VC: [
    ['03-19', 'San José'],
    LP,
    ['06-24', 'San Juan'],
    ['10-09', 'Día de la Comunitat Valenciana'],
  ],
  EX: [JS, ['09-08', 'Día de Extremadura'], N2, D7],
  GA: [['03-19', 'San José'], JS, ['06-24', 'San Juan'], ['07-25', 'Día Nacional de Galicia']],
  MD: [JS, ['05-02', 'Fiesta de la Comunidad de Madrid'], N2, D7],
  MC: [['03-19', 'San José'], JS, ['06-09', 'Día de la Región de Murcia'], D7],
  NC: [['03-19', 'San José'], JS, LP, N2],
  PV: [['03-19', 'San José'], JS, LP, ['07-25', 'Santiago Apóstol']],
  RI: [JS, LP, ['06-09', 'Día de La Rioja'], D7],
  CE: [
    JS,
    ['05-27', 'Eid al-Adha'],
    ['08-05', 'Nuestra Señora de África'],
    ['09-02', 'Día de Ceuta'],
  ],
  ML: [['03-20', 'Eid al-Fitr'], JS, ['05-27', 'Eid al-Adha'], D7],
};
const EXACT = { 2026: { national: NATIONAL_2026, regional: REGIONAL_2026 } };

// --- Otros años (aproximados) ----------------------------------------------------------------
const nationalRules = (year) => {
  const easter = easterSunday(year);
  const md = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return [
    ['01-01', 'Año Nuevo'],
    ['01-06', 'Epifanía del Señor'],
    [md(addDays(easter, -2)), 'Viernes Santo'],
    ['05-01', 'Fiesta del Trabajo'],
    ['08-15', 'Asunción de la Virgen'],
    ['10-12', 'Fiesta Nacional de España'],
    ['11-01', 'Todos los Santos'],
    ['12-06', 'Día de la Constitución'],
    ['12-08', 'Inmaculada Concepción'],
    ['12-25', 'Natividad del Señor'],
  ];
};
const regionalRules = (year, region) => {
  const easter = easterSunday(year);
  const md = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const js = [md(addDays(easter, -3)), 'Jueves Santo'];
  const lp = [md(addDays(easter, 1)), 'Lunes de Pascua'];
  const rules = {
    AN: [['02-28', 'Día de Andalucía'], js],
    AR: [js, ['04-23', 'San Jorge, Día de Aragón']],
    AS: [js, ['09-08', 'Día de Asturias']],
    IB: [['03-01', 'Día de les Illes Balears'], js, lp, ['12-26', 'Sant Esteve']],
    CN: [js, ['05-30', 'Día de Canarias']],
    CB: [js, ['07-28', 'Día de las Instituciones de Cantabria'], ['09-15', 'La Bien Aparecida']],
    CM: [js, ['05-31', 'Día de Castilla-La Mancha']],
    CL: [js, ['04-23', 'Fiesta de Castilla y León']],
    CT: [
      lp,
      ['06-24', 'Sant Joan'],
      ['09-11', 'Diada Nacional de Catalunya'],
      ['12-26', 'Sant Esteve'],
    ],
    VC: [['03-19', 'San José'], lp, ['10-09', 'Día de la Comunitat Valenciana']],
    EX: [js, ['09-08', 'Día de Extremadura']],
    GA: [js, ['05-17', 'Día de las Letras Gallegas'], ['07-25', 'Día Nacional de Galicia']],
    MD: [js, ['05-02', 'Fiesta de la Comunidad de Madrid']],
    MC: [js, ['06-09', 'Día de la Región de Murcia']],
    NC: [js, lp, ['12-03', 'San Francisco Javier']],
    PV: [js, lp],
    RI: [js, lp, ['06-09', 'Día de La Rioja']],
    CE: [js, ['08-05', 'Nuestra Señora de África'], ['09-02', 'Día de Ceuta']],
    ML: [js, ['09-17', 'Día de Melilla']],
  };
  return rules[region] || [];
};

// Festivos propios: «dd/mm Nombre» o «dd/mm/aaaa Nombre» (también «aaaa-mm-dd Nombre»)
export const parseCustomHolidays = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let m = line.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*(.*)$/);
      if (m) return { year: +m[1], month: +m[2], day: +m[3], name: m[4] || 'Festivo' };
      m = line.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?=\s|$)\s*(.*)$/);
      if (m) {
        const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
        return { year, month: +m[2], day: +m[1], name: m[4] || 'Festivo' };
      }
      return null;
    })
    .filter((h) => h && h.month >= 1 && h.month <= 12 && h.day >= 1 && h.day <= 31);

/**
 * Festivos de un año.
 * @returns { map: Map<'aaaa-mm-dd', string[]>, exact: boolean }
 */
export const holidaysForYear = (year, region = '', customText = '') => {
  const map = new Map();
  const add = (key, name) => {
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).includes(name)) map.get(key).push(name);
  };
  const exact = EXACT[year];
  const national = exact ? exact.national : nationalRules(year);
  const regional = region
    ? exact
      ? exact.regional[region] || []
      : regionalRules(year, region)
    : [];
  [...national, ...regional].forEach(([md, name]) => add(`${year}-${md}`, name));
  parseCustomHolidays(customText)
    .filter((h) => h.year === null || h.year === year)
    .forEach((h) => add(dateKey(year, h.month, h.day), h.name));
  return { map, exact: !!exact };
};

// Días laborables (lunes a viernes que no son festivo) entre dos fechas, ambas incluidas
export const workingDaysBetween = (a, b, holidayOf) => {
  const start = a < b ? a : b;
  const end = a < b ? b : a;
  let n = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !holidayOf(d)) n++;
  }
  return n;
};
