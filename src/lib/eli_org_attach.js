// ORG Mode para Eli (3.05): adjuntos de org-attach (Emacs), además de los enlaces file: de
// siempre. Un encabezado con adjuntos de org-attach lleva la etiqueta :ATTACH: y su carpeta es:
//   - la propiedad :DIR: (relativa al fichero .org), o
//   - con :ID:, data/<2 primeros caracteres>/<resto> (org-attach-id-dir = "data/" y el formato
//     de carpeta por defecto de Org para UUID), relativa al fichero .org.
// Los enlaces [[attachment:nombre]] apuntan a un fichero de esa carpeta.
import { fileLinkTarget, resolveDropboxPath } from './eli_media';
import { attributedStringToRawText } from './export_org';

export const ORG_ATTACH_DIR = 'data';

const propOf = (header, name) => {
  if (!header || !header.get) return null;
  const item = (header.get('propertyListItems') || []).find(
    (p) => (p.get('property') || '').toUpperCase() === name
  );
  if (!item || !item.get('value')) return null;
  const v = attributedStringToRawText(item.get('value')).trim();
  return v || null;
};

const ownTagsOf = (header) =>
  (header && header.getIn && header.getIn(['titleLine', 'tags'])
    ? header.getIn(['titleLine', 'tags']).toArray()
    : []
  ).map((t) => String(t));

export const hasAttachTag = (header) => ownTagsOf(header).some((t) => t.toUpperCase() === 'ATTACH');

// Carpeta de org-attach del encabezado, relativa al fichero .org (o null)
export const orgAttachDir = (header) => {
  const dir = propOf(header, 'DIR');
  if (dir) {
    // rutas del propio ordenador (~/…, C:\…) no se pueden alcanzar desde Dropbox/la carpeta
    if (/^~|^[A-Za-z]:[\\/]|^[a-z][a-z0-9+.-]*:/i.test(dir)) return null;
    return dir.replace(/\/+$/, '');
  }
  const id = propOf(header, 'ID');
  if (!id || id.length < 3) return null;
  const clean = id.replace(/[^A-Za-z0-9_-]/g, '');
  if (clean.length < 3) return null;
  return `${ORG_ATTACH_DIR}/${clean.slice(0, 2)}/${clean.slice(2)}`;
};

// Destino (relativo al fichero .org) de un enlace, también [[attachment:x]]; si no es un
// fichero, null
export const linkTargetFor = (uri, header) => {
  if (!uri) return null;
  const m = /^attachment:(.+)$/i.exec(uri.trim());
  if (m) {
    const dir = orgAttachDir(header);
    const name = m[1].replace(/::.*$/, '').trim();
    if (!dir || !name || name.startsWith('/') || name.includes('..')) return null;
    return `${dir}/${name}`;
  }
  return fileLinkTarget(uri);
};

// Carpeta de org-attach con ruta completa (Dropbox/carpeta), solo si lleva :ATTACH: o :DIR:
export const orgAttachDirPath = (header, orgPath) => {
  if (!hasAttachTag(header) && !propOf(header, 'DIR')) return null;
  const dir = orgAttachDir(header);
  return dir ? resolveDropboxPath(orgPath, dir) : null;
};
