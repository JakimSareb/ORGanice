// ORG Mode para Eli (4.52): selector de DESTINO navegable (el de «Enviar a», «Mover a otro fichero»
// y Procesar Inbox). Antes solo recorría los ficheros ya cargados en una lista plana; ahora:
//   · nivel 1 = TODOS los .org de la carpeta/Dropbox (primero los de GTD y la wiki), cargándolos al entrar;
//   · tocar una cabecera = elegirla; «›» = entrar en sus subcabeceras (a cualquier profundidad);
//   · migas de pan tocables, «← Atrás», buscador entre ficheros y «Recientes».
// El modelo (funciones puras) se prueba en jest; el diálogo es DOM como askPick.
import { childrenOf, headingIndex, searchHeadings, fileNameOf } from './eli_heading_index';

export const isOrgFile = (p) => /\.org$/i.test(p || '');

const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Ficheros .org de una carpeta y sus subcarpetas (servicios sin `listAllFiles`, p. ej. WebDAV)
const walkDir = async (client, dir, depth) => {
  const out = [];
  let res;
  try {
    res = await client.getDirectoryListing(dir.replace(/\/+$/, '') || '/');
  } catch (e) {
    return out;
  }
  const raw = res && res.listing;
  const list = raw ? (typeof raw.toJS === 'function' ? raw.toJS() : raw) : [];
  for (const e of list) {
    if (e.isDirectory) {
      if (depth > 0)
        out.push(...(await walkDir(client, `${e.path.replace(/\/+$/, '')}/`, depth - 1)));
    } else out.push(e.path);
  }
  return out;
};

// Todos los .org del servicio + los ya cargados (sin copias de seguridad ni ficheros internos)
export const listAllOrgPaths = () => async (dispatch, getState) => {
  const state = getState();
  const client = state.syncBackend && state.syncBackend.get && state.syncBackend.get('client');
  let all = [];
  try {
    if (client && client.listAllFiles) all = (await client.listAllFiles()) || [];
    else if (client && client.getDirectoryListing) all = await walkDir(client, '/', 3);
  } catch (e) {
    all = [];
  }
  const loaded = state.org.present
    .get('files')
    .keySeq()
    .toArray()
    .filter((p) => !!state.org.present.getIn(['files', p, 'headers']));
  return normalizePaths([...all, ...loaded]);
};

export const normalizePaths = (paths) =>
  Array.from(new Set(paths))
    .filter(
      (p) =>
        typeof p === 'string' &&
        p.startsWith('/') &&
        !p.startsWith('/__') &&
        isOrgFile(p) &&
        !/\/backups?\//i.test(p)
    )
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

// Orden de la lista de ficheros: primero los de GTD, luego los de la wiki, luego el resto
// (alfabético). → [{ path, name, group: 'gtd' | 'wiki' | '' }]
export const orderFilePaths = (paths, { gtdPaths = [], wikiPaths = [] } = {}) => {
  const gtd = new Set(gtdPaths.filter(Boolean));
  const wiki = new Set(wikiPaths.filter(Boolean));
  const rank = (p) => (gtd.has(p) ? 0 : wiki.has(p) ? 1 : 2);
  return normalizePaths(paths)
    .map((path, i) => ({ path, i }))
    .sort((a, b) => rank(a.path) - rank(b.path) || a.i - b.i)
    .map(({ path }) => ({
      path,
      name: fileNameOf(path),
      group: gtd.has(path) ? 'gtd' : wiki.has(path) ? 'wiki' : '',
    }));
};

// ¿Tiene subcabeceras? (la siguiente entrada del fichero es más profunda)
const hasKids = (list, e) => !!list[e.pos + 1] && list[e.pos + 1].level > e.level;

// Cabeceras de un nivel: las de nivel superior del fichero, o las hijas directas de `parent`
// → [{ entry, hasKids }]
export const levelRows = (index, path, parent = null) => {
  const list = (index && index.byPath && index.byPath.get(path)) || [];
  const entries = parent ? childrenOf(index, parent) : list.filter((e) => e.parents.length === 0);
  return entries.map((entry) => ({ entry, hasKids: hasKids(list, entry) }));
};

// Migas: [{ label, depth }]; depth 0 = «Ficheros», 1 = el fichero, 2.. = cabeceras
export const crumbsFor = (path, trail) => {
  const out = [{ label: 'Ficheros', depth: 0 }];
  if (!path) return out;
  out.push({ label: fileNameOf(path), depth: 1 });
  trail.forEach((e, i) => out.push({ label: e.title, depth: 2 + i }));
  return out;
};

