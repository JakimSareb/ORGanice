import {
  normalizeLayout,
  moveEntry,
  toggleHidden,
  applyMenuLayout,
  clampMargin,
  getDocMargin,
  setDocMargin,
  DOC_MARGIN_DEFAULT,
} from './eli_menu_layout';
import {
  parseExcludedFolders,
  serializeExcludedFolders,
  isInExcludedFolder,
  withoutExcluded,
  foldersOfPaths,
} from './eli_excluded_folders';

describe('4.12 Menú ☰', () => {
  test('normalizeLayout completa y limpia', () => {
    const l = normalizeLayout({ order: ['help', 'x', 'help'], hidden: ['agenda', 'zz'] });
    // (4.17) «Buscar (B)», nueva, va la primera (no tiene ninguna delante)
    expect(l.order[0]).toBe('find');
    expect(l.order).toHaveLength(15); // (4.46) + «zk» y «fugaz»
    expect(l.hidden).toEqual(['agenda']);
  });

  test('mover y ocultar', () => {
    let l = normalizeLayout(null);
    l = moveEntry(l, 'agenda', -1);
    expect(l.order.slice(0, 2)).toEqual(['agenda', 'find']);
    expect(moveEntry(l, 'agenda', -1).order[0]).toBe('agenda');
    l = toggleHidden(l, 'search');
    expect(l.hidden).toEqual(['search']);
    expect(toggleHidden(l, 'search').hidden).toEqual([]);
  });

  test('applyMenuLayout ordena, oculta y deja lo demás al final', () => {
    const items = [
      { menuId: 'search' },
      { menuId: 'files' },
      { menuId: 'help' },
      { testId: 'settings' },
    ];
    const out = applyMenuLayout(items, {
      order: ['help', 'files', 'search'],
      hidden: ['files'],
    });
    expect(out.map((i) => i.menuId || i.testId)).toEqual(['help', 'search', 'settings']);
  });

  test('margen', () => {
    expect(clampMargin('x')).toBe(DOC_MARGIN_DEFAULT);
    expect(clampMargin(-3)).toBe(0);
    expect(clampMargin(999)).toBe(60);
    expect(getDocMargin()).toBe(14);
    setDocMargin(22);
    expect(getDocMargin()).toBe(22);
    expect(document.documentElement.style.getPropertyValue('--eli-doc-margin')).toBe('22px');
  });
});

describe('4.12 carpetas excluidas', () => {
  const paths = ['/a.org', '/Archivo/b.org', '/Archivo/viejo/c.org', '/Archivos/d.org'];
  test('parse/serialize', () => {
    expect(parseExcludedFolders(' Archivo/ \n/archivo\n\n/x')).toEqual(['/Archivo', '/x']);
    expect(serializeExcludedFolders(['/x', 'y/'])).toBe('/x\n/y');
  });
  test('excluye la carpeta y su contenido, no las de nombre parecido', () => {
    expect(isInExcludedFolder('/archivo/viejo/c.org', ['/Archivo'])).toBe(true);
    expect(withoutExcluded(paths, ['/Archivo'])).toEqual(['/a.org', '/Archivos/d.org']);
    expect(withoutExcluded(paths, [])).toEqual(paths);
  });
  test('foldersOfPaths', () => {
    expect(foldersOfPaths(paths)).toEqual(['/Archivo', '/Archivo/viejo', '/Archivos']);
  });
});
