// 4.54 Documentos II: copiar/pegar cabeceras, exportar HTML, selector de carpeta, fuentes
import thunk from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { Map, Set, fromJS, List } from 'immutable';

import rootReducer from '../reducers';
import { parseFile, setPath, eliPasteHeaders } from '../actions/org';
import { exportOrg } from './export_org';
import {
  withFreshIds,
  headerSubtreeText,
  parseHeadersText,
  adaptLevels,
  startsWithHeading,
  looksLikeList,
  isOrgClipboard,
  createClipboardHandlers,
  selectionClipboardText,
} from './eli_header_clipboard';
import {
  cleanForExport,
  buildExportHtml,
  exportFileName,
  inlineImages,
  htmlFromDocElement,
} from './eli_export_html';
import { normalizeDir, parentDir, joinDir, foldersOf } from './eli_folder_picker';
import { cleanFontName, fontFamilyCss } from './eli_font';
import { uploadAssets } from './eli_media';

const makeStore = (path, text) => {
  const store = createStore(
    rootReducer,
    {
      org: {
        past: [],
        present: Map({
          files: Map(),
          fileSettings: [],
          search: Map({ searchFilter: '', searchFilterExpr: [] }),
          bookmarks: Map({ search: List(), 'task-list': List(), refile: List() }),
        }),
        future: [],
      },
      syncBackend: Map({ isAuthenticated: true }),
      capture: Map().set('captureTemplates', []),
      base: new fromJS({ customKeybindings: {}, isLoading: Set(), shouldLogIntoDrawer: true }),
    },
    applyMiddleware(thunk)
  );
  store.dispatch(parseFile(path, text));
  store.dispatch(setPath(path));
  return store;
};
const fileOf = (store, path) => store.getState().org.present.getIn(['files', path]);
const textOf = (store, path) =>
  exportOrg({
    headers: fileOf(store, path).get('headers'),
    linesBeforeHeadings: fileOf(store, path).get('linesBeforeHeadings'),
    dontIndent: true,
  });

const SAMPLE = `* Proyecto
:PROPERTIES:
:ID: AAAA-1
:END:
Notas del proyecto
** Subtarea uno
:PROPERTIES:
:ID: BBBB-2
:END:
*** Detalle
** Subtarea dos
* Otra
`;

