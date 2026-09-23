// ORG Mode para Eli: preparación de imágenes antes de subirlas (tamaños y compresión).

export const IMAGE_SIZES = [
  { id: 'small', label: 'Pequeña', max: 800 },
  { id: 'medium', label: 'Mediana', max: 1600 },
  { id: 'large', label: 'Grande', max: 2560 },
  { id: 'original', label: 'Original', max: null },
];

const RESIZABLE = /^image\/(jpeg|png|webp|heic|heif|bmp|avif)$/i;
const JPEG_QUALITY = 0.85;

export const isResizableImage = (file) =>
  !!file && (RESIZABLE.test(file.type || '') || /\.(jpe?g|png|webp|heic|heif|bmp|avif)$/i.test(file.name || ''));

export const formatBytes = (n) => {
  if (n == null) return '…';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

const pad = (n) => String(n).padStart(2, '0');

// Nombre para imágenes pegadas desde el portapapeles (suelen llamarse "image.png")
export const pastedName = (file, date = new Date()) => {
  const generic = !file.name || /^(image|imagen|blob|pasted.*)\.(png|jpe?g|gif|webp|heic|tiff?)$/i.test(file.name);
  if (!generic) return file.name;
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return (
    `pegado-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.${ext}`
  );
};

const withExtension = (name, ext) => name.replace(/\.[^.]+$/, '') + '.' + ext;

const decode = async (file) => {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch (e) {
      // p. ej. HEIC en navegadores que no lo decodifican con esta API: se prueba con <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

const hasTransparency = (source, w, h) => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir'))), type, quality)
  );

/**
 * Prepara las cuatro variantes de una imagen. Devuelve
 * { width, height, variants: { small|medium|large|original: File } }.
 * Si la imagen no se puede decodificar, solo devuelve 'original'.
 */
export const prepareImageVariants = async (file, name = file.name) => {
  const original = new File([file], name, { type: file.type });
  let source;
  try {
    source = await decode(file);
  } catch (e) {
    return { width: null, height: null, variants: { original } };
  }
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const alpha = /png|webp/i.test(file.type) && hasTransparency(source, width, height);
  const type = alpha ? 'image/png' : 'image/jpeg';
  const ext = alpha ? 'png' : 'jpg';
  const variants = { original };
  for (const size of IMAGE_SIZES) {
    if (!size.max) continue;
    const scale = Math.min(1, size.max / Math.max(width, height));
    if (scale === 1 && /jpe?g/i.test(file.type)) {
      variants[size.id] = original; // ya es más pequeña que el límite: no se recomprime
      continue;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, type, JPEG_QUALITY);
    // Si comprimir no reduce el tamaño, se usa el original
    variants[size.id] =
      blob.size < file.size ? new File([blob], withExtension(name, ext), { type }) : original;
  }
  if (source.close) source.close();
  return { width, height, variants };
};
