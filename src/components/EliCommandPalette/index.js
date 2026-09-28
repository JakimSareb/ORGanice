// ORG Mode para Eli: paleta de comandos (idea de OrbitalNote). Ctrl+Espacio o Ctrl+K / ⌘K (o «⋯ → Paleta de
// comandos» en el móvil) abre un cuadro de búsqueda con resultados mezclados: ficheros .org,
// encabezados y tareas de todos los ficheros cargados, listas y proyectos GTD, etiquetas y
// acciones de la app. Búsqueda tolerante (cmppnt → «Comprar pintura»); vacía = recientes.
// Prefijos opcionales: «>» acciones, «#» etiquetas, «/» ficheros.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { List, Map as IMap } from 'immutable';

import './stylesheet.css';

import { fuzzyScore, normalize } from '../../lib/eli_fuzzy';
import { calculateActionedKeybindings } from '../../lib/keybindings';
import { displayTitle, LISTS, EXTRA_LISTS } from '../../lib/gtd/gtd_model';
import { normalizeGtdSections, isSectionShown } from '../../lib/gtd/gtd_sections';
import { STATIC_FILE_PREFIX } from '../../lib/org_utils';
import {
  loadFileQuietly,
  setPath,
  selectHeaderAndOpenParents,
  eliNarrowAndExpand,
  sync,
  eliReviewFinishedAttachments,
  eliSetAllHeadersOpened,
} from '../../actions/org';
import { eliPrepareOffline } from '../../actions/eli_offline';
import { openCalendar } from '../EliCalendar';
import { openCalculator } from '../EliCalculator';
import {
  activatePopup,
  setTheme,
  setColorScheme,
  pushModalPage,
  restoreStaticFile,
  setLastViewedFile,
} from '../../actions/base';
import { openFavorites, openMoonPhases, openRawEditor, openPrintPreview } from '../EliTools';

const selectIsAuthenticated = (s) => s.syncBackend.get('isAuthenticated');
const MAX_RESULTS = 50;
const LS_RECENT = 'eliPaletteRecent';
const THEMES = ['Unicornio', 'Cuki', 'Solarized', 'One', 'Gruvbox', 'Smyck', 'Code'];
const SCHEMES = [
  ['OS', 'Sistema'],
  ['Light', 'Claro'],
  ['Dark', 'Oscuro'],
];

const readRecent = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(LS_RECENT));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
};
const writeRecent = (list) => {
  try {
    window.localStorage.setItem(LS_RECENT, JSON.stringify(list));
  } catch (e) {}
};

// Lista de ficheros .org de Dropbox/carpeta (se pide una vez cada 5 minutos)
let listCache = { at: 0, paths: [] };
const listAllOrgFiles = async (client) => {
  if (!client || !client.listOrgFiles) return [];
  if (Date.now() - listCache.at < 5 * 60 * 1000) return listCache.paths;
  try {
    const paths = await client.listOrgFiles();
    listCache = { at: Date.now(), paths: (paths || []).filter(Boolean) };
  } catch (e) {
    listCache = { at: Date.now(), paths: listCache.paths };
  }
  return listCache.paths;
};

