// ORG Mode para Eli (4.51): Wiki Divio (Diátaxis) en 5 ficheros. Modelo puro (sin Redux ni DOM):
//   wiki/ index.org · tutoriales.org · procesos.org · referencia.org · explicacion.org
//   - Tipo = fichero. Entrada = cabecera de nivel 1 con `:ID:` y el TEMA como etiqueta de cabecera.
//   - «Procesos» con propiedades estructuradas (:FRECUENCIA: :RESPONSABLE: :ULTIMA_REVISION:).
//   - Plantillas, añadir al final de un fichero (sin tocar el resto), línea en `index.org`,
//     lectura de la tabla de Procesos y «Revisado hoy».
// Compatible con org-roam: las cabeceras con :ID: son nodos.
import { oneLine } from './eli_zk';

export const WIKI_DEFAULT_FOLDER = 'wiki/';
export const WIKI_KINDS = ['tutorial', 'proceso', 'referencia', 'explicacion'];
export const KIND_FILE = {
  tutorial: 'tutoriales.org',
  proceso: 'procesos.org',
  referencia: 'referencia.org',
  explicacion: 'explicacion.org',
};
export const INDEX_FILE = 'index.org';
export const KIND_LABEL = {
  tutorial: 'Tutorial',
  proceso: 'Proceso',
  referencia: 'Referencia',
  explicacion: 'Explicación',
};
// Pregunta guía de cada tipo (¿hacer o saber? ¿aprender o resolver?)
export const KIND_GUIDE = {
  tutorial: 'Aprender haciendo (estudio + acción)',
  proceso: 'Cómo hacer algo, paso a paso (trabajo + acción)',
  referencia: 'Datos secos para consultar (trabajo + conocimiento)',
  explicacion: 'Contexto y porqué (estudio + conocimiento)',
};
export const KIND_INDEX_HEADING = {
  tutorial: 'Tutoriales',
  proceso: 'Procesos',
  referencia: 'Referencia',
  explicacion: 'Explicación',
};
export const FRECUENCIAS = ['diaria', 'semanal', 'mensual', 'trimestral', 'anual', 'a demanda'];

// Carpeta de la wiki del ajuste: relativa a la del fichero de entrada (o absoluta), con «/» al final
export const normalizeWikiFolder = (raw) => {
  let d = String(raw || '').trim();
  if (!d) d = WIKI_DEFAULT_FOLDER;
  d = d.replace(/\/{2,}/g, '/');
  return d.endsWith('/') ? d : `${d}/`;
};
// `dir` = carpeta ya resuelta (absoluta, con «/» al final)
export const wikiPath = (dir, kind) => `${dir}${KIND_FILE[kind]}`;
export const wikiIndexPath = (dir) => `${dir}${INDEX_FILE}`;
export const wikiPaths = (dir) => [
  { kind: 'index', path: wikiIndexPath(dir) },
  ...WIKI_KINDS.map((kind) => ({ kind, path: wikiPath(dir, kind) })),
];

