// ORG Mode para Eli (4.37): defensa contra bloqueos que se quedan puestos en el móvil.
// Varias vistas ponen una marca en <body> mientras están abiertas (`eli-hv-open` bloquea el
// desplazamiento, `eli-hdrag-on` quita la selección, `overflow:hidden` del editor
// de texto). Si una vista se cierra por un camino raro (gesto cancelado, desmontaje a medias) la
// marca puede quedarse y los toques siguientes no hacen lo esperado. Al tocar la pantalla se
// comprueba que cada marca tiene aún su vista abierta; si no, se suelta.
const LOCKS = [
  { cls: 'eli-hv-open', alive: '.eli-hv__overlay' },
  { cls: 'eli-hdrag-on', alive: '.eli-hdrag-ghost, .eli-hdrag-line' },
];

export const releaseStuckLocks = (doc = document) => {
  const body = doc.body;
  if (!body) return [];
  const released = [];
  LOCKS.forEach(({ cls, alive }) => {
    if (body.classList.contains(cls) && !doc.querySelector(alive)) {
      body.classList.remove(cls);
      released.push(cls);
    }
  });
  // el editor de texto bloquea el desplazamiento mientras está abierto
  if (
    body.style.overflow === 'hidden' &&
    !doc.querySelector('.eli-raw, .eli-print, .eli-hv__overlay')
  ) {
    body.style.overflow = '';
    released.push('overflow');
  }
  return released;
};

let installed = false;
export const installStuckLocks = () => {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', () => releaseStuckLocks(), true);
};
