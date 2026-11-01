// ORG Mode para Eli (4.48/4.50): Agendas (David Allen): lo que hay que hablar con una persona o
// hacer en una ocasión/lugar, leído del `agendas.org` del usuario SIN reescribirlo.
//   - (4.50) ÁRBOL DE CABECERAS: la de nivel 1 es la agenda principal (de persona si su título es
//     el nombre —o alias— de un contacto o si lleva :PERSONA:; si no, lugar/ocasión) y todas sus
//     subcabeceras, a cualquier nivel, son puntos a tratar. Notas = detalle (con sus «secciones»,
//     los elementos «-»/«+» con notas propias). Punto tratado = estado DONE.
//   - Las casillas viejas («- [ ]», «-», «+») dentro de las notas se respetan: marcar = solo
//     «[ ]»→«[X]» en esa línea. Lo NUEVO siempre son subcabeceras (ver gtd_persons_actions.js).
// Modelo puro (cabeceras Immutable).
import {
  displayTitle,
  propertyValue,
  parsePersonLinks,
  parseProjectLink,
  PROJECT_LINK_PROPERTY,
  ownTypeOf,
  PRIORITY_RE,
} from './gtd_model';
import { contactNamed, contactById, PERSON_PROPERTY } from './gtd_persons';

// Ítem de lista: sangría, viñeta, casilla opcional y texto
const ITEM_RE = /^(\s*)([-+]|\d+[.)]|\s\*)\s+(?:\[([ xX-])\]\s+)?(.*)$/;
export const listItemOf = (line) => {
  const m = ITEM_RE.exec(line || '');
  if (!m) return null;
  // «*» solo vale con sangría (a la izquierda del todo sería una cabecera)
  const bullet = m[2].trim();
  return {
    indent: m[1] + (m[2].startsWith(' ') ? ' ' : ''),
    bullet,
    check: m[3] === undefined ? null : m[3],
    text: m[4],
  };
};

// Líneas del cuerpo con lo que es cada una
export const bodyLines = (body) =>
  String(body || '')
    .split('\n')
    .map((line, i) => ({ i, line, item: listItemOf(line) }));

export const openCount = (body) =>
  bodyLines(body).filter((l) => l.item && l.item.check === ' ').length;

// Marcar / desmarcar la casilla de la línea `lineIndex` (solo cambia «[ ]» ⇄ «[X]» en esa línea)
export const toggleBodyCheckbox = (body, lineIndex) => {
  const lines = String(body || '').split('\n');
  const line = lines[lineIndex];
  const it = listItemOf(line);
  if (!it || it.check === null) return body;
  lines[lineIndex] = line.replace(/\[([ xX-])\]/, it.check === ' ' ? '[X]' : '[ ]');
  return lines.join('\n');
};

/**
 * Punto nuevo en el cuerpo de una agenda. UNA sola línea, justo después del ÚLTIMO ítem de lista
 * (y de sus líneas de texto pegadas, que son su continuación), antes de las líneas en blanco y de
 * lo que siga; con la sangría y el estilo del último ítem: «- [ ] texto» si usa casillas, «- texto»
 * si no (con su viñeta: «+» si usa «+»). Sin lista: «- [ ] texto» tras la última línea con texto.
 * El resto del texto no cambia ni un byte.
 */
