// ORG Mode para Eli (4.48): Agendas (David Allen): listas de lo que hay que hablar con una
// persona o hacer en una ocasión/lugar, leídas del `agendas.org` del usuario SIN reescribirlo.
//   - Una agenda = cada cabecera con contenido propio (lista o texto). De persona si su título es
//     el nombre (o alias) de un contacto o si lleva :PERSONA:; si no, de ocasión/lugar. Las de
//     nivel 2 o más se agrupan bajo su madre de nivel 1 («Quan siguem a…»).
//   - El contenido se muestra tal cual; marcar = solo «[ ]»→«[X]» en esa línea; un punto nuevo es
//     UNA línea tras el último ítem de lista, con su sangría y su estilo («- [ ]», «-» o «+»).
// Modelo puro (texto del cuerpo y cabeceras Immutable): ver lib/gtd/gtd_persons_actions.js.
import { displayTitle, propertyValue, parsePersonLinks } from './gtd_model';
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

/**
 * Agendas de agendas.org (fichero Immutable) con los contactos de personas.org →
 * { all, persons, groups } · agenda = { headerId, orgId, title, level, body, person ({ id, name }
 * o null), group (título de la madre de nivel 1 o null), open (casillas sin marcar) }
 * groups = [{ title, headerId, items }] (las de ocasión/lugar; las de nivel 1 sin madre van solas).
 */
export const parseAgendas = (file, contacts = [], path = '') => {
  const headers = file && file.get && file.get('headers');
  const out = { all: [], persons: [], groups: [], path };
  if (!headers) return out;
  let mother = null;
  headers.forEach((h) => {
    const level = h.get('nestingLevel') || 1;
    const title = displayTitle(h.getIn(['titleLine', 'rawTitle']) || '');
    if (level === 1) mother = { title, headerId: h.get('id') };
    const body = h.get('rawDescription') || '';
    if (!body.trim()) return;
    const link = parsePersonLinks(propertyValue(h, PERSON_PROPERTY))[0] || null;
    const contact = link ? contactById(contacts, link.id) : contactNamed(contacts, title);
    const person = link
      ? { id: link.id, name: (contact && contact.name) || link.title || title }
      : contact && contact.orgId
      ? { id: contact.orgId, name: contact.name }
      : null;
    out.all.push({
      headerId: h.get('id'),
      orgId: propertyValue(h, 'ID'),
      title,
      level,
      body,
      person,
      group: level > 1 && mother ? mother.title : null,
      groupId: level > 1 && mother ? mother.headerId : null,
      open: openCount(body),
    });
  });
  out.persons = out.all.filter((a) => a.person);
  const byGroup = new Map();
  out.all
    .filter((a) => !a.person)
    .forEach((a) => {
      const k = a.groupId || `self:${a.headerId}`;
      if (!byGroup.has(k))
        byGroup.set(k, { title: a.group, headerId: a.groupId || a.headerId, items: [] });
      byGroup.get(k).items.push(a);
    });
  out.groups = Array.from(byGroup.values());
  return out;
};

// Agenda de una persona (por id de contacto) o null
export const agendaOfPerson = (agendas, orgId) =>
  (agendas &&
    agendas.persons.find((a) => a.person.id.toLowerCase() === String(orgId).toLowerCase())) ||
  null;

// Lista plana para elegir: personas primero y luego ocasiones (con su madre)
export const agendaChoices = (agendas) => [
  ...agendas.persons.map((a) => ({ agenda: a, label: a.person.name, hint: 'persona' })),
  ...agendas.groups.flatMap((g) =>
    g.items.map((a) => ({ agenda: a, label: a.title, hint: g.title || 'ocasión' }))
  ),
];
