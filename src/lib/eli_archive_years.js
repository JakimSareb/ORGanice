// ORG Mode para Eli (4.33): «Agrupar archivo por años». Los árboles de nivel superior de los
// ficheros de archivo (*.org_archive) cerrados hace más de un año pasan a `archive-AAAA.org`
// (AAAA = año de cierre), en la misma carpeta que su archivo, al final. Fecha de cierre: CLOSED del
// propio encabezado; si falta, ARCHIVE_TIME. Sin fecha o de hace menos de un año: se quedan.
// Idempotente: un árbol que ya está en su fichero del año no se vuelve a añadir (y se quita del
// origen); relanzarlo sin nada nuevo no cambia nada. Primero se escribe el destino y luego se quita
// del origen. Aquí solo hay funciones puras.

export const yearArchiveName = (year) => `archive-${year}.org`;
export const isYearArchivePath = (p) => /(^|\/)archive-\d{4}\.org$/i.test(String(p || ''));

const dirOf = (p) => {
  const i = String(p || '').lastIndexOf('/');
  return i >= 0 ? p.slice(0, i + 1) : '/';
};
export const yearArchivePath = (archivePath, year) => dirOf(archivePath) + yearArchiveName(year);

export const newYearArchiveText = (year) => `#+TITLE: Archivo ${year}\n#+STARTUP: overview\n\n`;

const HEAD1 = /^\*\s/;
const ANY_HEAD = /^\*+\s/;

// Divide el texto en { head: [líneas antes del primer árbol], trees: [[líneas]] }
export const splitTopTrees = (text) => {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const head = [];
  const trees = [];
  lines.forEach((l) => {
    if (HEAD1.test(l)) trees.push([l]);
    else if (trees.length) trees[trees.length - 1].push(l);
    else head.push(l);
  });
  return { head, trees };
};

const toDate = (y, m, d) => new Date(+y, +m - 1, +d);

// Fecha de cierre del árbol: CLOSED de su encabezado (antes del primer subencabezado) o, si no
// hay, ARCHIVE_TIME
export const closedDateOf = (tree) => {
  const own = [];
  for (let i = 1; i < tree.length; i++) {
    if (ANY_HEAD.test(tree[i])) break;
    own.push(tree[i]);
  }
  const body = own.join('\n');
  const c = /CLOSED:\s*\[(\d{4})-(\d{2})-(\d{2})/.exec(body);
  if (c) return toDate(c[1], c[2], c[3]);
  const a = /^\s*:ARCHIVE_TIME:\s*(\d{4})-(\d{2})-(\d{2})/im.exec(body);
  if (a) return toDate(a[1], a[2], a[3]);
  return null;
};

// ¿Cerrado hace más de un año?
export const olderThanAYear = (date, now = new Date()) => {
  if (!date) return false;
  const limit = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return date < limit;
};

// Texto de un árbol, sin líneas vacías al final (para comparar y para añadir)
const treeText = (tree) => {
  const t = tree.slice();
  while (t.length && !t[t.length - 1].trim()) t.pop();
  return t.join('\n');
};

// Qué se mueve de un archivo: { keepText, moves: { año: [textoDelÁrbol] }, count }
export const planArchiveFile = (text, now = new Date()) => {
  const { head, trees } = splitTopTrees(text);
  const keep = [];
  const moves = {};
  let count = 0;
  trees.forEach((tree) => {
    const d = closedDateOf(tree);
    if (olderThanAYear(d, now)) {
      const y = d.getFullYear();
      (moves[y] = moves[y] || []).push(treeText(tree));
      count++;
    } else keep.push(tree);
  });
  if (!count) return { keepText: text, moves, count };
  const out = [...head];
  keep.forEach((t) => out.push(...t));
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return { keepText: out.length ? out.join('\n') + '\n' : '', moves, count };
};

// Añade al fichero del año los árboles que aún no estén (idempotente). Devuelve el texto nuevo
// (igual al de entrada si no hay nada que añadir).
export const appendTrees = (destText, trees, year) => {
  const base = destText || newYearArchiveText(year);
  const present = new Set(splitTopTrees(base).trees.map(treeText));
  const add = (trees || []).filter((t) => !present.has(t));
  if (!add.length) return base;
  let out = base;
  if (out && !out.endsWith('\n')) out += '\n';
  add.forEach((t) => {
    out += t + '\n';
    present.add(t);
  });
  return out;
};

// Resumen para confirmar: «Se moverán 37 árboles a 2023, 2024»
export const planSummary = (plans) => {
  const years = new Set();
  let n = 0;
  (plans || []).forEach((p) => {
    n += p.count;
    Object.keys(p.moves).forEach((y) => years.add(y));
  });
  if (!n) return '';
  const ys = Array.from(years).sort();
  return `Se moverá${n === 1 ? '' : 'n'} ${n} árbol${n === 1 ? '' : 'es'} a ${ys.join(', ')}`;
};