describe('4.54 copiar y pegar cabeceras', () => {
  test('withFreshIds cambia solo los :ID: y deja el resto igual', () => {
    let n = 0;
    const out = withFreshIds(SAMPLE, () => `NEW-${++n}`);
    expect(out).toContain(':ID: NEW-1');
    expect(out).toContain(':ID: NEW-2');
    expect(out).not.toContain('AAAA-1');
    expect(out.replace(/NEW-\d/g, 'X')).toBe(SAMPLE.replace(/AAAA-1|BBBB-2/g, 'X'));
  });

  test('headerSubtreeText copia la cabecera con todas sus subcabeceras (y nada más)', () => {
    const store = makeStore('/a.org', SAMPLE);
    const headers = fileOf(store, '/a.org').get('headers');
    const text = headerSubtreeText(headers, headers.first().get('id'), { dontIndent: true });
    expect(text.startsWith('* Proyecto\n')).toBe(true);
    expect(text).toContain('*** Detalle');
    expect(text).toContain('** Subtarea dos');
    expect(text).not.toContain('* Otra');
  });

  test('adaptLevels: la primera pasa al nivel pedido y el resto conserva la diferencia', () => {
    const parsed = parseHeadersText('** A\n*** B\n** C\n', List());
    const adapted = adaptLevels(parsed, 4);
    expect(adapted.map((h) => h.get('nestingLevel')).toArray()).toEqual([4, 5, 4]);
  });

  test('pegar como subcabecera: niveles adaptados, al final de las subcabeceras, resto igual', () => {
    const store = makeStore('/a.org', SAMPLE);
    const headers = fileOf(store, '/a.org').get('headers');
    const target = headers.get(1); // «Subtarea uno» (nivel 2, con un hijo)
    const parsed = parseHeadersText(
      '* Pegada\nuna nota\n** Hija\n',
      fileOf(store, '/a.org').get('todoKeywordSets')
    );
    store.dispatch(eliPasteHeaders(target.get('id'), parsed));
    const out = textOf(store, '/a.org');
    expect(out).toContain('*** Detalle\n*** Pegada\nuna nota\n**** Hija\n** Subtarea dos');
    // lo de antes del pegado y lo de después, byte a byte
    expect(out.startsWith(SAMPLE.split('*** Detalle')[0])).toBe(true);
    expect(out.endsWith('** Subtarea dos\n* Otra\n')).toBe(true);
  });

  test('pegar reconoce las palabras TODO del fichero', () => {
    const store = makeStore('/a.org', '#+TODO: NEXT | DONE\n* Base\n');
    const f = fileOf(store, '/a.org');
    const parsed = parseHeadersText('* NEXT Algo\n', f.get('todoKeywordSets'));
    expect(parsed.first().getIn(['titleLine', 'todoKeyword'])).toBe('NEXT');
  });

  test('qué cuenta como texto Org en el portapapeles', () => {
    expect(startsWithHeading('* Hola\n')).toBe(true);
    expect(startsWithHeading('\n** Hola')).toBe(true);
    expect(startsWithHeading('hola * mundo')).toBe(false);
    expect(looksLikeList('- uno\n- dos')).toBe(true);
    expect(looksLikeList('1. uno')).toBe(true);
    expect(isOrgClipboard('texto normal')).toBe(false);
    expect(isOrgClipboard('- item')).toBe(true);
  });

  test('sección: copia el elemento de lista con sus subelementos', () => {
    const store = makeStore('/a.org', '* Cab\n- uno\n  - uno.a\n- dos\n');
    const headers = fileOf(store, '/a.org').get('headers');
    const list = headers.getIn([0, 'description', 0]);
    const item = list.getIn(['items', 0]);
    const res = selectionClipboardText(headers, { listItemId: item.get('id') }, { fresh: true });
    expect(res.kind).toBe('section');
    expect(res.text).toContain('- uno');
    expect(res.text).toContain('- uno.a');
    expect(res.text).not.toContain('- dos');
  });

  const fakeEvent = (text = '') => {
    const data = { v: text };
    return {
      target: document.body,
      clipboardData: {
        setData: (_t, v) => (data.v = v),
        getData: () => data.v,
      },
      preventDefault: jest.fn(),
      data,
    };
  };
  const makeApi = (store, extra = {}) => ({
    canAct: () => true,
    getSelection: () => ({ headerId: fileOf(store, '/a.org').get('headers').first().get('id') }),
    getHeaders: () => fileOf(store, '/a.org').get('headers'),
    isLocked: () => false,
    removeHeader: jest.fn(),
    pasteHeaders: jest.fn(),
    pasteList: jest.fn(),
    notify: jest.fn(),
    ...extra,
  });

  test('copiar: texto Org al portapapeles con IDs NUEVOS; cortar: IDs iguales y se quita', () => {
    const store = makeStore('/a.org', SAMPLE);
    const api = makeApi(store);
    const h = createClipboardHandlers(api);
    const copy = fakeEvent();
    h.copy(copy);
    expect(copy.preventDefault).toHaveBeenCalled();
    expect(copy.data.v).toContain('* Proyecto');
    expect(copy.data.v).not.toContain('AAAA-1');
    expect(copy.data.v).toMatch(/:ID: \S+/);
    expect(api.removeHeader).not.toHaveBeenCalled();

    const cut = fakeEvent();
    h.cut(cut);
    expect(cut.data.v).toContain(':ID: AAAA-1');
    expect(cut.data.v).toContain(':ID: BBBB-2');
    expect(api.removeHeader).toHaveBeenCalledTimes(1);
  });

  test('pegar: Org = subcabecera; lista = notas; texto normal = no se toca', () => {
    const store = makeStore('/a.org', SAMPLE);
    const api = makeApi(store);
    const h = createClipboardHandlers(api);
    const a = fakeEvent('* Nueva\n');
    h.paste(a);
    expect(api.pasteHeaders).toHaveBeenCalledWith(expect.anything(), '* Nueva\n');
    expect(a.preventDefault).toHaveBeenCalled();
    const b = fakeEvent('- uno\n- dos');
    h.paste(b);
    expect(api.pasteList).toHaveBeenCalled();
    const c = fakeEvent('hola mundo');
    h.paste(c);
    expect(c.preventDefault).not.toHaveBeenCalled();
  });

  test('con el candado puesto no se corta ni se pega; con ventanas abiertas no actúa', () => {
    const store = makeStore('/a.org', SAMPLE);
    const locked = makeApi(store, { isLocked: () => true });
    const hl = createClipboardHandlers(locked);
    hl.cut(fakeEvent());
    hl.paste(fakeEvent('* X\n'));
    expect(locked.removeHeader).not.toHaveBeenCalled();
    expect(locked.pasteHeaders).not.toHaveBeenCalled();
    const busy = makeApi(store, { canAct: () => false });
    const ev = fakeEvent();
    createClipboardHandlers(busy).copy(ev);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });
});

