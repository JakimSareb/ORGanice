// ORG Mode para Eli (4.41): herramienta «Enlaces rotos» (Menú › Herramientas). Lee TODOS los
// ficheros .org de la carpeta (sin copias de seguridad ni carpetas excluidas; el archivo, para
// encontrar IDs archivados) y busca [[id:…]] sin destino, [[file:…]] a ficheros que no existen y
// enlaces a cabeceras que no existen. Las reparaciones escriben con la cola de guardado (un
// guardado por fichero). Modelo puro en eli_roam.js.
import { List } from 'immutable';
import {
  scanBrokenLinks,
  brokenCount,
  rewriteLinks,
  relativePath,
  fileNodes,
  readIgnored,
  writeIgnored,
  groupTitle,
} from './eli_roam';
import { headingIndex, idOf } from './eli_heading_index';
import { findLinkedHeader } from './eli_org_links';
import { diaryLinkDetail } from './eli_diary';
import { parseExcludedFolders, isExcluded } from './eli_excluded_folders';
import { ensureHeadingOrgId, createNoteFile } from './eli_heading_links';
import { loadFileQuietly, eliLoadArchivedFiles, eliRewriteHeadings } from '../actions/org';
import { setLoadingMessage, hideLoadingMessage } from '../actions/base';

const MAX_FILES = 500;
const COUNT_KEY = 'eliBrokenLinksCount';

// --- Contador (último escaneo; se enseña en Herramientas) ---
let lastCount = (() => {
  try {
    const n = parseInt(window.localStorage.getItem(COUNT_KEY) || '', 10);
    return isNaN(n) ? null : n;
  } catch (e) {
    return null;
  }
})();
export const brokenLinksCount = () => lastCount;
const setCount = (n) => {
  lastCount = n;
  try {
    window.localStorage.setItem(COUNT_KEY, String(n));
  } catch (e) {}
};

export const openBrokenLinks = () => window.dispatchEvent(new CustomEvent('eli:broken-links'));

const isOrg = (p) => /\.org$/i.test(p || '');

/**
 * Carga los ficheros .org que falten (y los de archivo) → { allPaths (o null si el servicio no da
 * la lista) }
 */
