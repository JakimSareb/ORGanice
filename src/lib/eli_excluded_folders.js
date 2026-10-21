// ORG Mode para Eli (4.12): carpetas excluidas del modo «Todos los ficheros .org,
// automáticamente». Ajuste `eliExcludedFolders` (texto: una carpeta por línea, p. ej. «/Archivo»).
// Una carpeta excluida deja fuera también todo lo que tiene dentro (subcarpetas incluidas).

const norm = (p) => {
  let s = String(p || '').trim();
  if (!s) return '';
  if (!s.startsWith('/')) s = '/' + s;
  return s.replace(/\/+$/, '');
};

export const parseExcludedFolders = (text) =>
  String(text || '')
    .split('\n')
    .map(norm)
    .filter((p, i, a) => p && a.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);

export const serializeExcludedFolders = (list) =>
  parseExcludedFolders((list || []).join('\n')).join('\n');

export const isInExcludedFolder = (path, folders) => {
  const p = String(path || '').toLowerCase();
  return (folders || []).some((f) => p.startsWith(norm(f).toLowerCase() + '/'));
};

export const withoutExcluded = (paths, folders) =>
  (paths || []).filter((p) => !isInExcludedFolder(p, folders));

// Todas las carpetas (y sus madres) en las que hay algún fichero, ordenadas
export const foldersOfPaths = (paths) => {
  const set = new Set();
  (paths || []).forEach((p) => {
    const parts = String(p || '')
      .split('/')
      .filter(Boolean);
    for (let i = 1; i < parts.length; i++) set.add('/' + parts.slice(0, i).join('/'));
  });
  return Array.from(set).sort();
};
