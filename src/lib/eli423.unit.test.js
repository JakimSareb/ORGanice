// 4.23: excluir ficheros sueltos, ruta del bloc de notas y Menú con «Bloc de notas rápido»
import {
  parseExcludedFolders,
  isFileEntry,
  isExcludedFile,
  isInExcludedFolder,
  isExcluded,
  withoutExcluded,
} from './eli_excluded_folders';
import { scratchPath, scratchPathNear } from './eli_scratch';
import { normalizeLayout, MENU_ENTRIES } from './eli_menu_layout';

describe('4.23 ficheros excluidos', () => {
  const paths = ['/a.org', '/Archivo/b.org', '/Archivo/viejo/c.org', '/x/Notas.org', '/x/otra.org'];

  test('distingue entradas de fichero y de carpeta', () => {
    expect(isFileEntry('/x/notas.org')).toBe(true);
    expect(isFileEntry('/x/notas.ORG')).toBe(true);
    expect(isFileEntry('/Archivo')).toBe(false);
    expect(parseExcludedFolders('x/notas.org\n/Archivo/')).toEqual(['/x/notas.org', '/Archivo']);
  });

  test('un fichero excluido deja fuera solo ese fichero (sin mayúsculas)', () => {
    const list = ['/x/notas.org'];
    expect(isExcludedFile('/x/Notas.org', list)).toBe(true);
    expect(isExcludedFile('/x/otra.org', list)).toBe(false);
    expect(withoutExcluded(paths, list)).toEqual([
      '/a.org',
      '/Archivo/b.org',
      '/Archivo/viejo/c.org',
      '/x/otra.org',
    ]);
  });

  test('una entrada de fichero no se toma como carpeta', () => {
    expect(isInExcludedFolder('/x/notas.org/otro.org', ['/x/notas.org'])).toBe(false);
  });

  test('carpetas y ficheros a la vez', () => {
    const list = ['/Archivo', '/x/notas.org'];
    expect(isExcluded('/Archivo/viejo/c.org', list)).toBe(true);
    expect(withoutExcluded(paths, list)).toEqual(['/a.org', '/x/otra.org']);
    expect(withoutExcluded(paths, [])).toEqual(paths);
  });
});

describe('4.23 bloc de notas rápido', () => {
  test('scratch.org junto al inbox elegido', () => {
    expect(scratchPath('/Dropbox/org/inbox.org', [])).toBe('/Dropbox/org/scratch.org');
  });
  test('sin elegido: junto al inbox.org cargado de ruta más corta', () => {
    expect(scratchPath(null, ['/a/b/inbox.org', '/z/inbox.org', '/tasks.org'])).toBe(
      '/z/scratch.org'
    );
  });
  test('sin inbox: en la raíz', () => {
    expect(scratchPath(null, ['/tasks.org'])).toBe('/scratch.org');
    expect(scratchPathNear('')).toBe('/scratch.org');
  });
});

describe('4.23 Menú ☰', () => {
  test('«scratch» es una entrada ocultable, detrás de «clocks»', () => {
    const ids = MENU_ENTRIES.map((e) => e.id);
    expect(ids.indexOf('scratch')).toBe(ids.indexOf('clocks') + 1);
    const l = normalizeLayout({ order: ['help', 'clocks'], hidden: ['scratch'] });
    expect(l.order.indexOf('scratch')).toBe(l.order.indexOf('clocks') + 1);
    expect(l.hidden).toEqual(['scratch']);
  });
});