// Búsqueda entre TODOS los ficheros cargados: ficheros cuyo nombre coincide + cabeceras
export const searchRows = (index, files, query, limit = 200) => {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { files: [], entries: [] };
  const fileHits = files.filter((f) => words.every((w) => plain(f.name).includes(w)));
  const entries = searchHeadings(index, query, limit);
  return { files: fileHits, entries };
};

// «Recientes» de la sesión (los 5 últimos destinos, el más nuevo primero)
const recentList = [];
export const rememberTarget = (t) => {
  if (!t || !t.path) return;
  const i = recentList.findIndex((r) => r.path === t.path && r.headerId === t.headerId);
  if (i >= 0) recentList.splice(i, 1);
  recentList.unshift({ path: t.path, headerId: t.headerId || null, title: t.title });
  recentList.length = Math.min(recentList.length, 5);
};
export const recentTargets = () => recentList.slice();
export const clearRecentTargets = () => {
  recentList.length = 0;
};

// Último nivel visitado por sesión de trabajo (p. ej. Procesar Inbox: varias seguidas al mismo sitio)
const lastLocs = new Map();
export const rememberLoc = (key, loc) => key && lastLocs.set(key, loc);
export const recallLoc = (key) => (key && lastLocs.get(key)) || null;
export const forgetLoc = (key) => lastLocs.delete(key);

/**
 * Diálogo. Opciones:
 *  - files: [{ path, name, group }]            ficheros del nivel 1
 *  - getIndex(): headingIndex actual (se llama de nuevo tras cargar un fichero)
 *  - ensureLoaded(path): Promise<boolean>      carga el fichero si hace falta
 *  - shortcuts: [{ label, hint, path, headerId, title }]  atajos fijos del nivel 1 (p. ej. Wiki)
 *  - sessionKey: recuerda el último nivel y los recientes se ofrecen arriba
 *  - onlyPath: solo ese fichero
 *  - allowNew: (4.57) dentro de un fichero ofrece «＋ Nueva subcabecera aquí…»: pide el título y
 *    devuelve además `newTitle` (path/headerId = la madre donde crearla; la crea quien llama)
 * → Promise<{ path, headerId, title, newTitle? } | null>
 */
