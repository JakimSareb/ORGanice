// ORG Mode para Eli (4.54): exportar a HTML AUTOCONTENIDO (un solo fichero con su CSS) lo que se
// ve en la vista previa de impresión (una cabecera con sus subcabeceras, o el fichero entero).
// Se parte del DOM ya dibujado (títulos, tablas, enlaces, listas con casillas) y se limpia:
//  · fuera lo que no es del documento (barras, reproductores de vídeo/audio, scripts);
//  · las casillas pasan a ☐ ☑ ▣ (no dependen de la fuente de iconos);
//  · los enlaces propios de la app (rutas internas) quedan como texto; los externos se conservan;
//  · las fotos se incrustan (data:) para que el fichero se pueda mover o enviar.
import { createDownloadableFile } from './share_utils';

export const EXPORT_CSS = `
body{margin:0;background:#fff;color:#222;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55}
main{max-width:46em;margin:0 auto;padding:24px 18px 60px}
.eli-print__doctitle{font-size:1.8em;margin:.2em 0 .6em}
.eli-print__heading{margin:1.1em 0 .25em;line-height:1.3}
h1.eli-print__heading{font-size:1.45em}h2.eli-print__heading{font-size:1.25em}h3.eli-print__heading{font-size:1.1em}
h4.eli-print__heading,h5.eli-print__heading,h6.eli-print__heading{font-size:1em}
.eli-print__todo{font-weight:bold;color:#cb4b16}.eli-print__todo--done{color:#859900}
.eli-print__tags{float:right;font-weight:normal;font-size:.75em;color:#888;font-family:Menlo,Courier,monospace}
.eli-print__planning{font-family:Menlo,Courier,monospace;font-size:.8em;color:#666}
.eli-print__body{white-space:pre-wrap}
.eli-print__encrypted{font-style:italic;color:#888}
img{max-width:100%;height:auto}
table{border-collapse:collapse;white-space:normal;margin:.4em 0}
td,th{border:1px solid #ccc;padding:3px 8px;text-align:left;vertical-align:top}
a{color:#268bd2}
code,pre{font-family:Menlo,Courier,monospace;font-size:.9em}
.eli-export__box{font-family:Menlo,Courier,monospace}
@media print{main{max-width:none;padding:0}.eli-print__heading{break-after:avoid}}
`;

const escapeHtml = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

// Limpia un DOM (ya clonado) para exportarlo. Devuelve el mismo nodo.
export const cleanForExport = (root) => {
  root
    .querySelectorAll('.eli-no-print, script, style, .eli-media__player, video, audio, iframe')
    .forEach((n) => n.remove());
  // casillas: ☐ ☑ ▣ en vez de los iconos de la app
  root.querySelectorAll('.checkbox').forEach((box) => {
    const checked = !!box.querySelector('.fa-check');
    const partial = !!box.querySelector('.fa-minus');
    const span = root.ownerDocument.createElement('span');
    span.className = 'eli-export__box';
    span.textContent = checked ? '☑' : partial ? '▣' : '☐';
    box.replaceWith(span);
  });
  // enlaces: solo los externos
  root.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (EXTERNAL.test(href)) {
      a.setAttribute('rel', 'noopener');
      a.removeAttribute('class');
      a.removeAttribute('style');
      return;
    }
    a.replaceWith(...Array.from(a.childNodes));
  });
  // atributos que solo sirven dentro de la app
  root.querySelectorAll('*').forEach((el) => {
    ['data-testid', 'onclick', 'tabindex', 'contenteditable', 'draggable'].forEach((n) =>
      el.removeAttribute(n)
    );
  });
  return root;
};

// Fotos: de `blob:` a `data:` (un fichero que se pueda mover). Si una no se puede leer, se deja.
export const inlineImages = async (root, fetchFn = (u) => fetch(u)) => {
  const imgs = Array.from(root.querySelectorAll('img')).filter((i) =>
    /^blob:/i.test(i.getAttribute('src') || '')
  );
  await Promise.all(
    imgs.map(async (img) => {
      try {
        const blob = await (await fetchFn(img.getAttribute('src'))).blob();
        const data = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        img.setAttribute('src', data);
      } catch (e) {
        // se queda como estaba
      }
    })
  );
  return root;
};

export const buildExportHtml = ({ title, bodyHtml }) =>
  `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
  `<title>${escapeHtml(title)}</title>\n<style>${EXPORT_CSS}</style>\n</head>\n` +
  `<body>\n<main>\n${bodyHtml}\n</main>\n</body>\n</html>\n`;

export const exportFileName = (title) =>
  `${
    String(title || 'documento')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'documento'
  }.html`;

// Del DOM de la vista previa al fichero HTML completo (texto)
export const htmlFromDocElement = async (docEl, title) => {
  const clone = docEl.cloneNode(true);
  cleanForExport(clone);
  await inlineImages(clone);
  return buildExportHtml({ title, bodyHtml: clone.innerHTML });
};

// Descarga el fichero (en el iPhone se abre la hoja de compartir/guardar del sistema)
export const downloadHtml = async (docEl, title) => {
  const html = await htmlFromDocElement(docEl, title);
  createDownloadableFile(html, exportFileName(title), 'text/html;charset=utf-8');
  return html;
};