describe('4.54 exportar a HTML', () => {
  const doc = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  };

  test('limpia barras, reproductores y enlaces internos; conserva los externos', () => {
    const d = doc(
      '<div class="eli-no-print">barra</div><h1 class="eli-print__heading">Título</h1>' +
        '<a href="/file/x.org">interno</a> <a href="https://a.com" class="x">externo</a>' +
        '<video class="eli-media__player"></video>'
    );
    cleanForExport(d);
    expect(d.innerHTML).not.toContain('barra');
    expect(d.innerHTML).not.toContain('video');
    expect(d.innerHTML).toContain('interno');
    expect(d.innerHTML).not.toContain('/file/x.org');
    expect(d.querySelector('a').getAttribute('href')).toBe('https://a.com');
  });

  test('las casillas pasan a ☐ ☑ ▣', () => {
    const d = doc(
      '<div class="checkbox"><i class="fas fa-check"></i></div>' +
        '<div class="checkbox"><i class="fas fa-square"></i></div>' +
        '<div class="checkbox"><i class="fas fa-minus"></i></div>'
    );
    cleanForExport(d);
    expect(d.textContent).toBe('☑☐▣');
  });

  test('buildExportHtml es un documento completo con su CSS y el título escapado', () => {
    const html = buildExportHtml({
      title: 'A <b> & "c"',
      bodyHtml: '<table><tr><td>1</td></tr></table>',
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(html).toContain('<table>');
    expect(html).not.toMatch(/<link [^>]*stylesheet/);
  });

  test('nombre de fichero sin caracteres prohibidos', () => {
    expect(exportFileName('Plan: 2026/Q1?')).toBe('Plan- 2026-Q1-.html');
    expect(exportFileName('')).toBe('documento.html');
  });

  test('las fotos blob: se incrustan como data:', async () => {
    const d = doc('<img src="blob:http://x/1"><img src="https://a.com/i.png">');
    const fakeFetch = async () => ({ blob: async () => new Blob(['abc'], { type: 'image/png' }) });
    await inlineImages(d, fakeFetch);
    const srcs = Array.from(d.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(srcs[0]).toMatch(/^data:image\/png;base64,/);
    expect(srcs[1]).toBe('https://a.com/i.png');
  });

  test('htmlFromDocElement no toca el original', async () => {
    const d = doc('<div class="eli-no-print">x</div><p>hola</p>');
    const html = await htmlFromDocElement(d, 'T');
    expect(html).toContain('<p>hola</p>');
    expect(html).not.toContain('eli-no-print');
    expect(d.innerHTML).toContain('eli-no-print');
  });
});

describe('4.54 carpeta de los adjuntos', () => {
  test('rutas', () => {
    expect(normalizeDir('Notas//fotos/')).toBe('/Notas/fotos');
    expect(normalizeDir('/')).toBe('');
    expect(parentDir('/Notas/fotos')).toBe('/Notas');
    expect(parentDir('/Notas')).toBe('');
    expect(joinDir('/Notas', 'a/b')).toBe('/Notas/a_b');
    expect(joinDir('', 'Nueva')).toBe('/Nueva');
  });

  test('foldersOf solo carpetas, ordenadas', () => {
    const listing = fromJS([
      { name: 'b', path: '/b', isDirectory: true },
      { name: 'x.org', path: '/x.org', isDirectory: false },
      { name: 'A', path: '/A', isDirectory: true },
    ]);
    expect(foldersOf(listing).map((f) => f.name)).toEqual(['A', 'b']);
  });

  test('uploadAssets: carpeta elegida o assets/AAAA junto al .org', async () => {
    const uploaded = [];
    const client = {
      uploadBinaryFile: async (path) => {
        uploaded.push(path);
        return path;
      },
    };
    const file = { name: 'foto 1.jpg' };
    const l1 = await uploadAssets(client, '/Notas/a.org', [file]);
    expect(uploaded[0]).toBe(`/Notas/assets/${new Date().getFullYear()}/foto_1.jpg`);
    expect(l1[0]).toBe(`[[file:assets/${new Date().getFullYear()}/foto_1.jpg]]`);
    const l2 = await uploadAssets(client, '/Notas/a.org', [file], '/Fotos/2026');
    expect(uploaded[1]).toBe('/Fotos/2026/foto_1.jpg');
    expect(l2[0]).toBe('[[file:/Fotos/2026/foto_1.jpg]]');
    await uploadAssets(client, '/Notas/a.org', [file], '');
    expect(uploaded[2]).toBe('/foto_1.jpg');
  });
});

describe('4.54 fuentes y tamaño de letra por dispositivo', () => {
  test('el nombre de la fuente se limpia (no rompe el CSS)', () => {
    expect(cleanFontName('Palatino')).toBe('Palatino');
    expect(cleanFontName('Foo"; } body{display:none} /*')).toBe('Foo bodydisplaynone');
    expect(fontFamilyCss('')).toBe('');
    expect(fontFamilyCss('Avenir Next')).toBe(
      `"Avenir Next", -apple-system, 'Helvetica Neue', Arial, sans-serif`
    );
  });

  test('el tamaño de letra NO va en el fichero de ajustes ni se toma de él', () => {
    // eslint-disable-next-line global-require
    const { persistableFields } = require('../util/settings_persister');
    const f = persistableFields.find((x) => x.name === 'fontSize');
    expect(f.local).toBe(true);
    const { isSyncedKey } = require('./eli_synced_prefs');
    expect(isSyncedKey('fontSize')).toBe(false);
  });
});
