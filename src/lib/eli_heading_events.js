// ORG Mode para Eli (4.31): abrir las vistas de cabeceras (componente EliHeadingViews)
export const openTagView = (tag) =>
  window.dispatchEvent(new CustomEvent('eli:tag-view', { detail: { tag } }));
export const openBacklinks = (path, headerId) =>
  window.dispatchEvent(new CustomEvent('eli:backlinks', { detail: { path, headerId } }));