export const loadForScan = () => async (dispatch, getState) => {
  const client = getState().syncBackend.get('client');
  let all = null;
  try {
    all = client && client.listAllFiles ? await client.listAllFiles() : null;
  } catch (e) {
    all = null;
  }
  if (all) {
    const excluded = parseExcludedFolders(getState().base.get('eliExcludedFolders'));
    const loaded = getState().org.present.get('files');
    const todo = all
      .filter((p) => isOrg(p) && !/\/backups?\//i.test(p) && !isExcluded(p, excluded))
      .filter((p) => !loaded.getIn([p, 'headers']))
      .slice(0, MAX_FILES);
    for (let i = 0; i < todo.length; i += 6) {
      dispatch(setLoadingMessage(`Leyendo ficheros… ${i}/${todo.length}`));
      await Promise.all(todo.slice(i, i + 6).map((p) => dispatch(loadFileQuietly(p))));
    }
    dispatch(hideLoadingMessage());
  }
  try {
    await dispatch(eliLoadArchivedFiles());
  } catch (e) {}
  return { allPaths: all };
};

// Todos los IDs de los ficheros cargados (cabeceras y ficheros), en minúsculas
const allIds = (files) => {
  const out = new Set();
  files.forEach((file, path) => {
    const headers = file && file.get && file.get('headers');
    (headers || List()).forEach((h) => {
      const id = idOf(h);
      if (id) out.add(id.toLowerCase());
    });
  });
  fileNodes(files).forEach((n) => out.add(n.orgId.toLowerCase()));
  return out;
};

/** Escaneo con lo cargado → { groups, nodes } */
export const computeBrokenLinks = (state, allPaths) => {
  const files = state.org.present.get('files');
  const ids = allIds(files);
  const known = new Set(
    [
      ...(allPaths || []),
      ...files.keySeq().toArray(),
      ...state.org.present
        .get('fileSettings')
        .map((x) => x.get('path'))
        .toArray(),
    ].map((p) => String(p || '').toLowerCase())
  );
  const existsFile = (p) => {
    const k = String(p || '').toLowerCase();
    if (known.has(k)) return true;
    // sin la lista de la carpeta solo se puede decir de los .org que se conocen
    return !allPaths && !isOrg(p);
  };
  const findHeading = (path, search) => {
    const headers = files.getIn([path, 'headers']);
    if (!headers) {
      const real = files.keySeq().find((p) => p.toLowerCase() === String(path).toLowerCase());
      if (!real) return undefined;
      return !!findLinkedHeader(files.getIn([real, 'headers']), search);
    }
    return !!findLinkedHeader(headers, search);
  };
  const groups = scanBrokenLinks(files, {
    existsFile,
    resolveId: (id) => ids.has(String(id).toLowerCase()),
    findHeading,
    isVirtualId: (id) => !!diaryLinkDetail(id),
    ignored: readIgnored(),
  });
  const index = headingIndex(files);
  const nodes = [
    ...fileNodes(files),
    ...index.filter((e) => e.title && !e.exclude && !/\.org_archive$/i.test(e.path)),
  ];
  setCount(brokenCount(groups));
  return { groups, nodes };
};

// Edits para aplicar `ops` = [{ group, mode, uriFor(path) }] → una función por cabecera
const editsFor = (ops) => {
  const byHeading = new Map();
  ops.forEach((op) =>
    op.group.occurrences.forEach((o) => {
      const k = `${o.path}\u0000${o.headerId}`;
      if (!byHeading.has(k)) byHeading.set(k, { path: o.path, headerId: o.headerId, steps: [] });
      const entry = byHeading.get(k);
      let step = entry.steps.find((s) => s.op === op);
      if (!step) {
        step = { op, uris: new Set() };
        entry.steps.push(step);
      }
      step.uris.add(o.uri);
    })
  );
  return Array.from(byHeading.values()).map(({ path, headerId, steps }) => {
    const fn = (text) =>
      steps.reduce(
        (acc, { op, uris }) =>
          rewriteLinks(acc, (u) => uris.has(u), op.mode, {
            newUri: op.uriFor ? op.uriFor(path) : null,
            newDesc: op.newDesc || '',
          }),
        text
      );
    return { path, headerId, title: fn, notes: fn, props: fn };
  });
};

// Dejar solo el texto / borrar el enlace, en uno o varios grupos
export const unlinkGroups = (groups, mode) => (dispatch) =>
  dispatch(eliRewriteHeadings(editsFor(groups.map((group) => ({ group, mode })))));

// Nuevo destino de un enlace a fichero (se respeta si era relativo y la búsqueda «::…»)
const fileUriFor = (group, newPath) => (fromPath) => {
  const t = group.target;
  const rel = t.relative ? relativePath(fromPath, newPath) : newPath;
  return `file:${rel}${t.search ? `::${t.search}` : ''}`;
};

// Reparar con una sugerencia
export const repairGroup = (group, sugg) => async (dispatch) => {
  if (sugg.kind === 'file') {
    return dispatch(
      eliRewriteHeadings(
        editsFor([{ group, mode: 'retarget', uriFor: fileUriFor(group, sugg.path) }])
      )
    );
  }
  const n = sugg.node;
  const orgId = n.isFile ? n.orgId : n.orgId || dispatch(ensureHeadingOrgId(n.path, n.headerId));
  if (!orgId) return 0;
  return dispatch(
    eliRewriteHeadings(
      editsFor([{ group, mode: 'retarget', uriFor: () => `id:${orgId}`, newDesc: n.title }])
    )
  );
};

// Crear nota: con el MISMO ID si el enlace era [[id:…]] (así ya funciona sin tocar nada); si no,
// nota nueva y los enlaces pasan a apuntarla por ID
export const createNoteForGroup = (group, title = null) => async (dispatch) => {
  const t = (title || groupTitle(group) || '').trim();
  if (!t) return 0;
  if (group.kind === 'id') {
    const made = await dispatch(createNoteFile(t, group.target.id));
    return made ? 1 : 0;
  }
  const made = await dispatch(createNoteFile(t));
  if (!made) return 0;
  return dispatch(
    eliRewriteHeadings(
      editsFor([{ group, mode: 'retarget', uriFor: () => `id:${made.orgId}`, newDesc: t }])
    )
  );
};

export const ignoreGroups = (groups) => {
  const set = readIgnored();
  groups.forEach((g) => set.add(g.key));
  writeIgnored(set);
};
export const clearIgnored = () => writeIgnored(new Set());
export const ignoredCount = () => readIgnored().size;
