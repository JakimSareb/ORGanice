// ORG Mode para Eli (4.40): recuadro de selección en la lista de GTD (solo ratón). Pulsar en una
// zona vacía de la lista y arrastrar dibuja un recuadro semitransparente; al soltar quedan
// seleccionadas las tareas que el recuadro TOCA (no hace falta cubrirlas enteras). Con Ctrl/Cmd o
// Mayús se añaden a la selección actual. No hace auto-scroll. En el móvil no hay cambios.
import { useEffect, useRef } from 'react';

// Modelo puro: de [{ key, left, top, right, bottom }] y un recuadro { x0, y0, x1, y1 } (en
// cualquier orden de esquinas) → claves de las filas que se cruzan, en el orden recibido.
export const rowsTouching = (rects, box) => {
  const left = Math.min(box.x0, box.x1);
  const right = Math.max(box.x0, box.x1);
  const top = Math.min(box.y0, box.y1);
  const bottom = Math.max(box.y0, box.y1);
  return (rects || [])
    .filter((r) => r.right > left && r.left < right && r.bottom > top && r.top < bottom)
    .map((r) => r.key);
};

const THRESHOLD = 4;

export default function useMarquee({ onSelect, onEnd }) {
  const ref = useRef(null);
  const cb = useRef({ onSelect, onEnd });
  cb.current = { onSelect, onEnd };

  useEffect(() => {
    const rectsOf = (container) =>
      Array.from(container.querySelectorAll('[data-reorder-key]')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          key: el.getAttribute('data-reorder-key'),
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
        };
      });
    const paintBox = (m, x, y) => {
      if (!m.el) {
        m.el = document.createElement('div');
        m.el.className = 'gtd-marquee';
        m.el.setAttribute('data-testid', 'gtd-marquee');
        document.body.appendChild(m.el);
      }
      const left = Math.min(m.x0, x);
      const top = Math.min(m.y0, y);
      m.el.style.left = `${left}px`;
      m.el.style.top = `${top}px`;
      m.el.style.width = `${Math.abs(x - m.x0)}px`;
      m.el.style.height = `${Math.abs(y - m.y0)}px`;
    };
    const finish = () => {
      const m = ref.current;
      if (!m) return;
      ref.current = null;
      if (m.el) m.el.remove();
      if (m.moved && cb.current.onEnd) cb.current.onEnd();
    };
    const move = (e) => {
      const m = ref.current;
      if (!m || e.pointerId !== m.pointerId) return;
      if (!m.moved && Math.hypot(e.clientX - m.x0, e.clientY - m.y0) < THRESHOLD) return;
      m.moved = true;
      if (e.cancelable) e.preventDefault();
      paintBox(m, e.clientX, e.clientY);
      const keys = rowsTouching(rectsOf(m.container), {
        x0: m.x0,
        y0: m.y0,
        x1: e.clientX,
        y1: e.clientY,
      });
      cb.current.onSelect(keys, m.additive);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      finish();
    };
  }, []);

  // onPointerDown de la zona principal de GTD: solo ratón, botón izquierdo y solo si se pulsa en un
  // hueco (la propia zona o el propio contenedor de la lista), no sobre una tarea ni un botón
  const startMarquee = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const t = e.target;
    if (t !== e.currentTarget && !(t.hasAttribute && t.hasAttribute('data-reorder-container')))
      return;
    const container = e.currentTarget.querySelector('[data-reorder-container]');
    if (!container) return;
    e.preventDefault(); // sin selección de texto mientras se arrastra
    ref.current = {
      container,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      additive: e.ctrlKey || e.metaKey || e.shiftKey,
      moved: false,
      el: null,
    };
  };
  return { startMarquee };
}
