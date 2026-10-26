// ORG Mode para Eli (4.35): estilo de viñeta «Triángulos». ▸ si la cabecera tiene contenido y está
// plegada, ▾ si está desplegada y un punto discreto si no tiene contenido.
export const TRIANGLES_STYLE = 'Triangles';

export const triangleGlyph = (hasContent, opened) => {
  if (!hasContent) return '•';
  return opened ? '▾' : '▸';
};