// Etiqueta de cabecera válida (sin espacios ni «:»)
export const cleanTag = (raw) =>
  oneLine(raw)
    .replace(/^#+/, '')
    .replace(/[\s:]+/g, '_')
    .replace(/^_+|_+$/g, '');

// AAAA-MM-DD (hora local)
export const isoDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// --- Ficheros base --------------------------------------------------------------------------

const FILE_TITLE = {
  tutorial: 'Tutoriales',
  proceso: 'Procesos',
  referencia: 'Referencia',
  explicacion: 'Explicación',
};
const FILE_INTRO = {
  tutorial: 'Tutoriales: aprender haciendo. ¿Quieres saber hacer algo nuevo? (estudio + acción)',
  proceso:
    'Procesos: cómo hacer algo, paso a paso. ¿Necesitas resolver una tarea? (trabajo + acción)',
  referencia: 'Referencia: datos secos para consultar. ¿Necesitas saber un dato? (trabajo + saber)',
  explicacion: 'Explicación: contexto y porqué. ¿Quieres entender algo? (estudio + conocimiento)',
};

export const kindFileText = (kind) => `#+TITLE: ${FILE_TITLE[kind]}\n# ${FILE_INTRO[kind]}\n\n`;

export const indexFileText = ({ id }) =>
  [
    ':PROPERTIES:',
    `:ID:       ${id}`,
    ':END:',
    '#+TITLE: Wiki',
    '# Portada: qué hay y por dónde empezar. Las entradas nuevas se añaden solas bajo su sección.',
    '',
    '| | Hacer (trabajo) | Saber (estudio) |',
    '|---+-----------------+-----------------|',
    '| Acción | Procesos | Tutoriales |',
    '| Conocimiento | Referencia | Explicación |',
    '',
    ...WIKI_KINDS.map((k) => `* ${KIND_INDEX_HEADING[k]}\n`),
    '* Exportar a un único PDF',
    '# Quita el «# » de estas líneas para incluir todo en una sola exportación.',
    ...WIKI_KINDS.map((k) => `# #+INCLUDE: "./${KIND_FILE[k]}"`),
    '',
  ].join('\n');

// --- Plantillas de entrada ---------------------------------------------------------------------

const drawer = (id, extra = []) =>
  [':PROPERTIES:', `:ID:       ${id}`, ...extra, ':END:'].join('\n');

const headingLine = (title, tag) => `* ${oneLine(title)}${tag ? ` :${tag}:` : ''}`;

// {title, id, tag?, frecuencia?, responsable? ({id,title}), date?}
export const entryText = (kind, o) => {
  const head = (extra) => `${headingLine(o.title, o.tag)}\n${drawer(o.id, extra)}\n`;
  if (kind === 'tutorial')
    return `${head()}** Objetivo\n\n** Necesitas\n\n** Pasos\n1. \n\n** Resultado\n`;
  if (kind === 'proceso') {
    const extra = [
      `:FRECUENCIA:      ${oneLine(o.frecuencia || 'a demanda')}`,
      ...(o.responsable && o.responsable.id
        ? [
            `:RESPONSABLE:     [[id:${o.responsable.id}][${String(
              o.responsable.title || ''
            ).replace(/[[\]]/g, '')}]]`,
          ]
        : []),
      `:ULTIMA_REVISION: ${o.date || isoDate()}`,
    ];
    return `${head(
      extra
    )}** Propósito\n\n** Disparador / Entradas\n\n** Pasos\n- [ ] \n\n** Salidas / Hecho cuando\n\n** Ver también\n`;
  }
  if (kind === 'referencia')
    return `${head()}| Elemento | Qué hace | Notas |\n|----------+----------+-------|\n|          |          |       |\n`;
  return `${head()}** Contexto\n\n** Por qué así\n\n** Alternativas descartadas\n\n** Ver también\n`;
};

// --- Lectura de cabeceras de nivel 1 -----------------------------------------------------------

const H1 = /^\*\s+(.*)$/;
const KEYWORDS = /^(TODO|NEXT|WAITING|SOMEDAY|MAYBE|DONE|CANCELLED|CANCELED)\s+/;
// «Título   :a:b:» → { title, tags }
export const splitTitle = (raw) => {
  let s = String(raw || '').replace(KEYWORDS, '');
  const m = /\s+(:[^\s:]+(?::[^\s:]+)*:)\s*$/.exec(s);
  let tags = [];
  if (m) {
    tags = m[1].split(':').filter(Boolean);
    s = s.slice(0, m.index);
  }
  return { title: s.trim(), tags };
};
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// → [{ title, tags, id, props: {NOMBRE: valor}, start, end }] (líneas [start, end) de cada entrada)
export const parseEntries = (text) => {
  const lines = String(text || '').split('\n');
  const out = [];
  let cur = null;
  lines.forEach((ln, i) => {
    const m = H1.exec(ln);
    if (m && !/^\*\*/.test(ln)) {
      if (cur) cur.end = i;
      const t = splitTitle(m[1]);
      cur = { title: t.title, tags: t.tags, id: '', props: {}, start: i, end: lines.length };
      out.push(cur);
      // cajón de propiedades justo debajo (puede haber líneas de planificación antes)
      let j = i + 1;
      while (j < lines.length && /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[j])) j++;
      if (j < lines.length && /^\s*:PROPERTIES:\s*$/i.test(lines[j])) {
        for (j += 1; j < lines.length && !/^\s*:END:\s*$/i.test(lines[j]); j++) {
          const p = /^\s*:([^:\s]+):\s*(.*)$/.exec(lines[j]);
          if (p) cur.props[p[1].toUpperCase()] = p[2].trim();
        }
        cur.id = cur.props.ID || '';
      }
    }
  });
  return out;
};

// ¿Hay ya una entrada con ese título? → su entrada o null
export const findEntryByTitle = (text, title) =>
  parseEntries(text).find((e) => norm(e.title) === norm(title)) || null;

