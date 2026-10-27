// ORG Mode para Eli (4.41): compatibilidad con org-roam v2 y herramienta «Enlaces rotos».
// Modelo puro (sin Redux):
//   - Nodos de FICHERO: cajón :PROPERTIES: con :ID: antes de la primera cabecera + `#+title:`.
//     También `#+filetags:` (etiquetas del fichero, heredadas por sus cabeceras), :ROAM_ALIASES:,
//     :ROAM_EXCLUDE: y :ROAM_REFS:.
//   - Alias, menciones sin enlazar, nombre de fichero de una nota nueva.
//   - Enlaces rotos: escaneo y reescritura de los enlaces de un texto.
import { normalize } from './eli_fuzzy';

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Preámbulo del fichero (líneas antes de la primera cabecera) ---

const linesOf = (lines) => {
  if (!lines) return [];
  if (Array.isArray(lines)) return lines;
  if (typeof lines.toArray === 'function') return lines.toArray();
  return String(lines).split('\n');
};

/**
 * Lee el preámbulo: { props: { NOMBRE: valor }, title, filetags: [] }. El cajón :PROPERTIES:
 * cuenta si es lo primero del fichero (como org-roam: puede haber líneas vacías o comentarios
 * antes) o en cualquier sitio antes de la primera cabecera.
 */
export const parsePreamble = (lines) => {
  const out = { props: {}, title: '', filetags: [] };
  let inDrawer = false;
  let drawerDone = false;
  linesOf(lines).forEach((raw) => {
    const line = String(raw || '').trim();
    if (inDrawer) {
      if (/^:END:$/i.test(line)) {
        inDrawer = false;
        drawerDone = true;
        return;
      }
      const m = /^:([^\s:]+):(?:\s+(.*))?$/.exec(line);
      if (m) out.props[m[1].toUpperCase()] = (m[2] || '').trim();
      return;
    }
    if (!drawerDone && /^:PROPERTIES:$/i.test(line)) {
      inDrawer = true;
      return;
    }
    const kw = /^#\+([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kw) return;
    const key = kw[1].toLowerCase();
    if (key === 'title' && !out.title) out.title = kw[2].trim();
    if (key === 'filetags') out.filetags.push(...parseTagList(kw[2]));
  });
  out.filetags = Array.from(new Set(out.filetags));
  return out;
};

// «:a:b:» o «a b» → ['a', 'b']
export const parseTagList = (text) =>
  String(text || '')
    .split(/[:\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

// :ROAM_ALIASES: «"Alias con espacios" otro» → ['Alias con espacios', 'otro']
export const parseAliases = (text) => {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    const v = (m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]).trim();
    if (v) out.push(v);
  }
  return out;
};

// :ROAM_EXCLUDE: activo («t», «yes»…; «nil», «no» o vacío = no)
export const isExcludeValue = (v) => {
  const s = String(v == null ? '' : v)
    .trim()
    .toLowerCase();
  return !!s && s !== 'nil' && s !== 'no' && s !== 'false';
};

// :ROAM_REFS: → [{ text, url }] (url solo para http(s); las citas «@clave» quedan como texto)
export const parseRefs = (text) =>
  parseAliases(text).map((t) => {
    const inner = /^\[\[([^\]]+)\](?:\[[^\]]*\])?\]$/.exec(t);
    const target = inner ? inner[1] : t;
    return { text: t, url: /^https?:\/\//i.test(target) ? target : null };
  });

const fileNameOf = (path) =>
  String(path || '')
    .split('/')
    .pop();
const baseName = (path) => fileNameOf(path).replace(/\.org(_archive)?(\.gpg|\.asc)?$/i, '');

const nodeCache = new WeakMap();

/**
 * Nodo del fichero (org-roam) o null si no tiene :ID: en el preámbulo. Tiene la forma de una
 * entrada del índice de cabeceras (headerId null, nivel 0) para reutilizar Backlinks.
 */
