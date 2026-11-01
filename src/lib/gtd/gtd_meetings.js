// ORG Mode para Eli (4.60): reuniones (`:TYPE: meeting` en reuniones.org), plantillas
// (`:TYPE: plantilla`) y el detector de tareas de un acta. Modelo PURO (cabeceras Immutable); lo
// que toca ficheros está en gtd_agendas_actions.js.
import formatDate from 'date-fns/format';
import {
  displayTitle,
  propertyValue,
  parsePersonLinks,
  parseProjectLink,
  PROJECT_LINK_PROPERTY,
  ownTypeOf,
} from './gtd_model';
import { PERSON_PROPERTY } from './gtd_persons';

export const MEETING_TYPE = 'meeting';
export const TEMPLATE_TYPE = 'plantilla';

// Título por defecto: «2026-11-01 Reunión con Ana» (sin nombre: «2026-11-01 Reunión»)
export const meetingTitle = (name = '', date = new Date()) =>
  `${formatDate(date, 'yyyy-MM-dd')} Reunión${
    String(name || '').trim() ? ` con ${String(name).trim()}` : ''
  }`;

// Fecha de la reunión como timestamp INACTIVO (no entra en la agenda/calendario)
export const meetingDateLine = (date = new Date()) => `[${formatDate(date, 'yyyy-MM-dd eee')}]`;

// «[2026-11-01 Sun 10:30]» → 20261101 1030 (para ordenar); sin fecha → 0
const stampKey = (v) => {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:[^\]\d]*(\d{1,2}):(\d{2}))?/.exec(String(v || ''));
  if (!m) return 0;
  return Number(`${m[1]}${m[2]}${m[3]}${(m[4] || '0').padStart(2, '0')}${m[5] || '00'}`);
};
const dayOf = (v) => {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(v || ''));
  return m ? m[1] : '';
};

/**
 * Reuniones de un fichero: las cabeceras `:TYPE: meeting` que no cuelgan de otra meeting, con
 * `personId` en su :PERSONA: y/o `projectId` en su :PROYECTO: (sin ninguno de los dos: todas).
 * De más reciente a más antigua (por :CREATED:; si no, por la primera fecha del título/notas; a
 * igualdad, la que va más abajo en el fichero primero). → [{ headerId, title, date, created, path }]
 */
export const meetingsIn = (file, path = '', { personId = null, projectId = null } = {}) => {
  const headers = file && file.get && file.get('headers');
  if (!headers) return [];
  const out = [];
  const stack = [];
  headers.forEach((h, i) => {
    const level = h.get('nestingLevel') || 1;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const isMeeting = ownTypeOf(h) === MEETING_TYPE;
    const insideMeeting = stack.some((x) => x.meeting);
    stack.push({ level, meeting: isMeeting });
    if (!isMeeting || insideMeeting) return;
    const lower = (x) => String(x || '').toLowerCase();
    if (personId) {
      const ids = parsePersonLinks(propertyValue(h, PERSON_PROPERTY)).map((x) => lower(x.id));
      if (!ids.includes(lower(personId))) return;
    }
    if (projectId) {
      const pl = parseProjectLink(propertyValue(h, PROJECT_LINK_PROPERTY));
      if (!pl || lower(pl.id) !== lower(projectId)) return;
    }
    const rawTitle = h.getIn(['titleLine', 'rawTitle']) || '';
    const created = propertyValue(h, 'CREATED') || '';
    const when =
      created ||
      (/\d{4}-\d{2}-\d{2}/.test(rawTitle) ? rawTitle : '') ||
      h.get('rawDescription') ||
      '';
    out.push({
      headerId: h.get('id'),
      title: displayTitle(rawTitle),
      created,
      date: dayOf(when),
      sortKey: stampKey(when),
      index: i,
      path,
    });
  });
  return out.sort((a, b) => b.sortKey - a.sortKey || b.index - a.index);
};

