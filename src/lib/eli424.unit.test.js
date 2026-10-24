// 4.24: enlaces solo por ID y aviso al borrar encabezados enlazados
import { Map as IMap } from 'immutable';
import { parseOrg } from './parse_org';
import { storeHeadingLink, storedHeadingLink } from './eli_org_links';
import {
  headerOrgId,
  withOrgIdProperty,
  idHeadingLink,
  subtreeOrgIds,
  idLinkReferences,
  idLinksToText,
  isOnlyIdLink,
  referencesMessage,
} from './eli_id_links';
import { incomingIdLinks } from './eli_confirm_remove';

const file = (text) => IMap({ headers: parseOrg(text).get('headers') });
const byTitle = (headers, t) => headers.find((h) => h.getIn(['titleLine', 'rawTitle']) === t);

const A = `* Proyecto web
:PROPERTIES:
:ID: AAA-1
:END:
** Diseño
:PROPERTIES:
:ID: BBB-2
:END:
* Otra
`;
const B = `* Notas
Mira [[id:AAA-1][la web]] y [[id:BBB-2]].
* Ver [[id:aaa-1][web]] hoy
* Tarea
:PROPERTIES:
:PROYECTO: [[id:AAA-1][Proyecto web]]
:END:
* Sin enlaces
`;

test('el enlace copiado es siempre por ID', () => {
  expect(storeHeadingLink('X-9', '[#A] Llamar [1/2]')).toBe('[[id:X-9][Llamar]]');
  expect(storedHeadingLink()).toMatchObject({ id: 'X-9' });
  expect(storeHeadingLink('X-9', 'Hola')).not.toMatch(/file:|::\*/);
  expect(idHeadingLink('Z', '[2026-10-14 Wed] JW')).toBe('[[id:Z][2026-10-14 Wed JW]]');
});

test(':ID: se lee y se añade si falta', () => {
  const headers = parseOrg(A).get('headers');
  expect(headerOrgId(byTitle(headers, 'Proyecto web'))).toBe('AAA-1');
  const otra = byTitle(headers, 'Otra');
  expect(headerOrgId(otra)).toBe(null);
  const items = withOrgIdProperty(otra.get('propertyListItems'), 'NEW-1', 'p1');
  expect(headerOrgId(otra.set('propertyListItems', items))).toBe('NEW-1');
});

test('ids del subárbol y enlaces que apuntan a él', () => {
  const files = IMap({ '/a.org': file(A), '/b.org': file(B) });
  const headers = files.getIn(['/a.org', 'headers']);
  const proj = byTitle(headers, 'Proyecto web');
  const ids = subtreeOrgIds(headers, proj.get('id'));
  expect(Array.from(ids.keys())).toEqual(['AAA-1', 'BBB-2']);
  const { refs, path } = incomingIdLinks(files, headers, proj.get('id'));
  expect(path).toBe('/a.org');
  expect(refs.map((r) => r.title)).toEqual(['Notas', 'Ver web hoy', 'Tarea']);
  expect(refs[2].props).toEqual(['PROYECTO']);
  expect(referencesMessage(refs)).toMatch(/b\.org:[\s\S]*Notas[\s\S]*cargados/);
  // borrar solo la subcabecera: solo cuenta el enlace a BBB-2
  const sub = byTitle(headers, 'Diseño');
  expect(incomingIdLinks(files, headers, sub.get('id')).refs.map((r) => r.title)).toEqual([
    'Notas',
  ]);
  // sin :ID:, nada
  expect(incomingIdLinks(files, headers, byTitle(headers, 'Otra').get('id')).refs).toEqual([]);
});

test('los enlaces dentro del subárbol borrado no cuentan', () => {
  const text = `* Madre
:PROPERTIES:
:ID: M-1
:END:
** Hija con [[id:M-1][madre]]
`;
  const files = IMap({ '/c.org': file(text) });
  const headers = files.getIn(['/c.org', 'headers']);
  const refs = idLinkReferences(files, subtreeOrgIds(headers, headers.first().get('id')), {
    path: '/c.org',
    headerIds: new Set(headers.map((h) => h.get('id')).toArray()),
  });
  expect(refs).toEqual([]);
});

test('enlaces como texto', () => {
  const ids = new Map([
    ['AAA-1', 'Proyecto web'],
    ['BBB-2', 'Diseño'],
  ]);
  expect(idLinksToText('Mira [[id:AAA-1][la web]] y [[id:BBB-2]].', ids)).toBe(
    'Mira la web y Diseño.'
  );
  expect(idLinksToText('Otro [[id:CCC][x]] y [[file:a.org::*B][B]]', ids)).toBe(
    'Otro [[id:CCC][x]] y [[file:a.org::*B][B]]'
  );
  const tarea = byTitle(parseOrg(B).get('headers'), 'Tarea');
  expect(isOnlyIdLink(tarea.getIn(['propertyListItems', 0]), ids)).toBe(true);
  expect(isOnlyIdLink(tarea.getIn(['propertyListItems', 0]), new Map([['ZZZ', '']]))).toBe(false);
});
