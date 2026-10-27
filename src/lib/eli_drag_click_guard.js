// ORG Mode para Eli (4.44): al seleccionar texto con el ratón dentro de un cuadro de texto y
// soltar FUERA de él, el navegador manda un «click» al antepasado común (la lista, las notas, la
// cabecera…). Ese clic no lo ha hecho el usuario, pero la app lo tomaba como un toque de verdad:
// abría las notas enteras (el cursor saltaba al final), plegaba el elemento o cerraba la edición
// de la sección sin guardar lo escrito. Aquí se descarta ese clic antes de que llegue a nadie.

const TEXT_INPUT_TYPES = ['', 'text', 'search', 'url', 'email', 'tel', 'password', 'number'];

// El campo de texto (textarea, input de texto o contenteditable) que contiene `el`, o null
export const textFieldOf = (el) => {
  if (!el || !el.closest) return null;
  const f = el.closest('textarea, input, [contenteditable=""], [contenteditable="true"]');
  if (!f) return null;
  if (f.tagName === 'INPUT') {
    const type = (f.getAttribute('type') || '').toLowerCase();
    if (!TEXT_INPUT_TYPES.includes(type)) return null;
  }
  return f;
};

// ¿Es este clic el final de una selección que empezó dentro de `field` y acabó fuera?
export const isSpuriousClick = (field, clickTarget) =>
  !!field && !!clickTarget && field !== clickTarget && !field.contains(clickTarget);

let installed = false;

export const installDragClickGuard = (win = typeof window !== 'undefined' ? window : null) => {
  if (!win || installed) return;
  installed = true;
  let field = null;
  win.addEventListener(
    'pointerdown',
    (e) => {
      // con el dedo el clic sale donde se toca: no hace falta
      field = e.pointerType === 'touch' ? null : textFieldOf(e.target);
    },
    true
  );
  win.addEventListener(
    'click',
    (e) => {
      const f = field;
      field = null;
      if (!f || !f.isConnected) return;
      if (isSpuriousClick(f, e.target)) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );
};