export const askRefileTarget = ({
  title = 'Enviar a',
  files = [],
  getIndex,
  ensureLoaded = async () => true,
  shortcuts = [],
  sessionKey = null,
  onlyPath = null,
  allowNew = false,
}) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'eli-prompt__overlay';
    overlay.innerHTML = `
      <form class="eli-prompt__box eli-pick" autocomplete="off" data-testid="eli-refile-pick">
        <div class="eli-prompt__title"></div>
        <div class="eli-pick__crumbs" data-testid="eli-refile-crumbs"></div>
        <input type="text" class="eli-prompt__input" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Buscar fichero o cabecera…" data-testid="eli-refile-search" />
        <div class="eli-pick__list" role="listbox"></div>
        <div class="eli-pick__tip" data-testid="eli-refile-tip"></div>
        <div class="eli-prompt__buttons">
          <button type="button" class="btn eli-pick__up" data-testid="eli-refile-up">← Atrás</button>
          <button type="button" class="btn eli-prompt__cancel">Cancelar</button>
        </div>
      </form>`;
    overlay.querySelector('.eli-prompt__title').textContent = title;
    // (4.57) aviso (4.52): para colgarlo de una subcabecera hay que entrar con «›» en su madre
    overlay.querySelector('.eli-pick__tip').textContent = allowNew
      ? 'Toca una cabecera para elegirla; «›» entra en sus subcabeceras (para elegir una de más abajo) y «＋ Nueva…» crea una.'
      : '';
    const crumbsEl = overlay.querySelector('.eli-pick__crumbs');
    const input = overlay.querySelector('.eli-prompt__input');
    const listEl = overlay.querySelector('.eli-pick__list');
    const upBtn = overlay.querySelector('.eli-pick__up');

    const visibleFiles = onlyPath ? files.filter((f) => f.path === onlyPath) : files;
    let loc = { path: null, trail: [] };
    let rows = [];
    let active = 0;
    let busy = '';
    let finished = false;
    let creating = false; // (4.57) escribiendo el título de la subcabecera nueva

    const find = (path, headerId) => {
      const list = (getIndex().byPath && getIndex().byPath.get(path)) || [];
      return list.find((e) => e.headerId === headerId) || null;
    };

    const done = (v) => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };

    const choose = async (t) => {
      busy = 'Cargando…';
      paint();
      const ok = await ensureLoaded(t.path);
      if (!ok) {
        busy = 'No se ha podido abrir el fichero.';
        paint();
        return;
      }
      rememberLoc(sessionKey, loc);
      rememberTarget(t);
      done({ path: t.path, headerId: t.headerId || null, title: t.title });
    };

    const enterFile = async (path) => {
      busy = 'Cargando…';
      paint();
      const ok = await ensureLoaded(path);
      busy = ok ? '' : 'No se ha podido abrir el fichero.';
      if (ok) {
        loc = { path, trail: [] };
        input.value = '';
        active = 0;
      }
      paint();
    };
    const enterEntry = (entry) => {
      loc = { path: entry.path, trail: [...loc.trail, entry] };
      input.value = '';
      active = 0;
      paint();
    };
    const stopCreating = () => {
      creating = false;
      input.value = '';
      active = 0;
      paint();
    };
    const goUp = () => {
      if (creating) return stopCreating();
      if (input.value) {
        input.value = '';
      } else if (loc.trail.length) loc = { path: loc.path, trail: loc.trail.slice(0, -1) };
      else if (loc.path && !onlyPath) loc = { path: null, trail: [] };
      active = 0;
      paint();
    };
    const goToDepth = (depth) => {
      creating = false;
      if (depth === 0) loc = { path: null, trail: [] };
      else loc = { path: loc.path, trail: loc.trail.slice(0, depth - 1) };
      input.value = '';
      active = 0;
      paint();
    };

    const addEntryRows = (list, depthOf) =>
      list.forEach(({ entry, hasKids: kids, hint, depth }) =>
        rows.push({
          kind: 'entry',
          label: entry.title || '(sin título)',
          hint: hint || '',
          depth: depth !== undefined ? depth : depthOf,
          kids,
          main: () => choose({ path: entry.path, headerId: entry.headerId, title: entry.title }),
          enter: kids ? () => enterEntry(entry) : null,
        })
      );

    const finishNew = (newTitle) => {
      const parent = loc.trail.length ? loc.trail[loc.trail.length - 1] : null;
      rememberLoc(sessionKey, loc);
      done({
        path: loc.path,
        headerId: parent ? parent.headerId : null,
        title: parent ? parent.title : fileNameOf(loc.path),
        newTitle,
      });
    };

    const build = () => {
      rows = [];
      const q = input.value.trim();
      const index = getIndex();
      if (creating) {
        const parent = loc.trail.length ? loc.trail[loc.trail.length - 1] : null;
        if (q)
          rows.push({
            kind: 'create',
            label: `✓ Crear «${q}»`,
            hint: parent
              ? `dentro de «${parent.title}»`
              : `en ${fileNameOf(loc.path)}, nivel superior`,
            depth: 0,
            main: () => finishNew(q),
            enter: null,
          });
        return;
      }
      if (q) {
        const res = searchRows(index, visibleFiles, q);
        res.files.forEach((f) =>
          rows.push({
            kind: 'file',
            label: f.name,
            hint: 'fichero',
            depth: 0,
            main: () => enterFile(f.path),
            enter: null,
          })
        );
        res.entries.forEach((entry) =>
          rows.push({
            kind: 'entry',
            label: entry.title || '(sin título)',
            hint: [...entry.parents.slice(-1), fileNameOf(entry.path)].join(' · '),
            depth: 0,
            kids: false,
            main: () => choose({ path: entry.path, headerId: entry.headerId, title: entry.title }),
            enter: null,
          })
        );
        return;
      }
      if (!loc.path) {
        if (!onlyPath) {
          recentTargets().forEach((r) =>
            rows.push({
              kind: 'recent',
              label: r.title,
              hint: `reciente · ${fileNameOf(r.path)}`,
              depth: 0,
              main: () => choose(r),
              enter: null,
            })
          );
          shortcuts.forEach((s) =>
            rows.push({
              kind: 'shortcut',
              label: s.label,
              hint: s.hint || '',
              depth: 0,
              main: () => choose(s),
              enter: null,
            })
          );
        }
        visibleFiles.forEach((f) => {
          const entries = (index.byPath && index.byPath.get(f.path)) || null;
          rows.push({
            kind: 'file',
            label: f.name,
            hint: entries ? `${entries.length} cabeceras` : 'sin abrir',
            depth: 0,
            main: () => enterFile(f.path),
            enter: () => enterFile(f.path),
          });
        });
        return;
      }
      const parent = loc.trail.length ? loc.trail[loc.trail.length - 1] : null;
      rows.push({
        kind: 'here',
        label: parent
          ? `✓ Elegir esta cabecera («${parent.title}»)`
          : `✓ Elegir este fichero (${fileNameOf(loc.path)}, nivel superior)`,
        hint: '',
        depth: 0,
        main: () =>
          parent
            ? choose({ path: parent.path, headerId: parent.headerId, title: parent.title })
            : choose({ path: loc.path, headerId: null, title: fileNameOf(loc.path) }),
        enter: null,
      });
      if (allowNew)
        rows.push({
          kind: 'new',
          label: parent
            ? `＋ Nueva subcabecera dentro de «${parent.title}»…`
            : '＋ Nueva cabecera en el nivel superior…',
          hint: '',
          depth: 0,
          main: () => {
            creating = true;
            input.value = '';
            active = 0;
            paint();
            input.focus();
          },
          enter: null,
        });
      addEntryRows(levelRows(index, loc.path, parent), 0);
    };

    const paint = () => {
      build();
      // migas
      crumbsEl.innerHTML = '';
      crumbsFor(loc.path, loc.trail).forEach((c, i, all) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'eli-pick__crumb' + (i === all.length - 1 ? ' is-last' : '');
        b.textContent = c.label;
        b.setAttribute('data-testid', 'eli-refile-crumb');
        b.addEventListener('click', () => goToDepth(c.depth));
        crumbsEl.appendChild(b);
        if (i < all.length - 1) crumbsEl.appendChild(document.createTextNode(' › '));
      });
      upBtn.disabled = !loc.path && !input.value && !creating;
      input.placeholder = creating
        ? 'Título de la subcabecera nueva…'
        : 'Buscar fichero o cabecera…';
      // filas
      if (active >= rows.length) active = Math.max(0, rows.length - 1);
      listEl.innerHTML = '';
      if (busy) {
        const b = document.createElement('div');
        b.className = 'eli-pick__empty';
        b.textContent = busy;
        listEl.appendChild(b);
      }
      if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'eli-pick__empty';
        empty.textContent = creating
          ? 'Escribe el título y pulsa Intro.'
          : input.value.trim()
          ? 'No hay coincidencias (solo se busca en los ficheros ya abiertos: entra en un fichero para abrirlo).'
          : loc.path
          ? 'Este fichero no tiene cabeceras: elige el fichero.'
          : 'No hay ficheros .org.';
        listEl.appendChild(empty);
        return;
      }
      rows.forEach((r, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'eli-pick__row' + (i === active ? ' is-active' : '') + ` is-${r.kind}`;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'eli-pick__item';
        b.setAttribute('data-testid', `eli-refile-${r.kind}`);
        const label = document.createElement('span');
        label.textContent = r.label;
        b.appendChild(label);
        if (r.hint) {
          const hint = document.createElement('small');
          hint.textContent = r.hint;
          b.appendChild(hint);
        }
        b.addEventListener('click', () => r.main());
        wrap.appendChild(b);
        if (r.enter && r.kind === 'entry') {
          const e = document.createElement('button');
          e.type = 'button';
          e.className = 'eli-pick__enter';
          e.textContent = '›';
          e.title = 'Ver sus subcabeceras';
          e.setAttribute('aria-label', 'Entrar');
          e.setAttribute('data-testid', 'eli-refile-enter');
          e.addEventListener('click', () => r.enter());
          wrap.appendChild(e);
        }
        listEl.appendChild(wrap);
      });
      const on = listEl.querySelector('.is-active');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    };

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (creating) stopCreating();
        else done(null);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        paint();
      } else if (e.key === 'ArrowRight' && !input.value) {
        const r = rows[active];
        if (r && r.enter) {
          e.preventDefault();
          r.enter();
        }
      } else if (e.key === 'ArrowLeft' && !input.value && (loc.path || loc.trail.length)) {
        e.preventDefault();
        goUp();
      }
    }
    document.addEventListener('keydown', onKey, true);
    input.addEventListener('input', () => {
      active = 0;
      paint();
    });
    upBtn.addEventListener('click', goUp);
    overlay.querySelector('.eli-prompt__cancel').addEventListener('click', () => done(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (rows[active]) rows[active].main();
    });

    // nivel de partida: con onlyPath, directamente ese fichero; si no, el último de la sesión
    const start = async () => {
      if (onlyPath) {
        if (await ensureLoaded(onlyPath)) loc = { path: onlyPath, trail: [] };
      } else {
        const last = recallLoc(sessionKey);
        if (last && last.path && (await ensureLoaded(last.path))) {
          const trail = [];
          for (const e of last.trail) {
            const again = find(e.path, e.headerId);
            if (!again) break;
            trail.push(again);
          }
          loc = { path: last.path, trail };
        }
      }
      paint();
    };
    document.body.appendChild(overlay);
    paint();
    start();
    setTimeout(() => input.focus(), 50);
  });

// Índice de las cabeceras cargadas (sin el diario), para el diálogo
export const indexOfState = (state) =>
  headingIndex(state.org.present.get('files'), { skipDiary: true });
