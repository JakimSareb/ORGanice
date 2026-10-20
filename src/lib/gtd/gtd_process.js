// ORG Mode para Eli (3.40): «Procesar Inbox» (estilo FacileThings). Partes puras: modo de pantalla,
// etiquetas que escribe el usuario y el Tickler (tickler.org por años y meses).
import generateId from '../id_generator';

export const LS_PROCESS_MODE = 'eliGtdProcessMode';
// 'step' = una a una (por defecto) · 'all' = todo junto en una tarjeta
export const getProcessMode = () => {
  try {
    return window.localStorage.getItem(LS_PROCESS_MODE) === 'all' ? 'all' : 'step';
  } catch (e) {
    return 'step';
  }
};
export const setProcessMode = (mode) => {
  try {
    window.localStorage.setItem(LS_PROCESS_MODE, mode === 'all' ? 'all' : 'step');
  } catch (e) {
    // sin almacenamiento: se queda el de por defecto
  }
};

// «casa, @tel  Ana López» → ['casa', '@tel', 'Ana_López'] (comas separan; dentro, espacios → _)
export const parseTagsInput = (text) => {
  const s = (text || '').trim();
  if (!s) return [];
  const parts = s.includes(',') ? s.split(',') : s.split(/\s+/);
  return parts
    .map((p) =>
      p
        .trim()
        .replace(/^:+|:+$/g, '')
        .replace(/\s+/g, '_')
        .replace(/:/g, '')
    )
    .filter(Boolean);
};
// Persona de Waiting = una sola etiqueta (los espacios pasan a _)
export const personTag = (text) =>
  (text || '').trim().replace(/:/g, '').replace(/\s+/g, '_') || null;

export const mergeTags = (base, extra) => {
  const out = [...(base || [])];
  (extra || []).forEach((t) => {
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  });
  return out;
};

// ---- Tickler ----
export const TICKLER_MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];
export const ticklerYearTitle = (year) => `*[ TICKLER ${year} ]*`;

const plain = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[*[\]]/g, ' ')
    .trim()
    .toUpperCase();
const yearOf = (title) => {
  const m = /TICKLER\s+(\d{4})/.exec(plain(title));
  return m ? Number(m[1]) : null;
};
const monthOf = (title) => {
  const p = plain(title).replace(/\s+/g, ' ');
  const i = TICKLER_MONTHS.findIndex((m) => p === m || (m === 'SEPTIEMBRE' && p === 'SETIEMBRE'));
  return i;
};

// Cabeceras (lista Immutable o array de objetos {id, nestingLevel, title}) → plano sencillo
const toPlain = (headers) =>
  (headers && headers.toArray ? headers.toArray() : headers || []).map((h) =>
    h.get
      ? {
          id: h.get('id'),
          level: h.get('nestingLevel'),
          title: h.getIn(['titleLine', 'rawTitle']) || '',
        }
      : { id: h.id, level: h.nestingLevel || h.level, title: h.title || '' }
  );

// Qué hay que crear para poder guardar en la fecha `date`: { yearId, monthId, create }.
// create = lista de pasos { kind: 'add', id, title, parentId } y { kind: 'move', id, targetId,
// position }. Años: en el orden que ya tenga el fichero (si hay uno solo o ninguno, del más nuevo
// al más viejo, como los meses). Meses: de DICIEMBRE a ENERO.
export const ticklerPlan = (headers, date, makeId = generateId) => {
  const hs = toPlain(headers);
  const y = date.getFullYear();
  const m = date.getMonth();
  const create = [];
  const years = hs
    .map((h, i) => ({ ...h, i, year: yearOf(h.title) }))
    .filter((h) => h.year !== null && h.level === Math.min(...hs.map((x) => x.level)));
  let year = years.find((h) => h.year === y);
  let yearId = year ? year.id : null;
  if (!year) {
    yearId = makeId();
    create.push({ kind: 'add', id: yearId, title: ticklerYearTitle(y), parentId: null });
    const ascending = years.length >= 2 && years[0].year < years[years.length - 1].year;
    const after = ascending ? years.find((h) => h.year > y) : years.find((h) => h.year < y);
    if (after) create.push({ kind: 'move', id: yearId, targetId: after.id, position: 'before' });
    else if (years.length)
      create.push({
        kind: 'move',
        id: yearId,
        targetId: years[years.length - 1].id,
        position: 'after',
      });
  }
  let monthId = null;
  if (year) {
    const kids = [];
    for (let k = year.i + 1; k < hs.length && hs[k].level > year.level; k++) {
      if (hs[k].level === year.level + 1) kids.push({ ...hs[k], month: monthOf(hs[k].title) });
    }
    const found = kids.find((k) => k.month === m);
    if (found) monthId = found.id;
    else {
      monthId = makeId();
      create.push({ kind: 'add', id: monthId, title: TICKLER_MONTHS[m], parentId: yearId });
      const next = kids.find((k) => k.month >= 0 && k.month < m);
      if (next) create.push({ kind: 'move', id: monthId, targetId: next.id, position: 'before' });
    }
  } else {
    monthId = makeId();
    create.push({ kind: 'add', id: monthId, title: TICKLER_MONTHS[m], parentId: yearId });
  }
  return { yearId, monthId, create };
};

// ¿Es la ruta de un tickler.org?
export const isTicklerPath = (p) => /(^|\/)tickler\.org$/i.test(p || '');
// tickler.org junto al fichero dado (o en la raíz)
export const ticklerPathNear = (path) => {
  const i = (path || '').lastIndexOf('/');
  return (i >= 0 ? path.slice(0, i + 1) : '/') + 'tickler.org';
};
