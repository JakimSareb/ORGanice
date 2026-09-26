import { parseOrg } from './parse_org';
import {
  cleanHeadingText,
  relativePath,
  headingLink,
  storeHeadingLink,
  parseOrgLink,
  findLinkedHeader,
  resolveLinkedPath,
} from './eli_org_links';

test('texto del encabezado como en Emacs', () => {
  expect(cleanHeadingText('[#A] Comprar pan [1/3]')).toBe('Comprar pan');
  expect(cleanHeadingText('Proyecto  web [50%]')).toBe('Proyecto web');
});

test('rutas relativas y enlaces', () => {
  expect(relativePath('/org/a.org', '/org/b.org')).toBe('b.org');
  expect(relativePath('/org/a.org', '/org/sub/b.org')).toBe('sub/b.org');
  expect(relativePath('/org/sub/a.org', '/org/b.org')).toBe('../b.org');
  expect(relativePath('/a.org', '/b.org')).toBe('b.org');
  expect(headingLink({ path: '/org/b.org', title: 'Hola' }, '/org/sub/a.org')).toBe(
    '[[file:../b.org::*Hola][Hola]]'
  );
  expect(headingLink({ path: '/org/b.org', title: 'Hola' }, '/org/b.org')).toBe('[[*Hola][Hola]]');
  expect(storeHeadingLink('/org/tareas.org', '[#A] Llamar [0/2]')).toBe(
    '[[file:tareas.org::*Llamar][Llamar]]'
  );
});

test('reconocer enlaces Org', () => {
  expect(parseOrgLink('file:tareas.org::*Llamar')).toEqual({
    path: 'tareas.org',
    search: '*Llamar',
    id: null,
  });
  expect(parseOrgLink('file:~/Dropbox/org/tareas.org')).toEqual({
    path: '~/Dropbox/org/tareas.org',
    search: null,
    id: null,
  });
  expect(parseOrgLink('*Otro encabezado')).toEqual({
    path: null,
    search: '*Otro encabezado',
    id: null,
  });
  expect(parseOrgLink('id:abc-123').id).toBe('abc-123');
  expect(parseOrgLink('https://orgmode.org')).toBe(null);
  expect(parseOrgLink('file:foto.jpg')).toBe(null);
});

test('buscar el encabezado enlazado', () => {
  const headers = parseOrg(
    [
      '#+TODO: TODO | DONE',
      '* TODO [#A] Llamar al banco [1/2]',
      '* Notas',
      ':PROPERTIES:',
      ':CUSTOM_ID: notas',
      ':END:',
      '* Llamar al banco otra vez',
      '',
    ].join('\n')
  ).get('headers');
  const t = (h) => h && h.getIn(['titleLine', 'rawTitle']).trim();
  expect(t(findLinkedHeader(headers, '*Llamar al banco'))).toBe('[#A] Llamar al banco [1/2]');
  expect(t(findLinkedHeader(headers, '#notas'))).toBe('Notas');
  expect(findLinkedHeader(headers, '*No existe')).toBe(null);
});

test('rutas de Emacs fuera de la app', () => {
  const known = ['/tareas.org', '/org/inbox.org', '/proyectos/web.org'];
  expect(resolveLinkedPath('/org/inbox.org', '~/Dropbox/tareas.org', known)).toBe('/tareas.org');
  expect(resolveLinkedPath('/tareas.org', 'proyectos/web.org', known)).toBe('/proyectos/web.org');
  expect(resolveLinkedPath('/tareas.org', '/Users/jakim/Dropbox/proyectos/web.org', known)).toBe(
    '/proyectos/web.org'
  );
});
