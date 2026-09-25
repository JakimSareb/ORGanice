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