const baseName = (p) => (p || '').split('/').pop();
const shortPath = (p) => (p || '').replace(/^\//, '');
const isRealPath = (p) => !!p && !p.startsWith(STATIC_FILE_PREFIX) && !p.startsWith('/__');

// ORG Mode para Eli: pedir algo a la vista GTD (si no está abierta, lo hace al abrirse)
const gtdCommand = (history, pathname, cmd) => {
  if (pathname === '/gtd') {
    window.dispatchEvent(new CustomEvent('eli:gtd', { detail: cmd }));
  } else {
    window.__eliGtdPending = cmd;
    history.push('/gtd');
  }
};

const KIND_LABEL = {
  action: 'Acción',
  file: 'Fichero',
  head: 'Encabezado',
  gtd: 'GTD',
  project: 'Proyecto',
  tag: 'Etiqueta',
};

export default function EliCommandPalette() {
  const dispatch = useDispatch();
  const store = useStore();
  const history = useHistory();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remoteFiles, setRemoteFiles] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const isAuthenticated = useSelector(selectIsAuthenticated);

  // Abrir: Ctrl+Espacio (o Ctrl+K / ⌘K) en cualquier sitio, o el evento «eli:palette» (menú ⋯)
  useEffect(() => {
    const onKey = (e) => {
      // 2.15: Ctrl+Espacio (principal). Ctrl+K / ⌘K siguen funcionando: en el Mac ⌃Espacio es el
      // atajo del sistema para cambiar el idioma del teclado si hay más de uno.
      const isCtrlSpace =
        e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar');
      const isCtrlK =
        (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key || '').toLowerCase() === 'k';
      if (isCtrlSpace || isCtrlK) {
        if (!isAuthenticated) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => isAuthenticated && setOpen(true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('eli:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('eli:palette', onOpen);
    };
  }, [isAuthenticated]);

  // ORG Mode para Eli (2.12): el foco va al cuadro de texto en cuanto se abre (sin esperar):
  // en el iPhone así se queda el teclado abierto (ver lib/eli_palette.js)
  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    try {
      inputRef.current.focus({ preventScroll: true });
    } catch (e) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    const client = store.getState().syncBackend.get('client');
    let alive = true;
    listAllOrgFiles(client).then((paths) => alive && setRemoteFiles(paths));
    return () => {
      alive = false;
    };
  }, [open, store]);

  // Todo lo que se puede buscar (se calcula al abrir la paleta)
  const index = useMemo(() => {
    if (!open) return [];
    const state = store.getState();
    const files = state.org.present.get('files');
    const currentPath = state.org.present.get('path');
    const pathname = location.pathname;
    const inGtd = pathname === '/gtd';
    const inFile = pathname.startsWith('/file/') && isRealPath(currentPath);
    const bindings = Object.fromEntries(
      calculateActionedKeybindings(state.base.get('customKeybindings') || IMap())
    );
    const key = (a) => bindings[a] || '';
    const templates = (state.capture.get('captureTemplates') || List()).toArray();
    const items = [];
    const add = (item) => items.push({ ...item, search: normalize(item.search || item.label) });

    // Acciones
    const act = (id, label, icon, run, shortcut = '', extra = '') =>
      add({
        rid: `a:${id}`,
        kind: 'action',
        label,
        icon,
        run,
        shortcut,
        search: `${label} ${extra}`,
      });
    act(
      'inbox-new',
      'Nueva tarea en Inbox',
      'fas fa-inbox',
      () => gtdCommand(history, pathname, { view: { id: 'inbox' }, focusAdd: true }),
      '',
      'añadir crear gtd'
    );
    templates
      .filter((t) => !!t.get('file'))
      .forEach((t) => {
        const file = t.get('file').startsWith('/') ? t.get('file') : `/${t.get('file')}`;
        act(
          `capture:${t.get('id')}`,
          `Capturar con «${t.get('description') || t.get('letter') || '?'}»`,
          'fas fa-plus',
          () => {
            const detail = {
              templateId: t.get('id'),
              templateDescription: t.get('description'),
            };
            if (inFile && currentPath === file) {
              dispatch(activatePopup('capture', detail));
            } else {
              window.__eliPendingCapture = { path: file, ...detail };
              goToFile(file);
            }
          },
          t.get('letter') ? `${key('openCapture')} ${t.get('letter')}` : key('openCapture'),
          'plantilla nueva'
        );
      });
    act(
      'agenda',
      'Abrir la agenda',
      'fas fa-calendar-alt',
      () =>
        inFile
          ? dispatch(activatePopup('agenda'))
          : gtdCommand(history, pathname, { agenda: true }),
      key('openAgenda')
    );
    if (inGtd) {
      act(
        'docs',
        'Ir a Documentos',
        'far fa-file-alt',
        () => window.dispatchEvent(new CustomEvent('eli:open-docs')),
        key('openGtd'),
        'hoja fichero modo'
      );
    } else {
      act(
        'gtd',
        'Ir a GTD',
        'fas fa-tasks',
        () => window.dispatchEvent(new CustomEvent('eli:open-gtd')),
        key('openGtd'),
        'vista gtd modo'
      );
    }
    act(
      'new-project',
      'Nuevo proyecto',
      'fas fa-project-diagram',
      () => gtdCommand(history, pathname, { newProject: true }),
      '',
      'crear gtd'
    );
    act(
      'sync',
      'Sincronizar',
      'fas fa-sync-alt',
      () => {
        if (inFile) dispatch(sync({ forceAction: 'manual' }));
        else if (inGtd) gtdCommand(history, pathname, { sync: true });
        else
          Array.from(files.keys())
            .filter(isRealPath)
            .forEach((p) => dispatch(sync({ path: p, shouldSuppressMessages: true })));
      },
      key('syncFile')
    );
    act(
      'archive-done',
      'Archivar tareas terminadas (Logbook)',
      'fas fa-archive',
      () => gtdCommand(history, pathname, { view: { id: 'logbook' } }),
      '',
      'hechas done'
    );
    act(
      'review-attachments',
      'Revisar adjuntos de tareas terminadas',
      'fas fa-paperclip',
      () => dispatch(eliReviewFinishedAttachments()),
      '',
      'archivos borrar archivadas canceladas done limpiar'
    );
    act(
      'calendar',
      'Calendario',
      'far fa-calendar-alt',
      () => openCalendar(),
      '',
      'meses fechas festivos semana luna año contar días'
    );
    act(
      'prepare-offline',
      'Preparar para usar sin conexión',
      'fas fa-plane',
      () => dispatch(eliPrepareOffline()),
      '',
      'offline viaje avión descargar internet'
    );
    act(
      'all-projects',
      'Todos los proyectos',
      'fas fa-project-diagram',
      () => gtdCommand(history, pathname, { view: { id: 'projects' } }),
      '',
      'gtd'
    );
    if (inFile) {
      act(
        'search',
        'Buscar en el fichero',
        'fas fa-search',
        () => dispatch(activatePopup('search')),
        key('openSearch')
      );
      act(
        'move',
        'Mover encabezados (flechas)',
        'fas fa-arrows-alt',
        () => window.dispatchEvent(new CustomEvent('eli:move-menu')),
        key('openMoveMenu')
      );
      act(
        'collapse-all',
        'Contraer todas las cabeceras',
        'fas fa-angle-double-up',
        () => dispatch(eliSetAllHeadersOpened(false)),
        '',
        'plegar cerrar todo'
      );
      act(
        'expand-all',
        'Expandir todas las cabeceras',
        'fas fa-angle-double-down',
        () => dispatch(eliSetAllHeadersOpened(true)),
        '',
        'desplegar abrir todo'
      );
      act('raw', 'Editar como texto plano', 'fas fa-align-left', openRawEditor);
      act('pdf', 'Exportar a PDF', 'fas fa-file-pdf', () => openPrintPreview(null), '', 'imprimir');
    }
    act(
      'favorites',
      'Ficheros principales',
      'far fa-copy',
      openFavorites,
      key('openFavorites'),
      'favoritos'
    );
    act('files', 'Explorador de ficheros', 'far fa-folder-open', () => history.push('/files'));
    if (window.self === window.top && window.innerWidth >= 900) {
      act(
        'split',
        'Dos columnas',
        'fas fa-columns',
        () => window.dispatchEvent(new CustomEvent('eli:split-open')),
        '',
        'dividir split'
      );
    }
    THEMES.forEach((t) =>
      act(
        `theme:${t}`,
        `Tema: ${t}`,
        'fas fa-palette',
        () => dispatch(setTheme(t)),
        '',
        'cambiar colores'
      )
    );
    SCHEMES.forEach(([v, l]) =>
      act(
        `scheme:${v}`,
        `Esquema de color: ${l}`,
        v === 'Dark' ? 'fas fa-moon' : v === 'Light' ? 'fas fa-sun' : 'fas fa-adjust',
        () => dispatch(setColorScheme(v)),
        '',
        'modo oscuro claro tema'
      )
    );
    act(
      'settings',
      'Ajustes',
      'fas fa-cogs',
      () => {
        dispatch(setLastViewedFile(currentPath));
        history.push('/settings');
      },
      '',
      'configuración preferencias'
    );
    act(
      'file-settings',
      'Ajustes de ficheros',
      'fas fa-file-alt',
      () => {
        dispatch(setLastViewedFile(currentPath));
        history.push('/settings');
        dispatch(pushModalPage('file_settings_editor'));
      },
      '',
      'configuración agenda arranque'
    );
    act(
      'manual',
      'Manual (sample.org)',
      'fas fa-question-circle',
      () => history.push('/sample'),
      '',
      'ayuda'
    );
    act(
      'changelog',
      'Novedades',
      'fas fa-gift',
      () => {
        dispatch(restoreStaticFile('changelog'));
        dispatch(pushModalPage('changelog'));
      },
      '',
      'changelog versión'
    );
    act('moon', 'Fases de la Luna', 'fas fa-moon', openMoonPhases);
    act('calculator', 'Calculadora', 'fas fa-calculator', () => openCalculator(), '', 'calcular sumar cuentas');

    // Listas GTD
    const gtdCfg = normalizeGtdSections(state.base.get('eliGtdSections'));
    [...LISTS, ...EXTRA_LISTS]
      .filter((l) => isSectionShown(l.id, gtdCfg))
      .forEach((l) =>
        add({
          rid: `g:${l.id}`,
          kind: 'gtd',
          label: `GTD: ${l.label}`,
          icon: l.icon,
          run: () => gtdCommand(history, pathname, { view: { id: l.id } }),
        })
      );

    // Ficheros
    const loaded = Array.from(files.keys()).filter(isRealPath);
    const filePaths = Array.from(
      new Set([
        ...loaded,
        ...(state.org.present.get('fileSettings') || List()).map((s) => s.get('path')).toArray(),
        ...remoteFiles,
      ])
    ).filter(isRealPath);
    filePaths.forEach((p) =>
      add({
        rid: `f:${p}`,
        kind: 'file',
        label: baseName(p),
        sub: shortPath(p),
        icon: 'far fa-file-alt',
        path: p,
        run: () => goToFile(p),
        search: shortPath(p),
      })
    );

    // Encabezados, proyectos y etiquetas de los ficheros cargados
    const tags = new Map();
    loaded.forEach((p) => {
      const headers = files.getIn([p, 'headers']);
      if (!headers) return;
      headers.forEach((h) => {
        const title = displayTitle(h.getIn(['titleLine', 'rawTitle']) || '');
        if (!title.trim()) return;
        const keyword = h.getIn(['titleLine', 'todoKeyword']) || '';
        const htags = (h.getIn(['titleLine', 'tags']) || List()).toArray().filter(Boolean);
        htags.forEach((t) => tags.set(t, (tags.get(t) || 0) + 1));
        const id = h.get('id');
        add({
          rid: `h:${p}::${title}`,
          kind: 'head',
          label: title,
          keyword,
          sub: shortPath(p),
          tags: htags,
          icon: keyword ? 'far fa-check-square' : 'fas fa-angle-right',
          path: p,
          run: () => goToHeader(p, id, title),
          search: `${title} ${htags.join(' ')}`,
        });
        if (keyword === 'PROJECT') {
          add({
            rid: `p:${p}::${title}`,
            kind: 'project',
            label: title,
            sub: `Proyecto GTD · ${shortPath(p)}`,
            icon: 'fas fa-project-diagram',
            run: () =>
              gtdCommand(history, pathname, { view: { type: 'project', key: `${p}::${id}` } }),
          });
        }
      });
    });
    Array.from(tags.keys())
      .sort()
      .forEach((t) =>
        add({
          rid: `t:${t}`,
          kind: 'tag',
          label: `:${t}:`,
          tag: t,
          sub: `${tags.get(t)} ${tags.get(t) === 1 ? 'encabezado' : 'encabezados'}`,
          icon: 'fas fa-tag',
          search: t,
        })
      );
    return items;
    // goToFile/goToHeader solo usan dispatch/history (estables)
  }, [open, remoteFiles, location.pathname, store, dispatch, history]);

  // Ir a un fichero (cargándolo si hace falta)
  function goToFile(path) {
    const pathname = window.location.pathname;
    dispatch(setPath(path));
    if (!pathname.endsWith(`/file${path}`)) history.push(`/file${path}`);
  }

  // Ir a un encabezado: se abre el fichero con la vista reducida a él (narrow)
  async function goToHeader(path, id, title) {
    const state = store.getState();
    let headers = state.org.present.getIn(['files', path, 'headers']);
    if (!headers) {
      await dispatch(loadFileQuietly(path));
      headers = store.getState().org.present.getIn(['files', path, 'headers']);
    }
    let headerId = id;
    if (headers && !headers.some((h) => h.get('id') === id)) {
      const found = headers.find(
        (h) => displayTitle(h.getIn(['titleLine', 'rawTitle']) || '') === title
      );
      headerId = found ? found.get('id') : null;
    }
    if (headerId == null) return goToFile(path);
    const samePath = store.getState().org.present.get('path') === path;
    window.__eliPendingNarrow = samePath ? null : { path, headerId };
    dispatch(selectHeaderAndOpenParents(path, headerId, { widen: true }));
    dispatch(eliNarrowAndExpand(headerId));
    if (!window.location.pathname.endsWith(`/file${path}`)) history.push(`/file${path}`);
  }

  // Resultados
  const results = useMemo(() => {
    if (!open) return [];
    const q = query.trim();
    let mode = null;
    let text = q;
    if (q.startsWith('>')) {
      mode = 'action';
      text = q.slice(1);
    } else if (q.startsWith('#')) {
      mode = 'tag';
      text = q.slice(1);
    } else if (q.startsWith('/')) {
      mode = 'file';
      text = q.slice(1);
    }
    text = text.trim();

    // «#etiqueta resto»: encabezados con esa etiqueta
    if (mode === 'tag') {
      const [first, ...rest] = text.split(/\s+/);
      const tagItem =
        first && index.find((i) => i.kind === 'tag' && normalize(i.tag) === normalize(first));
      if (tagItem && /\s/.test(query.replace(/^\s*#/, ''))) {
        const restText = rest.join(' ');
        return index
          .filter((i) => i.kind === 'head' && i.tags.some((t) => normalize(t) === normalize(first)))
          .map((i) => ({ i, s: restText ? fuzzyScore(restText, i.search) : 0 }))
          .filter((x) => x.s !== null)
          .sort((a, b) => b.s - a.s)
          .slice(0, MAX_RESULTS)
          .map((x) => x.i);
      }
    }

    if (!text && !mode) {
      const byRid = new Map(index.map((i) => [i.rid, i]));
      const recent = readRecent()
        .map((rid) => byRid.get(rid))
        .filter(Boolean);
      if (recent.length) return recent.map((i) => ({ ...i, recent: true }));
      return index.filter((i) => i.kind === 'action').slice(0, 12);
    }
    const pool = mode ? index.filter((i) => i.kind === mode) : index;
    if (!text) return pool.slice(0, MAX_RESULTS);
    const kindBonus = { action: 30, gtd: 25, project: 20, file: 15, tag: 10, head: 0 };
    return pool
      .map((i) => {
        const s = fuzzyScore(text, i.search);
        return s === null ? null : { i, s: s + (kindBonus[i.kind] || 0) };
      })
      .filter(Boolean)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map((x) => x.i);
  }, [open, query, index]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.is-active');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => setOpen(false);

  const choose = (item) => {
    if (!item) return;
    if (item.kind === 'tag') {
      setQuery(`#${item.tag} `);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
      return;
    }
    writeRecent([item.rid, ...readRecent().filter((r) => r !== item.rid)].slice(0, 8));
    close();
    setTimeout(() => item.run && item.run(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!results.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + d + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else {
      e.stopPropagation();
    }
  };

  if (!open) return null;

  return (
    <div
      className="eli-palette__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="eli-palette"
    >
      <div className="eli-palette" role="dialog" aria-label="Paleta de comandos">
        <div className="eli-palette__search">
          <i className="fas fa-search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar ficheros, tareas, etiquetas o acciones…  (> acciones · # etiquetas · / ficheros)"
            data-testid="eli-palette-input"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="eli-palette__close" onClick={close} title="Cerrar (Esc)">
            <i className="fas fa-times" />
          </button>
        </div>
        {!query.trim() && results.length > 0 && (
          <div className="eli-palette__hint">{results[0].recent ? 'Recientes' : 'Acciones'}</div>
        )}
        <ul className="eli-palette__list" ref={listRef} data-testid="eli-palette-results">
          {results.map((item, i) => (
            <li
              key={item.rid}
              className={'eli-palette__item' + (i === active ? ' is-active' : '')}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => choose(item)}
              data-testid="eli-palette-item"
              data-kind={item.kind}
            >
              <i className={`${item.icon} eli-palette__icon`} />
              <span className="eli-palette__main">
                <span className="eli-palette__label">
                  {item.keyword && <span className="eli-palette__kw">{item.keyword}</span>}
                  {item.label}
                </span>
                {item.sub && <span className="eli-palette__sub">{item.sub}</span>}
              </span>
              {item.shortcut ? (
                <kbd className="eli-palette__kbd">{item.shortcut}</kbd>
              ) : (
                <span className="eli-palette__kind">{KIND_LABEL[item.kind]}</span>
              )}
            </li>
          ))}
          {results.length === 0 && <li className="eli-palette__empty">Sin resultados</li>}
        </ul>
        <div className="eli-palette__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> moverse
          </span>
          <span>
            <kbd>Intro</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