export const fileNodeOf = (path, file) => {
  const lines = file && file.get ? file.get('linesBeforeHeadings') : null;
  if (!lines) return null;
  if (typeof lines === 'object' && nodeCache.has(lines)) {
    const hit = nodeCache.get(lines);
    if (hit.path === path) return hit.node;
  }
  const pre = parsePreamble(lines);
  const orgId = (pre.props.ID || '').trim();
  const node = orgId
    ? {
        path,
        headerId: null,
        isFile: true,
        orgId,
        title: pre.title || baseName(path),
        rawTitle: pre.title || baseName(path),
        aliases: parseAliases(pre.props.ROAM_ALIASES),
        exclude: isExcludeValue(pre.props.ROAM_EXCLUDE),
        refs: parseRefs(pre.props.ROAM_REFS),
        level: 0,
        parents: [],
        ancestorPos: [],
        ownTags: pre.filetags,
        tags: pre.filetags,
        keyword: null,
        notes: '',
        linkText: '',
        pos: -1,
      }
    : null;
  if (typeof lines === 'object') nodeCache.set(lines, { path, node });
  return node;
};

// Información del preámbulo para el índice de cabeceras (etiquetas y exclusión heredadas)
export const fileRoamInfo = (file) => {
  const lines = file && file.get ? file.get('linesBeforeHeadings') : null;
  if (!lines) return { filetags: [], exclude: false };
  const pre = parsePreamble(lines);
  return { filetags: pre.filetags, exclude: isExcludeValue(pre.props.ROAM_EXCLUDE) };
};

const isUserPath = (path) =>
  !!path && typeof path === 'string' && path.startsWith('/') && !path.startsWith('/__');

// Nodos de fichero de los ficheros cargados
export const fileNodes = (files) => {
  const out = [];
  if (!files || typeof files.forEach !== 'function') return out;
  files.forEach((file, path) => {
    if (!isUserPath(path)) return;
    const n = fileNodeOf(path, file);
    if (n) out.push(n);
  });
  return out;
};

export const findFileNodeById = (files, id) => {
  const want = String(id || '')
    .trim()
    .toLowerCase();
  if (!want) return null;
  return fileNodes(files).find((n) => n.orgId.toLowerCase() === want) || null;
};

// --- Notas nuevas (como org-roam: un fichero por nota) ---

// Como org-roam-node-slug: sin tildes, minúsculas, lo que no es letra o cifra → «_»
export const slugify = (title) =>
  String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'nota';

export const newNoteFileText = (title, orgId) =>
  `:PROPERTIES:\n:ID:       ${orgId}\n:END:\n#+title: ${String(title || '').trim()}\n\n`;

// Primera ruta libre: dir/slug.org, dir/slug_2.org…
export const freeNotePath = (dir, title, exists) => {
  const d = String(dir || '/').endsWith('/') ? dir : `${dir}/`;
  const slug = slugify(title);
  for (let i = 1; i < 100; i++) {
    const p = `${d}${slug}${i === 1 ? '' : `_${i}`}.org`;
    if (!exists(p)) return p;
  }
  return `${d}${slug}_${Date.now()}.org`;
};

// --- Enlaces dentro de un texto ---

export const LINK_RE = /\[\[((?:[^\]\\]|\\.)+)\](?:\[([^\]]*)\])?\]/g;

// Cada enlace del texto → [{ uri, desc, index, length }]
export const linksIn = (text) => {
  const out = [];
  const s = String(text || '');
  const re = new RegExp(LINK_RE.source, 'g');
  let m;
  while ((m = re.exec(s))) {
    out.push({ uri: m[1].trim(), desc: m[2] || '', index: m.index, length: m[0].length });
  }
  return out;
};

/**
 * Reescribe los enlaces cuyo uri cumple `match(uri)`:
 *   mode 'text'    → su descripción (o el destino sin prefijo)
 *   mode 'remove'  → nada (y se quita un espacio sobrante)
 *   mode 'retarget'→ mismo enlace con `newUri` (y `newDesc` si no tenía descripción)
 */
export const rewriteLinks = (text, match, mode, { newUri = null, newDesc = '' } = {}) => {
  const s = String(text || '');
  if (!s.includes('[[')) return s;
  let out = s.replace(new RegExp(LINK_RE.source, 'g'), (whole, uri, desc) => {
    if (!match(uri.trim())) return whole;
    if (mode === 'text') return desc || linkTargetText(uri.trim());
    if (mode === 'remove') return '\u0000';
    if (mode === 'retarget' && newUri) {
      const d = desc || newDesc;
      return d ? `[[${newUri}][${d}]]` : `[[${newUri}]]`;
    }
    return whole;
  });
  if (out.includes('\u0000')) {
    out = out
      .replace(/[ \t]*\u0000[ \t]*/g, (m) => (/^[ \t]/.test(m) && /[ \t]$/.test(m) ? ' ' : ''))
      .replace(/\u0000/g, '');
  }
  return out;
};

