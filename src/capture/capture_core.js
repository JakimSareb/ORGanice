// ORG Mode para Eli: captura rápida (Atajos de iOS, marcador) – lógica pura, sin DOM.
import { Map as IMap } from 'immutable';
import substituteTemplateVariables from '../lib/capture_template_substitution';
import { formatOrgLink } from '../lib/eli_links';

// Parámetros de la dirección de captura
//   k      App key de Dropbox (obligatoria: elige el "entorno")
//   t      nombre (descripción) o letra de la plantilla de captura de organice
//   f      fichero de destino (si no hay plantilla, o para cambiar el de la plantilla)
//   url    enlace capturado · title  título de la página · text  texto seleccionado
//   auto=1 guardar sin mostrar el formulario
export const parseCaptureParams = (search) => {
  const q = new URLSearchParams(search || '');
  const get = (k) => (q.get(k) || '').trim();
  return {
    appKey: get('k'),
    template: get('t'),
    file: get('f'),
    url: get('url'),
    title: get('title'),
    text: q.get('text') || '',
    auto: q.get('auto') === '1',
  };
};

export const findTemplate = (templates, name) => {
  if (!name || !templates) return null;
  const n = name.toLowerCase();
  return (
    templates.find((t) => (t.description || '').toLowerCase() === n) ||
    templates.find((t) => (t.letter || '').toLowerCase() === n) ||
    null
  );
};

export const templatesFromConfig = (configText) => {
  try {
    const config = JSON.parse(configText);
    const raw = config.captureTemplates;
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
};

// Título propuesto para el encabezado: [[url][título]], o el texto si no hay url
export const defaultHeadline = ({ url, title, text }) => {
  if (url) return formatOrgLink(url, title && title !== url ? title : '');
  if (title) return title;
  return (text || '').split('\n')[0].slice(0, 120);
};

// Texto del nuevo encabezado (sin asteriscos): primera línea = título, resto = cuerpo.
// La plantilla de organice usa su primera línea como título (normalmente vacía).
export const buildEntry = ({ template, headline, note }) => {
  const [substituted, cursor] = substituteTemplateVariables(
    (template && template.template) || '',
    IMap()
  );
  let body = substituted;
  const extra = (note || '').trim();
  if (extra) {
    body =
      cursor !== null && cursor !== undefined && cursor > 0
        ? body.slice(0, cursor) + extra + body.slice(cursor)
        : body.replace(/\s*$/, '') + '\n' + extra;
  }
  const lines = body.split('\n');
  const first = lines.shift() || '';
  const title = [first.trim(), (headline || '').trim()].filter(Boolean).join(' ');
  return { title, bodyLines: lines.filter((l, i) => !(i === lines.length - 1 && l === '')) };
};

const HEADING = /^(\*+)\s+(.*)$/;

const keywordsIn = (lines) => {
  const kws = new Set(['TODO', 'DONE']);
  lines.forEach((l) => {
    const m = /^#\+(SEQ_|TYP_)?TODO:\s*(.*)$/i.exec(l);
    if (m) m[2].split(/\s+/).forEach((w) => w && w !== '|' && kws.add(w.replace(/\(.*\)$/, '')));
  });
  return kws;
};

const bareTitle = (raw, kws) => {
  let t = raw.replace(/\s+:[\w@#%:]+:\s*$/, '').trim();
  const first = t.split(/\s+/)[0];
  if (kws.has(first)) t = t.slice(first.length).trim();
  return t.replace(/^\[#[A-Z]\]\s*/, '');
};

// Inserta el encabezado en el texto del fichero, como organice (INSERT_CAPTURE):
//  - sin headerPaths: al principio (tras la cabecera del fichero) o al final, en nivel 1
//  - con headerPaths: debajo de ese encabezado (primero o último de sus hijos)
// Devuelve el texto nuevo o lanza un error si no encuentra el encabezado de destino.
export const insertEntry = (fileText, { title, bodyLines }, template = {}) => {
  const text = fileText || '';
  const lines = text ? text.split('\n') : [];
  if (text.endsWith('\n')) lines.pop();
  const prepend = !!template.shouldPrepend;
  const path = (template.headerPaths || []).filter((p) => p && p.trim());
  const kws = keywordsIn(lines);

  let insertAt;
  let level = 1;
  if (!path.length) {
    if (prepend) {
      insertAt = lines.findIndex((l) => HEADING.test(l));
      if (insertAt < 0) insertAt = lines.length;
    } else {
      insertAt = lines.length;
    }
  } else {
    // Buscar la ruta de encabezados
    let from = 0;
    let to = lines.length;
    let parentIndex = -1;
    let parentLevel = 0;
    for (const part of path) {
      let found = -1;
      for (let i = from; i < to; i++) {
        const m = HEADING.exec(lines[i]);
        if (!m) continue;
        if (m[1].length <= parentLevel) break;
        if (m[1].length === parentLevel + 1 && bareTitle(m[2], kws) === part.trim()) {
          found = i;
          break;
        }
      }
      if (found < 0) throw new Error(`No se encuentra el encabezado «${path.join(' / ')}»`);
      parentIndex = found;
      parentLevel = HEADING.exec(lines[found])[1].length;
      from = found + 1;
      to = lines.length;
      for (let i = from; i < lines.length; i++) {
        const m = HEADING.exec(lines[i]);
        if (m && m[1].length <= parentLevel) {
          to = i;
          break;
        }
      }
    }
    level = parentLevel + 1;
    if (prepend) {
      insertAt = from;
      while (insertAt < to && !HEADING.test(lines[insertAt])) insertAt++;
    } else {
      insertAt = to;
      while (insertAt > from && lines[insertAt - 1] === '') insertAt--;
    }
    void parentIndex;
  }

  const entry = [`${'*'.repeat(level)} ${title}`.trimEnd(), ...bodyLines];
  lines.splice(insertAt, 0, ...entry);
  return lines.join('\n') + '\n';
};
