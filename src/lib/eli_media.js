// ORG Mode para Eli: imágenes y contenido multimedia enlazado desde ficheros Org y
// almacenado en Dropbox (por convención en assets/AAAA, junto al fichero .org).

const IMAGE = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|svg|avif)$/i;
const VIDEO = /\.(mp4|m4v|mov|webm|ogv)$/i;
const AUDIO = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
// Formatos de los que Dropbox puede generar miniatura
const THUMBNAILABLE = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif)$/i;
const ORG = /\.org(_archive)?(\.gpg|\.asc)?$/i;

export const mediaKind = (path) => {
  if (!path) return null;
  if (IMAGE.test(path)) return 'image';
  if (VIDEO.test(path)) return 'video';
  if (AUDIO.test(path)) return 'audio';
  return 'file';
};

const hasExtension = (path) => /\/?[^/]+\.[A-Za-z0-9]{1,6}$/.test(path);

/**
 * Si `uri` es un enlace a un fichero (no .org) que debería abrirse desde Dropbox, devuelve su
 * ruta relativa al enlace (sin "file:" ni "::búsqueda"). Si no, null.
 * Acepta: file:assets/2026/a.jpg, file:./a.png, ./assets/a.png, ../x/a.pdf, /Notas/assets/a.jpg
 */
export const fileLinkTarget = (uri) => {
  if (!uri) return null;
  let target = uri.trim();
  if (/^file:/i.test(target)) target = target.slice(5);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // http:, mailto:, id:, etc.
  else if (!/^(\.{1,2}\/|\/)/.test(target) && !/^assets\//i.test(target)) return null;
  target = target.replace(/::.*$/, '');
  if (target.startsWith('~')) return null;
  if (ORG.test(target) || !hasExtension(target)) return null;
  return target;
};

// Resuelve la ruta del enlace respecto al directorio del fichero .org abierto.
export const resolveDropboxPath = (orgFilePath, target) => {
  if (!target) return null;
  let parts;
  if (target.startsWith('/')) {
    parts = target.split('/');
  } else {
    const dir = (orgFilePath || '/').replace(/\/[^/]*$/, '');
    parts = (dir + '/' + target).split('/');
  }
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (!out.length) return null; // fuera de la raíz accesible
      out.pop();
    } else out.push(p);
  }
  return '/' + out.join('/');
};

// --- Caché de objetos (URLs blob) en memoria ---------------------------------------------

const blobCache = new Map(); // clave -> Promise<string objectURL>

const cached = (key, loader) => {
  if (!blobCache.has(key)) {
    const promise = loader().catch((e) => {
      blobCache.delete(key);
      throw e;
    });
    blobCache.set(key, promise);
  }
  return blobCache.get(key);
};

export const loadPreviewUrl = (client, path) =>
  cached(`preview:${path}`, async () => {
    if (THUMBNAILABLE.test(path) && client.getThumbnailBlob) {
      try {
        return URL.createObjectURL(await client.getThumbnailBlob(path));
      } catch (e) {
        // sin miniatura (formato no admitido): se descarga el original
      }
    }
    const blob = await client.getFileBlob(path);
    const type = /\.svg$/i.test(path) ? 'image/svg+xml' : blob.type;
    return URL.createObjectURL(type && type !== blob.type ? new Blob([blob], { type }) : blob);
  });

export const loadTemporaryLink = (client, path) =>
  // Los enlaces temporales de Dropbox duran 4 horas; se guardan 3 como máximo.
  cached(`link:${path}:${Math.floor(Date.now() / (3 * 3600 * 1000))}`, () =>
    client.getTemporaryLink(path)
  );

/**
 * Abre el fichero en una pestaña nueva. La pestaña se abre de forma síncrona (dentro del clic)
 * para que Safari no la bloquee, y después se le asigna el enlace temporal de Dropbox.
 */
export const openInNewTab = (client, path) => {
  const w = window.open('', '_blank');
  if (w) {
    try {
      w.document.title = 'Abriendo…';
      w.document.body.textContent = 'Abriendo desde Dropbox…';
    } catch (e) {}
  }
  return loadTemporaryLink(client, path)
    .then((link) => {
      if (w) {
        w.opener = null;
        w.location.replace(link);
      } else {
        window.location.href = link;
      }
    })
    .catch((e) => {
      if (w) w.close();
      throw e;
    });
};

// --- Subida a assets/AAAA -----------------------------------------------------------------

export const sanitizeFileName = (name) =>
  (name || 'archivo')
    .replace(/[[\]]/g, '_')
    .replace(/[/\\]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\s+/g, '_') || 'archivo';

export const assetsDirFor = (orgFilePath, date = new Date()) => {
  const dir = (orgFilePath || '/').replace(/\/[^/]*$/, '');
  return `${dir}/assets/${date.getFullYear()}`;
};

// Ruta relativa desde el directorio del .org (lo que se escribe en el enlace Org)
export const relativeLinkFor = (orgFilePath, uploadedPath) => {
  const dir = (orgFilePath || '/').replace(/\/[^/]*$/, '') + '/';
  if (uploadedPath.toLowerCase().startsWith(dir.toLowerCase())) {
    return uploadedPath.slice(dir.length);
  }
  return uploadedPath;
};

export const orgLinkFor = (relativePath) => `[[file:${relativePath}]]`;

/**
 * Sube los ficheros a assets/AAAA y devuelve los enlaces Org a insertar.
 * @returns {Promise<string[]>}
 */
export const uploadAssets = async (client, orgFilePath, files) => {
  if (!client || !client.uploadBinaryFile) {
    throw new Error('La subida de archivos solo está disponible con Dropbox');
  }
  const dir = assetsDirFor(orgFilePath);
  const links = [];
  for (const file of files) {
    const uploadedPath = await client.uploadBinaryFile(`${dir}/${sanitizeFileName(file.name)}`, file);
    links.push(orgLinkFor(relativeLinkFor(orgFilePath, uploadedPath)));
  }
  return links;
};
