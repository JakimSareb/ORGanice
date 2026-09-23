import {
  fileLinkTarget,
  resolveDropboxPath,
  mediaKind,
  relativeLinkFor,
  assetsDirFor,
  sanitizeFileName,
} from './eli_media';
import { parseMarkupAndCookies } from './parse_org';

test('detecta enlaces a ficheros multimedia', () => {
  expect(fileLinkTarget('file:Assets/2026/foto.jpg')).toBe('Assets/2026/foto.jpg');
  expect(fileLinkTarget('./Assets/2026/foto.png')).toBe('./Assets/2026/foto.png');
  expect(fileLinkTarget('Assets/2026/v.mp4')).toBe('Assets/2026/v.mp4');
  expect(fileLinkTarget('file:../doc.pdf::3')).toBe('../doc.pdf');
  expect(fileLinkTarget('file:/Notas/Assets/2026/a.jpg')).toBe('/Notas/Assets/2026/a.jpg');
  expect(fileLinkTarget('file:otro.org')).toBe(null);
  expect(fileLinkTarget('file:carpeta')).toBe(null);
  expect(fileLinkTarget('https://example.com/a.jpg')).toBe(null);
  expect(fileLinkTarget('file:~/x.png')).toBe(null);
  expect(fileLinkTarget('id:1234')).toBe(null);
});

test('resuelve rutas respecto al fichero .org', () => {
  expect(resolveDropboxPath('/Notas/gtd.org', 'Assets/2026/a.jpg')).toBe('/Notas/Assets/2026/a.jpg');
  expect(resolveDropboxPath('/Notas/sub/gtd.org', '../Assets/a.jpg')).toBe('/Notas/Assets/a.jpg');
  expect(resolveDropboxPath('/gtd.org', './Assets/a.jpg')).toBe('/Assets/a.jpg');
  expect(resolveDropboxPath('/gtd.org', '../../a.jpg')).toBe(null);
  expect(resolveDropboxPath('/Notas/gtd.org', '/Otra/a.jpg')).toBe('/Otra/a.jpg');
});

test('tipos, nombres y rutas de subida', () => {
  expect(mediaKind('a.HEIC')).toBe('image');
  expect(mediaKind('a.mov')).toBe('video');
  expect(mediaKind('a.m4a')).toBe('audio');
  expect(mediaKind('a.pdf')).toBe('file');
  expect(sanitizeFileName('Mi foto [1].jpg')).toBe('Mi_foto__1_.jpg');
  expect(assetsDirFor('/Notas/gtd.org', new Date(2026, 8, 23))).toBe('/Notas/Assets/2026');
  expect(relativeLinkFor('/Notas/gtd.org', '/notas/Assets/2026/a (1).jpg')).toBe('Assets/2026/a (1).jpg');
});

test('el parser de organice produce enlaces con uri y título', () => {
  const parts = parseMarkupAndCookies('ver [[file:Assets/2026/a.jpg]] y [[./Assets/2026/b.png][Plano]]');
  const links = parts.filter((p) => p.type === 'link').map((p) => p.contents);
  expect(links[0].uri).toBe('file:Assets/2026/a.jpg');
  expect(links[1].uri).toBe('./Assets/2026/b.png');
  expect(links[1].title).toBe('Plano');
});
