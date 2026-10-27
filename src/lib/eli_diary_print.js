// ORG Mode para Eli (4.37): anclas del PDF del Diario. Cada día lleva un `id` y, en el resumen
// mensual, cada fila con datos enlaza a su día (`#dia-AAAA-MM-DD`). Chromium/Mac conservan estos
// enlaces internos en el PDF.
export const dayAnchorId = (key) => `dia-${String(key || '').trim()}`;
export const dayAnchorHref = (key) => `#${dayAnchorId(key)}`;