export const addPointToBody = (body, text) => {
  const clean = String(text || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  const src = String(body || '');
  if (!clean) return src;
  const lines = src.split('\n');
  let last = -1;
  lines.forEach((l, i) => {
    if (listItemOf(l)) last = i;
  });
  let line;
  let at;
  if (last >= 0) {
    const it = listItemOf(lines[last]);
    const bullet = /^\d/.test(it.bullet) ? '-' : it.bullet;
    line = `${it.indent}${bullet} ${it.check !== null ? '[ ] ' : ''}${clean}`;
    at = last + 1;
    while (at < lines.length && lines[at].trim() !== '' && !listItemOf(lines[at])) at++;
  } else {
    line = `- [ ] ${clean}`;
    at = lines.length;
    while (at > 0 && lines[at - 1].trim() === '') at--;
  }
  if (!src) return line;
  lines.splice(at, 0, line);
  return lines.join('\n');
};

const DONE_KEYWORDS = ['DONE', 'CANCELLED', 'CANCELED'];
export const isDoneKeyword = (k) => DONE_KEYWORDS.includes(String(k || '').toUpperCase());

/**
 * Agendas de agendas.org (fichero Immutable) con los contactos de personas.org →
 * { roots, all, persons, places, nodes, path }
 *   nodo = { headerId, orgId, title, rawTitle, level, body, keyword, done, person ({ id, name } o null),
 *            children, parentId, open (puntos pendientes + casillas sin marcar de todo el
 *            subárbol), points (puntos pendientes del subárbol, sin contar este) }
 *   roots = all = las agendas principales (nivel 1, o la primera cabecera si el fichero empieza por
 *   un nivel más profundo) · persons = las de persona · places = el resto (lugares/ocasiones)
 *   nodes = todos los nodos en el orden del documento.
 */
// (4.60) `projectTitleOf(id)` → título del proyecto con ese :ID: o null (enlace roto). Prioridad al
// clasificar una principal: persona (:PERSONA:/nombre/alias) > proyecto (:PROYECTO:) > lugar.
export const parseAgendas = (file, contacts = [], path = '', projectTitleOf = null) => {
  const headers = file && file.get && file.get('headers');
  const out = { roots: [], all: [], persons: [], places: [], projects: [], nodes: [], path };
  if (!headers) return out;
  const stack = [];
  headers.forEach((h) => {
    const level = h.get('nestingLevel') || 1;
    const title = displayTitle(h.getIn(['titleLine', 'rawTitle']) || '');
    const keyword = h.getIn(['titleLine', 'todoKeyword']) || null;
    const body = h.get('rawDescription') || '';
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;
    const node = {
      headerId: h.get('id'),
      orgId: propertyValue(h, 'ID'),
      title,
      // (4.57) título tal cual (con sus enlaces; sin la prioridad), para editarlo
      rawTitle: (h.getIn(['titleLine', 'rawTitle']) || '').replace(PRIORITY_RE, '').trim(),
      level,
      body,
      keyword,
      type: ownTypeOf(h),
      done: isDoneKeyword(keyword),
      person: null,
      project: null,
      children: [],
      parentId: parent ? parent.headerId : null,
      open: 0,
      points: 0,
    };
    if (!parent) {
      const link = parsePersonLinks(propertyValue(h, PERSON_PROPERTY))[0] || null;
      const contact = link ? contactById(contacts, link.id) : contactNamed(contacts, title);
      node.person = link
        ? { id: link.id, name: (contact && contact.name) || link.title || title }
        : contact && contact.orgId
        ? { id: contact.orgId, name: contact.name }
        : null;
      if (!node.person) {
        const pl = parseProjectLink(propertyValue(h, PROJECT_LINK_PROPERTY));
        if (pl) {
          const t = projectTitleOf ? projectTitleOf(pl.id) : null;
          node.project = { id: pl.id, name: t || pl.title || title, missing: !t };
        }
      }
      out.roots.push(node);
    } else parent.children.push(node);
    out.nodes.push(node);
    stack.push(node);
  });
  // pendientes del subárbol (un punto tratado no cuenta ni él ni sus hijos)
  const count = (n, isRoot) => {
    let open = n.done && !isRoot ? 0 : openCount(n.body);
    let points = 0;
    n.children.forEach((c) => {
      count(c, false);
      if (c.done) return;
      points += 1 + c.points;
      open += 1 + c.open;
    });
    n.open = open;
    n.points = points;
  };
  out.roots.forEach((r) => count(r, true));
  out.all = out.roots;
  out.persons = out.roots.filter((a) => a.person);
  out.projects = out.roots.filter((a) => !a.person && a.project);
  out.places = out.roots.filter((a) => !a.person && !a.project);
  return out;
};

// Agenda de una persona (por id de contacto) o null
export const agendaOfPerson = (agendas, orgId) =>
  (agendas &&
    agendas.persons.find((a) => a.person.id.toLowerCase() === String(orgId).toLowerCase())) ||
  null;

// (4.60) Agenda de un proyecto (por su :ID:) o null
export const agendaOfProject = (agendas, orgId) =>
  (agendas &&
    orgId &&
    agendas.projects.find((a) => a.project.id.toLowerCase() === String(orgId).toLowerCase())) ||
  null;

// Nodo por id de cabecera
export const agendaNode = (agendas, headerId) =>
  (agendas && agendas.nodes.find((n) => n.headerId === headerId)) || null;

// Lista plana jerárquica para elegir (personas, lugares y (4.60) proyectos; cada una con sus
// puntos bajo ella, sangrados): [{ node, depth, root }]
export const agendaChoices = (agendas) => {
  const out = [];
  const walk = (n, depth, root) => {
    out.push({ node: n, depth, root });
    n.children.forEach((c) => walk(c, depth + 1, root));
  };
  [...agendas.persons, ...agendas.places, ...(agendas.projects || [])].forEach((r) =>
    walk(r, 0, r)
  );
  return out;
};

// Nº de puntos de un nodo que se ven con «Ocultar tratados» (los tratados y su subárbol no)
export const visibleChildren = (node, hideDone) =>
  hideDone ? node.children.filter((c) => !c.done) : node.children;

// (4.57) Filtro por texto de Personas y Agendas (sin mirar mayúsculas ni acentos; todas las palabras)
const plain = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
export const filterWords = (q) => plain(q).split(/\s+/).filter(Boolean);
const hasAll = (words, text) => {
  const t = plain(text);
  return words.every((w) => t.includes(w));
};
// ¿El título, las notas o la persona de este nodo cumplen?
export const nodeMatches = (node, words) =>
  !words.length ||
  hasAll(
    words,
    `${node.title} ${node.body} ${node.person ? node.person.name : ''} ${
      node.project ? node.project.name : ''
    }`
  );
// …o algún punto de su subárbol
export const nodeMatchesDeep = (node, words) =>
  !words.length || nodeMatches(node, words) || node.children.some((c) => nodeMatchesDeep(c, words));
// ¿Un contacto de personas.org cumple? (nombre, alias, empresa, correo)
export const contactMatches = (c, words) =>
  !words.length ||
  hasAll(words, [c.name, ...(c.aliases || []), c.empresa, c.email].filter(Boolean).join(' '));
