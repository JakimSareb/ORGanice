import { parseOrg } from './parse_org';
import {
  archiveLocationFor,
  resolveArchiveLocation,
  buildArchivedSubtree,
  insertIntoArchiveText,
  newArchiveFileText,
  targetLevelFor,
} from './eli_archive';
import { getPriority, toggledPriorityATitle, titlePartsWithoutPriority } from './eli_priority';

const file = parseOrg(
  [
    '#+TODO: TODO NEXT | DONE',
    '* Proyectos :@casa:',
    '** DONE Pintar salón :pintura:',
    'CLOSED: [2026-09-20 Sun]',
    'Blanco roto.',
    '*** Comprar pintura',
    '** TODO Otra',
    '',
  ].join('\n')
);
const headers = file.get('headers');
const pintar = headers.get(1);

test('destino por defecto, #+ARCHIVE y cifrados', () => {
  expect(resolveArchiveLocation(archiveLocationFor(file, headers, 1), '/Notas/gtd.org')).toEqual({
    path: '/Notas/gtd.org_archive',
    heading: '',
  });
  expect(resolveArchiveLocation('%s_archive::', '/Notas/diario.org.gpg')).toEqual({
    path: '/Notas/diario.org_archive.gpg',
    heading: '',
  });
  expect(resolveArchiveLocation('archivo/%s_old::* Hecho', '/Notas/gtd.org')).toEqual({
    path: '/Notas/archivo/gtd.org_old',
    heading: '* Hecho',
  });
  const withLine = parseOrg('#+ARCHIVE: ../arch.org::* Viejo\n* A\n');
  expect(archiveLocationFor(withLine, withLine.get('headers'), 0)).toBe('../arch.org::* Viejo');
});

test('subárbol archivado como Emacs', () => {
  const text = buildArchivedSubtree({
    file,
    headers,
    headerId: pintar.get('id'),
    sourcePath: '/Notas/gtd.org',
    targetLevel: 1,
    now: new Date(2026, 8, 24, 10, 15),
  });
  expect(text.split('\n')[0]).toBe('* DONE Pintar salón :pintura:');
  expect(text).toContain(':ARCHIVE_TIME: 2026-09-24 Thu 10:15');
  expect(text).toContain(':ARCHIVE_FILE: /Notas/gtd.org');
  expect(text).toContain(':ARCHIVE_OLPATH: Proyectos');
  expect(text).toContain(':ARCHIVE_CATEGORY: gtd');
  expect(text).toContain(':ARCHIVE_TODO: DONE');
  expect(text).toContain(':ARCHIVE_ITAGS: @casa');
  expect(text).toMatch(/\n\*\* Comprar pintura/);
  expect(text).toContain('Blanco roto.');
  expect(text).not.toContain('Otra');
});

test('inserción en el fichero de archivo', () => {
  const sub = '** X\n';
  expect(insertIntoArchiveText(newArchiveFileText('/a.org'), '* X\n', '')).toBe(
    '#    -*- mode: org -*-\n\n\nArchived entries from file /a.org\n\n\n* X\n'
  );
  expect(insertIntoArchiveText('* Hecho\n** Y\n* Otro\n', sub, '* Hecho')).toBe(
    '* Hecho\n** Y\n** X\n* Otro\n'
  );
  expect(insertIntoArchiveText('* Otro\n', sub, '* Hecho')).toBe('* Otro\n* Hecho\n** X\n');
  expect(targetLevelFor('** Viejo')).toBe(3);
});

test('prioridad A', () => {
  const f = parseOrg('#+TODO: TODO | DONE\n* TODO Tarea :@casa:\n* TODO [#B] Otra\n* [#A] Ya\n');
  const [a, b, c] = f.get('headers').toArray();
  expect(getPriority(a)).toBe(null);
  expect(toggledPriorityATitle(a)).toBe('TODO [#A] Tarea :@casa:');
  expect(toggledPriorityATitle(b)).toBe('TODO [#A] Otra');
  expect(toggledPriorityATitle(c)).toBe('Ya');
  expect(titlePartsWithoutPriority(c.getIn(['titleLine', 'title'])).first().get('contents')).toBe('Ya');
});

test('estrella en el texto del editor de título', () => {
  const { titleTextHasPriorityA, toggledPriorityAText } = require('./eli_priority');
  const kw = ['TODO', 'NEXT', 'DONE'];
  expect(toggledPriorityAText('TODO Comprar pan :casa:', kw)).toBe('TODO [#A] Comprar pan :casa:');
  expect(toggledPriorityAText('TODO [#A] Comprar pan', kw)).toBe('TODO Comprar pan');
  expect(toggledPriorityAText('TODO [#B] Comprar', kw)).toBe('TODO [#A] Comprar');
  expect(toggledPriorityAText('Comprar pan', kw)).toBe('[#A] Comprar pan');
  expect(titleTextHasPriorityA('NEXT [#A] x', kw)).toBe(true);
  expect(titleTextHasPriorityA('[#A] x', kw)).toBe(true);
  expect(titleTextHasPriorityA('x [#A]', kw)).toBe(false);
});