// Texto de un destino sin prefijo: «id:X» → X, «file:a/b.org::*T» → T (o b.org), «*T» → T
export const linkTargetText = (uri) => {
  const u = String(uri || '').trim();
  const search = /::\s*\*?(.+)$/.exec(u);
  if (search) return search[1].trim();
  if (/^id:/i.test(u)) return u.slice(3).trim();
  if (/^file:/i.test(u)) return fileNameOf(u.slice(5));
  return u.replace(/^[*#]/, '');
};

// --- Menciones sin enlazar ---

// Texto con los enlaces y los cajones tapados (mismas posiciones) para buscar menciones
const maskLinks = (text) => String(text || '').replace(LINK_RE, (m) => ' '.repeat(m.length));
const maskDrawers = (text) =>
  String(text || '').replace(/^[ \t]*:[A-Za-z_-]+:[ \t]*\n[\s\S]*?^[ \t]*:END:[ \t]*$/gim, (m) =>
    m.replace(/[^\n]/g, ' ')
  );

const phraseRe = (phrases, flags = 'iu') => {
  const list = Array.from(new Set((phrases || []).map((p) => String(p || '').trim())))
    .filter((p) => p.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])(${list.map(escapeRe).join('|')})(?=$|[^\\p{L}\\p{N}_])`,
    flags
  );
};

// Primera mención (fuera de enlaces) → { index, length, text } o null
export const findMention = (text, phrases) => {
  const re = phraseRe(phrases);
  if (!re) return null;
  const masked = maskDrawers(maskLinks(text));
  const m = re.exec(masked);
  if (!m) return null;
  const index = m.index + m[1].length;
  return { index, length: m[2].length, text: String(text).substr(index, m[2].length) };
};

/**
 * Cabeceras del índice que mencionan el título o un alias de `self` sin enlazarlo.
 * → [{ entry, where: 'title' | 'notes', text }]
 */
export const unlinkedMentions = (index, self) => {
  if (!self || !self.orgId) return [];
  const phrases = [self.title, ...(self.aliases || [])];
  if (!phraseRe(phrases)) return [];
  const out = [];
  (index || []).forEach((e) => {
    if (e.exclude) return;
    if (!self.isFile && e.path === self.path && e.headerId === self.headerId) return;
    if (e.orgId && e.orgId.toLowerCase() === self.orgId.toLowerCase()) return;
    const inTitle = findMention(e.rawTitle, phrases);
    if (inTitle) {
      out.push({ entry: e, where: 'title', text: inTitle.text });
      return;
    }
    const inNotes = findMention(e.notes, phrases);
    if (inNotes) out.push({ entry: e, where: 'notes', text: inNotes.text });
  });
  return out;
};

// Enlaza la primera mención de `phrases` en `text` → [[id:X][texto tal cual]]
export const linkFirstMention = (text, phrases, orgId) => {
  const hit = findMention(text, phrases);
  if (!hit) return text;
  const s = String(text);
  return `${s.slice(0, hit.index)}[[id:${orgId}][${hit.text}]]${s.slice(hit.index + hit.length)}`;
};

// --- Renombrar: descripciones de los enlaces que muestran el título antiguo ---

const sameTitle = (a, b) => normalize(a).trim() === normalize(b).trim();

export const countRenamable = (text, orgId, oldTitle) =>
  linksIn(text).filter(
    (l) =>
      /^id:/i.test(l.uri) &&
      l.uri.slice(3).trim().toLowerCase() === String(orgId).toLowerCase() &&
      l.desc &&
      sameTitle(l.desc, oldTitle)
  ).length;

export const renameLinkDescriptions = (text, orgId, oldTitle, newTitle) => {
  const s = String(text || '');
  if (!s.includes('[[')) return s;
  const clean = String(newTitle || '')
    .replace(/[[\]]/g, '')
    .trim();
  if (!clean) return s;
  return s.replace(new RegExp(LINK_RE.source, 'g'), (whole, uri, desc) => {
    const u = uri.trim();
    if (!/^id:/i.test(u) || u.slice(3).trim().toLowerCase() !== String(orgId).toLowerCase())
      return whole;
    if (!desc || !sameTitle(desc, oldTitle)) return whole;
    return `[[${u}][${clean}]]`;
  });
};

// --- Enlaces rotos ---

const dirOf = (path) => {
  const i = String(path || '').lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '/';
};

// Resuelve una ruta de enlace relativa al fichero que la contiene → ruta absoluta normalizada
export const resolvePath = (fromPath, target) => {
  let t = String(target || '').trim();
  if (t.startsWith('~/')) t = t.slice(1);
  const abs = t.startsWith('/') ? t : dirOf(fromPath) + t;
  const parts = [];
  abs.split('/').forEach((p) => {
    if (!p || p === '.') return;
    if (p === '..') parts.pop();
    else parts.push(p);
  });
  return `/${parts.join('/')}`;
};

// Ruta relativa de `to` vista desde el fichero `fromPath`
export const relativePath = (fromPath, to) => {
  const a = dirOf(fromPath).split('/').filter(Boolean);
  const b = String(to || '')
    .split('/')
    .filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rest = b.slice(i).join('/');
  return up ? `${'../'.repeat(up)}${rest}` : rest;
};

const SKIP_SCHEMES = /^(https?|mailto|ftp|attachment|elisp|shell|help|info|doi|news|tel|irc|cite|roam|calendar|bbdb|docview|rmail|gnus|mhe|w3m|youtube|yt|eww|org-protocol):/i;

/**
 * Clasifica un enlace → null (no se comprueba) o { kind, key, ... }:
 *   id      → { id }
 *   file    → { file (absoluta), search }
 *   heading → { file (este), search } ([[*Título]] / [[#custom]])
 */
export const classifyLink = (uri, fromPath) => {
  const u = String(uri || '').trim();
  if (!u || SKIP_SCHEMES.test(u)) return null;
  if (/^id:/i.test(u)) {
    const id = u.slice(3).trim();
    return id ? { kind: 'id', id, key: `id:${id.toLowerCase()}` } : null;
  }
  if (u.startsWith('*') || u.startsWith('#')) {
    return { kind: 'heading', file: fromPath, search: u, key: `h:${fromPath}::${u}` };
  }
  let rest = null;
  if (/^file:/i.test(u)) rest = u.slice(5);
  else if (/^(\.{1,2}\/|~\/|\/)/.test(u)) rest = u;
  if (rest === null) return null;
  const [file, ...searchParts] = rest.split('::');
  if (!file.trim()) return null;
  const abs = resolvePath(fromPath, file);
  const search = searchParts.join('::').trim() || null;
  return {
    kind: search ? 'heading' : 'file',
    file: abs,
    search,
    relative: !file.trim().startsWith('/'),
    key: search ? `h:${abs}::${search}` : `f:${abs.toLowerCase()}`,
  };
};

// Textos con enlaces de una cabecera → [{ where, text }] (título, notas, propiedades)
const headerTexts = (h) => {
  const out = [{ where: 'title', text: h.getIn(['titleLine', 'rawTitle']) || '' }];
  out.push({ where: 'notes', text: h.get('rawDescription') || '' });
  (h.get('propertyListItems') || []).forEach((p) => {
    const v = p.get('value');
    const text =
      v == null
        ? ''
        : typeof v === 'string'
        ? v
        : v.map((part) => (part.get ? part.get('contents') : '') || '').join('');
    out.push({ where: `prop:${p.get('property')}`, text: typeof text === 'string' ? text : '' });
  });
  return out;
};

const isArchivePath = (p) => /\.org_archive$/i.test(p || '');
const isBackupPath = (p) => /\/backups?\//i.test(p || '');

/**
 * Busca los enlaces rotos en `files` (Map ruta → fichero). `ctx`:
 *   existsFile(path) → ¿existe el fichero? (lista de la carpeta)
 *   resolveId(id)    → ¿hay cabecera o fichero con ese ID? (en todos los cargados, archivo incluido)
 *   findHeading(path, search) → ¿existe la cabecera en ese fichero cargado? (undefined = no cargado)
 *   isVirtualId(id)  → IDs que la app resuelve sola (días del diario)
 *   ignored: Set de claves
 * → [{ key, kind, label, target, occurrences: [{ path, headerId, title, where, uri, desc }] }]
 */
export const scanBrokenLinks = (files, ctx = {}) => {
  const groups = new Map();
  const ignored = ctx.ignored || new Set();
  if (!files || typeof files.forEach !== 'function') return [];
  files.forEach((file, path) => {
    if (!isUserPath(path) || isArchivePath(path) || isBackupPath(path)) return;
    const headers = file && file.get && file.get('headers');
    if (!headers) return;
    headers.forEach((h) => {
      headerTexts(h).forEach(({ where, text }) => {
        if (!text || !text.includes('[[')) return;
        linksIn(text).forEach((l) => {
          const c = classifyLink(l.uri, path);
          if (!c || ignored.has(c.key)) return;
          let broken = false;
          if (c.kind === 'id') {
            broken = !(ctx.isVirtualId && ctx.isVirtualId(c.id)) && !ctx.resolveId(c.id);
          } else if (c.kind === 'file') {
            broken = !ctx.existsFile(c.file);
          } else if (c.kind === 'heading') {
            if (!ctx.existsFile(c.file)) broken = true;
            else {
              const found = ctx.findHeading(c.file, c.search);
              broken = found === false;
            }
          }
          if (!broken) return;
          if (!groups.has(c.key)) {
            groups.set(c.key, {
              key: c.key,
              kind: c.kind,
              target: c,
              label:
                c.kind === 'id'
                  ? `id:${c.id}`
                  : c.kind === 'file'
                  ? c.file
                  : `${c.file === path ? '' : `${fileNameOf(c.file)} › `}${c.search}`,
              occurrences: [],
            });
          }
          groups.get(c.key).occurrences.push({
            path,
            headerId: h.get('id'),
            title: (h.getIn(['titleLine', 'rawTitle']) || '').trim(),
            where,
            uri: l.uri,
            desc: l.desc,
          });
        });
      });
    });
  });
  return Array.from(groups.values()).sort(
    (a, b) => b.occurrences.length - a.occurrences.length || a.label.localeCompare(b.label)
  );
};

// Nº de apariciones de un resultado del escaneo
export const brokenCount = (groups) => (groups || []).reduce((n, g) => n + g.occurrences.length, 0);

// Título que se propone para una nota nueva que repara el grupo (descripción más usada)
export const groupTitle = (group) => {
  const counts = new Map();
  group.occurrences.forEach((o) => {
    const d = (o.desc || '').trim();
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  });
  const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  return linkTargetText(group.occurrences[0] ? group.occurrences[0].uri : group.label);
};

/**
 * Sugerencias para reparar un grupo → [{ label, kind: 'node' | 'file', node?, path? }]
 *   nodes: índice de nodos [{ path, headerId, orgId, title, aliases }] (cabeceras y ficheros)
 *   allPaths: rutas de la carpeta (para «fichero renombrado/movido»)
 */
export const repairSuggestions = (group, { nodes = [], allPaths = [] } = {}) => {
  const out = [];
  const seen = new Set();
  const add = (s, k) => {
    if (seen.has(k) || out.length >= 5) return;
    seen.add(k);
    out.push(s);
  };
  if (group.kind === 'file' || (group.kind === 'heading' && group.target.file)) {
    const name = fileNameOf(group.target.file).toLowerCase();
    allPaths
      .filter((p) => fileNameOf(p).toLowerCase() === name && p !== group.target.file)
      .forEach((p) => add({ kind: 'file', path: p, label: `Fichero movido: ${p}` }, `f:${p}`));
  }
  const wanted = [groupTitle(group)];
  if (group.kind === 'heading') wanted.push(linkTargetText(group.target.search));
  const words = wanted.map((w) => normalize(w).trim()).filter((w) => w.length >= 2);
  if (words.length) {
    const scored = [];
    nodes.forEach((n) => {
      const names = [n.title, ...(n.aliases || [])].map((t) => normalize(t || '').trim());
      let score = 0;
      words.forEach((w) =>
        names.forEach((t) => {
          if (!t) return;
          if (t === w) score = Math.max(score, 3);
          else if (t.startsWith(w) || w.startsWith(t)) score = Math.max(score, 2);
          else if (t.includes(w) || (t.length >= 4 && w.includes(t))) score = Math.max(score, 1);
        })
      );
      if (score) scored.push({ n, score });
    });
    scored
      .sort((a, b) => b.score - a.score || a.n.title.length - b.n.title.length)
      .forEach(({ n }) =>
        add(
          {
            kind: 'node',
            node: n,
            label: `${n.title} · ${fileNameOf(n.path)}`,
          },
          `n:${n.path}:${n.headerId}`
        )
      );
  }
  return out;
};

// --- Ignorados (localStorage eliBrokenLinksIgnored: viaja entre dispositivos) ---
export const IGNORED_KEY = 'eliBrokenLinksIgnored';
export const readIgnored = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(IGNORED_KEY) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch (e) {
    return new Set();
  }
};
export const writeIgnored = (set) => {
  try {
    window.localStorage.setItem(IGNORED_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
};
