// ORG Mode para Eli (4.59): pdf.js se carga SOLO al abrir un PDF (no engorda el arranque).
// Los dos ficheros de pdf.js se copian tal cual al build (`url:`) y se importan en tiempo de
// ejecución, sin pasar por el empaquetador.
/* global window, document */
import libUrl from 'url:pdfjs-dist/legacy/build/pdf.min.mjs';
import workerUrl from 'url:pdfjs-dist/legacy/build/pdf.worker.min.mjs';

let loading = null;

// pdf.js 4 deja todo lo que exporta en `globalThis.pdfjsLib`: basta un <script type="module">
// (la CSP permite 'self'; un import() dinámico lo intentaría empaquetar Parcel)
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      reject(new Error('No se pudo cargar el visor de PDF'));
    };
    document.head.appendChild(s);
  });

export const loadPdfJs = () => {
  if (!loading) {
    const abs = (u) => new URL(u, window.location.href).href;
    loading = (window.pdfjsLib && window.pdfjsLib.getDocument
      ? Promise.resolve()
      : loadScript(abs(libUrl))
    )
      .then(() => {
        const lib = window.pdfjsLib;
        if (!lib || !lib.getDocument) throw new Error('No se pudo cargar el visor de PDF');
        lib.GlobalWorkerOptions.workerSrc = abs(workerUrl);
        return lib;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
};

// Abre un PDF desde sus bytes. Sin eval (la CSP no lo permite) y sin pedir nada fuera.
export const openPdfDocument = async (bytes) => {
  const lib = await loadPdfJs();
  return lib.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    disableAutoFetch: true,
    stopAtErrors: false,
  }).promise;
};

// Escala para que la página quepa de ancho (con zoom) sin pasarse del lienzo que aguanta un
// iPhone (~16 Mpx; se deja en 4 Mpx para no gastar memoria).
const MAX_PIXELS = 4 * 1024 * 1024;
export const canvasScale = (pageWidth, pageHeight, cssScale, dpr) => {
  let ratio = Math.min(dpr || 1, 2);
  const px = pageWidth * cssScale * ratio * (pageHeight * cssScale * ratio);
  if (px > MAX_PIXELS) ratio *= Math.sqrt(MAX_PIXELS / px);
  return ratio;
};