// Añade la entrada AL FINAL del fichero sin tocar nada de lo anterior
export const appendEntry = (text, entry) => {
  const t = String(text || '');
  const sep = !t ? '' : t.endsWith('\n\n') ? '' : t.endsWith('\n') ? '\n' : '\n\n';
  return `${t}${sep}${entry}`;
};

// Línea `- [[id:…][Título]]` al final de la sección del tipo en index.org (la crea si falta)
export const addIndexLine = (indexText, kind, id, title) => {
  const line = `- [[id:${id}][${oneLine(title).replace(/[[\]]/g, '')}]]`;
  const heading = KIND_INDEX_HEADING[kind];
  const lines = String(indexText || '').split('\n');
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `* ${heading}`.toLowerCase());
  if (at < 0) return appendEntry(indexText, `* ${heading}\n${line}\n`);
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++)
    if (/^\*+\s/.test(lines[i]) && !/^\*\*/.test(lines[i])) {
      end = i;
      break;
    }
  let last = end - 1;
  while (last > at && lines[last].trim() === '') last--;
  lines.splice(last + 1, 0, line);
  return lines.join('\n');
};

// --- Procesos -----------------------------------------------------------------------------------

const linkLabel = (v) => {
  const m = /\[\[id:([^\]]+)\](?:\[([^\]]*)\])?\]/.exec(v || '');
  return m ? { id: m[1], name: m[2] || m[1] } : { id: '', name: String(v || '').trim() };
};

// Tabla de procesos de procesos.org
export const parseProcesses = (text) =>
  parseEntries(text).map((e) => {
    const r = linkLabel(e.props.RESPONSABLE);
    return {
      id: e.id,
      title: e.title,
      tema: e.tags[0] || '',
      tags: e.tags,
      frecuencia: e.props.FRECUENCIA || '',
      responsableId: r.id,
      responsable: r.name,
      ultima: /^\d{4}-\d{2}-\d{2}/.test(e.props.ULTIMA_REVISION || '')
        ? e.props.ULTIMA_REVISION.slice(0, 10)
        : '',
    };
  });

// Días desde la última revisión (null = nunca)
export const daysSince = (iso, today = isoDate()) => {
  if (!iso) return null;
  const a = Date.parse(`${iso}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000);
};

const cmpText = (a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
export const SORT_KEYS = ['revision', 'title', 'tema', 'frecuencia', 'responsable'];
// 'revision' = los más tiempo sin revisar arriba (sin fecha, los primeros)
export const sortProcesses = (list, key = 'revision', desc = false) => {
  const out = list.map((x, i) => ({ x, i }));
  out.sort((p, q) => {
    let c;
    if (key === 'revision') {
      const a = p.x.ultima || '';
      const b = q.x.ultima || '';
      c = a === b ? 0 : a < b ? -1 : 1;
    } else c = cmpText(p.x[key] || '', q.x[key] || '');
    if (desc) c = -c;
    return c || p.i - q.i;
  });
  return out.map((o) => o.x);
};

// filtro { frecuencia, responsable, tema } ('' = todos)
export const filterProcesses = (list, f = {}) =>
  list.filter(
    (p) =>
      (!f.frecuencia || norm(p.frecuencia) === norm(f.frecuencia)) &&
      (!f.responsable || norm(p.responsable) === norm(f.responsable)) &&
      (!f.tema || p.tags.some((t) => norm(t) === norm(f.tema)))
  );

// Pone/cambia una propiedad del cajón de la entrada con ese :ID: (el resto, byte a byte igual)
export const setEntryProperty = (text, id, name, value) => {
  const entries = parseEntries(text);
  const e = entries.find((x) => x.id && x.id.toLowerCase() === String(id).toLowerCase());
  if (!e) return null;
  const lines = String(text).split('\n');
  const key = name.toUpperCase();
  const pad = ' '.repeat(Math.max(1, 17 - key.length - 1));
  const newLine = `:${key}:${pad}${value}`;
  let j = e.start + 1;
  while (j < lines.length && /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[j])) j++;
  if (!(j < lines.length && /^\s*:PROPERTIES:\s*$/i.test(lines[j]))) return null;
  let endAt = -1;
  for (let k = j + 1; k < lines.length; k++) {
    if (/^\s*:END:\s*$/i.test(lines[k])) {
      endAt = k;
      break;
    }
    const p = /^\s*:([^:\s]+):/.exec(lines[k]);
    if (p && p[1].toUpperCase() === key) {
      lines[k] = newLine;
      return lines.join('\n');
    }
  }
  if (endAt < 0) return null;
  lines.splice(endAt, 0, newLine);
  return lines.join('\n');
};
