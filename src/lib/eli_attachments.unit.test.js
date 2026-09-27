import { Map } from 'immutable';
import { parseOrg } from './parse_org';
import {
  fileTargetsInText,
  attachmentsOfSubtree,
  attachmentCount,
  otherReferences,
} from './eli_attachments';
import { removeHeaderMessage } from './eli_confirm_remove';

const file = parseOrg(
  [
    '* Viaje',
    '[[file:assets/2026/billete.pdf][billete]] y [[file:assets/2026/foto.jpg]]',
    '** Hotel',
    'Reserva: file:assets/2026/hotel.pdf',
    '[[https://example.com/a.pdf]] [[file:otro.org]] [[file:~/doc.pdf]]',
    '* Otra',
    '[[file:assets/2026/foto.jpg]]',
    '',
  ].join('\n')
);
const headers = file.get('headers');
const viaje = headers.get(0).get('id');
const hotel = headers.get(1).get('id');

test('enlaces a ficheros de un texto', () => {
  expect(
    fileTargetsInText('[[file:a/b.png][x]] file:c.pdf [[http://x.com/y.pdf]] [[./d.txt]]')
  ).toEqual(['a/b.png', './d.txt', 'c.pdf']);
  expect(fileTargetsInText('')).toEqual([]);
});

test('adjuntos del subárbol, resueltos junto al fichero', () => {
  expect(attachmentsOfSubtree(headers, viaje, '/Notas/gtd.org').map((a) => a.path)).toEqual([
    '/Notas/assets/2026/billete.pdf',
    '/Notas/assets/2026/foto.jpg',
    '/Notas/assets/2026/hotel.pdf',
  ]);
  expect(attachmentsOfSubtree(headers, hotel, '/gtd.org').map((a) => a.path)).toEqual([
    '/assets/2026/hotel.pdf',
  ]);
  expect(attachmentCount(headers, viaje)).toBe(3);
  expect(removeHeaderMessage(headers, viaje)).toMatch(/Tiene 3 adjuntos/);
  expect(removeHeaderMessage(headers, hotel)).toMatch(/Tiene 1 adjunto:/);
  expect(removeHeaderMessage(headers, headers.get(2).get('id'))).toMatch(/Tiene 1 adjunto/);
});

test('otros sitios que usan el mismo adjunto', () => {
  const files = Map({
    '/Notas/gtd.org': file,
    '/Notas/sub/x.org': parseOrg('* A\n[[file:../assets/2026/billete.pdf]]\n'),
  });
  const excluded = new Set([viaje, hotel]);
  expect(
    otherReferences(files, '/Notas/assets/2026/foto.jpg', '/Notas/gtd.org', excluded)
  ).toEqual(['/Notas/gtd.org']);
  expect(
    otherReferences(files, '/Notas/assets/2026/billete.pdf', '/Notas/gtd.org', excluded)
  ).toEqual(['/Notas/sub/x.org']);
  expect(
    otherReferences(files, '/Notas/assets/2026/hotel.pdf', '/Notas/gtd.org', excluded)
  ).toEqual([]);
});

// 2.11: indicador y revisión de adjuntos de tareas terminadas o archivadas
describe('adjuntos de tareas terminadas', () => {
  const {
    attachmentCountOfHeader,
    entriesWithAttachmentsInText,
    findFinishedAttachments,
    referencedOutside,
    removeLinksToTarget,
  } = require('./eli_attachments');
  const tasks = parseOrg(
    [
      '#+TODO: TODO | DONE CANCELLED',
      '* DONE Hecha :casa:',
      '[[file:assets/2026/a.pdf][factura]]',
      '* CANCELLED Cancelada',
      'file:assets/2026/b.jpg',
      '* TODO Abierta',
      '[[file:assets/2026/c.pdf]] [[file:assets/2026/a.pdf]]',
      '* DONE Sin adjuntos',
      '',
    ].join('\n')
  );
  const files = Map({ '/p/tareas.org': tasks });
  const isDone = (p, k) => k === 'DONE' || k === 'CANCELLED';

  test('nº de adjuntos de un encabezado', () => {
    const hs = tasks.get('headers');
    expect(hs.map(attachmentCountOfHeader).toArray()).toEqual([1, 1, 2, 0]);
  });

  test('encabezados con adjuntos en un fichero de archivo', () => {
    const text = [
      '* DONE Vieja :x:',
      ':PROPERTIES:',
      ':ARCHIVE_TIME: 2026-01-01 Thu 10:00',
      ':END:',
      '[[file:../assets/2025/v.png]]',
      '** Sub sin nada',
      '* [[https://x.com][Web]] con file:assets/w.pdf',
    ].join('\n');
    expect(entriesWithAttachmentsInText(text)).toEqual([
      { title: 'Vieja', keyword: 'DONE', line: 0, targets: ['../assets/2025/v.png'] },
      { title: 'Web con file:assets/w.pdf', keyword: null, line: 6, targets: ['assets/w.pdf'] },
    ]);
  });

  test('busca terminadas, canceladas y archivadas', () => {
    const groups = findFinishedAttachments({
      files,
      isDone,
      archives: [{ path: '/p/archive/tareas.org_archive', text: '* DONE X\n[[file:../z.pdf]]' }],
      existing: new Set(['/p/assets/2026/a.pdf', '/p/z.pdf']),
    });
    expect(
      groups.map((g) => [g.kind, g.title, g.attachments.map((a) => [a.path, a.missing])])
    ).toEqual([
      ['done', 'Hecha', [['/p/assets/2026/a.pdf', false]]],
      ['cancelled', 'Cancelada', [['/p/assets/2026/b.jpg', true]]],
      ['archived', 'X', [['/p/z.pdf', false]]],
    ]);
    const keys = new Set(groups.map((g) => g.key));
    // a.pdf también lo enlaza la tarea abierta; b.jpg no
    expect(referencedOutside(files, '/p/assets/2026/a.pdf', keys)).toBe(true);
    expect(referencedOutside(files, '/p/assets/2026/b.jpg', keys)).toBe(false);
  });

  test('quitar enlaces sin tocar los títulos', () => {
    expect(
      removeLinksToTarget('* Ver [[file:a.pdf]]\n[[file:a.pdf]]\ntexto', 'a.pdf', {
        skipHeadings: true,
      })
    ).toBe('* Ver [[file:a.pdf]]\ntexto');
  });
});