// Filtro por texto de la lista «Ver todas»
export const filterMeetings = (list, q) => {
  const words = String(q || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return list;
  return list.filter((m) => {
    const t = `${m.title} ${m.date}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return words.every((w) => t.includes(w));
  });
};

/**
 * Plantillas de todos los ficheros cargados: cabeceras con `:TYPE: plantilla`.
 * files = Map Immutable (ruta → fichero). → [{ path, headerId, title }]
 */
export const templatesIn = (files) => {
  const out = [];
  (files || []).forEach((file, path) => {
    if (!path || /\.org_archive$/i.test(path) || !file || !file.get('headers')) return;
    file.get('headers').forEach((h) => {
      if (ownTypeOf(h) === TEMPLATE_TYPE)
        out.push({
          path,
          headerId: h.get('id'),
          title: displayTitle(h.getIn(['titleLine', 'rawTitle']) || ''),
        });
    });
  });
  return out;
};

// ¿El texto recibido ya es un acta en formato Org (empieza por cabeceras «* »)?
export const isOrgSummary = (text) => /^\s*\*+\s+\S/.test(String(text || ''));

// Texto recibido → cuerpo de la subcabecera «Transcripción»/«Acta»: las líneas que empiezan por
// «*» se protegen con una coma (como hace Org en los bloques) salvo en un acta Org, donde sus
// cabeceras bajan de nivel para quedar DENTRO de la subcabecera (nivel base `level`).
export const transcriptBody = (text, level = 2) => {
  const src = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/, '');
  if (!isOrgSummary(src)) return src.replace(/^(\*+\s)/gm, ',$1');
  return src.replace(/^(\*+)(\s)/gm, (m, stars, sp) => `${'*'.repeat(stars.length + level)}${sp}`);
};

// ---------------- Detector de tareas (sin IA: reglas sencillas en español) ----------------

const TASK_RULES = [
  /\bse encarga(?:rá)? de\b/i,
  /\bse ocupa(?:rá)? de\b/i,
  /\bquedamos en\b/i,
  /\bqueda(?:mos)? pendiente\b/i,
  /\bhay que\b/i,
  /\btengo que\b/i,
  /\btenemos que\b/i,
  /\btiene que\b/i,
  /\bdebe(?:mos|ría|ríamos)?\b/i,
  /\bva a\b/i,
  /\bvamos a\b/i,
  /\bpara el (?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d{1,2})\b/i,
  /\bantes del? (?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d{1,2})\b/i,
  /^\s*(?:tarea|acción|accion|todo|pendiente)\s*:/i,
  /\[ \]/,
];

// Frases de un texto (por líneas y por puntos), limpias de viñetas y casillas
const sentencesOf = (text) =>
  String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(?:\*+\s|#\+|:[A-Z_]+:)/i.test(l))
    .flatMap((l) => l.replace(/([.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/g, '$1\n').split('\n'))
    .map((s) =>
      s
        // una casilla sin marcar («- [ ] …») es una tarea
        .replace(/^\s*(?:[-+]|\d+[.)])\s+\[ \]\s*/, 'Pendiente: ')
        .replace(/^\s*(?:[-+]|\d+[.)])\s+/, '')
        .replace(/^\[[ xX-]\]\s*/, '')
        .trim()
    )
    .filter((s) => s.length > 3);

/**
 * Posibles tareas de un acta o transcripción. `contacts` = [{ orgId, name, aliases }] para
 * reconocer a la persona por nombre/alias. → [{ text, person: { id, title } | null }] (sin
 * repetidas; como mucho 30)
 */
export const detectTasks = (text, contacts = []) => {
  const seen = new Set();
  const out = [];
  const plain = (t) =>
    String(t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  // nombres de pila que solo tiene UN contacto («Ana» → Ana García)
  const firstCount = new Map();
  (contacts || []).forEach((c) => {
    const f = plain(String(c.name || '').split(/\s+/)[0]);
    if (f) firstCount.set(f, (firstCount.get(f) || 0) + 1);
  });
  const namesOf = (c) => {
    const first = plain(String(c.name || '').split(/\s+/)[0]);
    return [c.name, ...(c.aliases || []), firstCount.get(first) === 1 ? first : null].filter(
      Boolean
    );
  };
  sentencesOf(text).forEach((s) => {
    if (out.length >= 30) return;
    if (!TASK_RULES.some((re) => re.test(s))) return;
    const clean = s
      .replace(/^(?:tarea|acción|accion|todo|pendiente)\s*:\s*/i, '')
      .replace(/\s+/g, ' ');
    const key = plain(clean);
    if (seen.has(key)) return;
    seen.add(key);
    const p = plain(clean);
    const who = (contacts || []).find(
      (c) =>
        c.orgId &&
        namesOf(c).some((n) =>
          new RegExp(
            `(^|[^a-z0-9])${plain(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`
          ).test(p)
        )
    );
    out.push({ text: clean, person: who ? { id: who.orgId, title: who.name } : null });
  });
  return out;
};
