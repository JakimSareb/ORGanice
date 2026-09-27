// ORG Mode para Eli: arrastrar una tarea de la vista GTD a una lista o proyecto del menú lateral.
// Ratón: se arrastra al mover con el botón pulsado. Pantalla táctil: dejar pulsada la tarea un
// momento y después arrastrar (antes de eso, mover el dedo desplaza la lista como siempre).
import { useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 450;
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 10;

const dropIdAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  const target = el && el.closest && el.closest('[data-drop]');
  return target ? target.getAttribute('data-drop') : null;
};

// ORG Mode para Eli: deslizar una tarea (como en la hoja): a la derecha, hecha; a la izquierda,
// borrar. Se decide por la dirección del primer movimiento: horizontal = deslizar; vertical =
// desplazar la lista (dedo) o arrastrar a una lista (ratón). Se puede desactivar en Ajustes.
const SWIPE_RATIO = 1.5;
const outsideRow = (d, e) => {
  const r = d.rect;
  if (!r) return false;
  return e.clientX < r.left || e.clientX > r.right || Math.abs(e.clientY - d.y0) > 40;
};
const swipeThreshold = (el) => Math.min(110, Math.max(60, ((el && el.offsetWidth) || 300) * 0.3));

export default function useTaskDrag({ onDrop, onStart, onEnd, canSwipe, onSwipe }) {
  const drag = useRef(null);
  const handlers = useRef({ onDrop, onStart, onEnd, canSwipe, onSwipe });
  handlers.current = { onDrop, onStart, onEnd, canSwipe, onSwipe };
  const suppressClickUntil = useRef(0);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    const resetSwipe = (d) => {
      if (!d || !d.rowEl) return;
      const row = d.rowEl;
      const box = row.parentElement;
      row.style.transition = 'transform 0.18s ease';
      row.style.transform = '';
      setTimeout(() => {
        row.style.transition = '';
      }, 200);
      if (box) box.classList.remove('is-swiping', 'is-swipe-right', 'is-swipe-left', 'is-armed');
    };
    const cleanup = () => {
      const d = drag.current;
      if (!d) return;
      clearTimeout(d.timer);
      if (d.swiping) resetSwipe(d);
      if (d.ghost) d.ghost.remove();
      const wasActive = d.active;
      drag.current = null;
      setDragging(null);
      setDropTarget(null);
      if (wasActive && handlers.current.onEnd) handlers.current.onEnd();
    };
    const activate = () => {
      const d = drag.current;
      if (!d || d.active) return;
      d.active = true;
      const ghost = document.createElement('div');
      ghost.className = 'gtd-drag-ghost';
      ghost.textContent = d.task.title || '(sin título)';
      ghost.style.left = `${d.x}px`;
      ghost.style.top = `${d.y}px`;
      document.body.appendChild(ghost);
      d.ghost = ghost;
      setDragging(d.task.key);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(15);
        } catch (e) {}
      }
      if (handlers.current.onStart) handlers.current.onStart(d.task);
    };
    const move = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (d.swiping) {
        if (e.cancelable) e.preventDefault();
        // Con el ratón, si se sale de la fila (arriba, abajo o hacia el menú), pasa a arrastrar
        if (d.pointerType === 'mouse' && outsideRow(d, e)) {
          resetSwipe(d);
          d.swiping = false;
          activate();
        } else {
          d.dx = dx;
          d.rowEl.style.transform = `translateX(${dx}px)`;
          const box = d.rowEl.parentElement;
          if (box) {
            box.classList.toggle('is-swipe-right', dx > 0);
            box.classList.toggle('is-swipe-left', dx < 0);
            box.classList.toggle('is-armed', Math.abs(dx) >= swipeThreshold(d.rowEl));
          }
          return;
        }
      }
      if (!d.active) {
        const slop = d.pointerType === 'mouse' ? MOUSE_SLOP : TOUCH_SLOP;
        if (dist <= slop) return;
        if (
          d.canSwipe &&
          d.rowEl &&
          Math.abs(dx) > SWIPE_RATIO * Math.abs(dy) &&
          !(d.pointerType === 'mouse' && outsideRow(d, e))
        ) {
          clearTimeout(d.timer);
          d.swiping = true;
          d.dx = dx;
          const box = d.rowEl.parentElement;
          if (box) box.classList.add('is-swiping');
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (d.pointerType === 'mouse') {
          activate();
        } else {
          cleanup(); // es un desplazamiento, no un arrastre
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      if (d.ghost) {
        d.ghost.style.left = `${e.clientX}px`;
        d.ghost.style.top = `${e.clientY}px`;
      }
      const id = dropIdAt(e.clientX, e.clientY);
      if (id !== d.over) {
        d.over = id;
        setDropTarget(id);
      }
    };
    const up = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.swiping) {
        const dx = d.dx || 0;
        const task = d.task;
        const armed = Math.abs(dx) >= swipeThreshold(d.rowEl);
        suppressClickUntil.current = Date.now() + 400;
        cleanup();
        if (armed && handlers.current.onSwipe) {
          handlers.current.onSwipe(task, dx > 0 ? 'right' : 'left');
        }
        return;
      }
      if (!d.active) {
        cleanup();
        return;
      }
      const id = dropIdAt(e.clientX, e.clientY);
      const task = d.task;
      suppressClickUntil.current = Date.now() + 400;
      cleanup();
      if (id && handlers.current.onDrop) handlers.current.onDrop(task, id);
    };
    const cancel = () => cleanup();
    const touchMove = (e) => {
      const d = drag.current;
      if (d && (d.active || d.swiping) && e.cancelable) e.preventDefault();
    };
    const contextMenu = (e) => {
      if (drag.current && drag.current.pointerType !== 'mouse') e.preventDefault();
    };
    const key = (e) => e.key === 'Escape' && drag.current && cleanup();
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('contextmenu', contextMenu);
    window.addEventListener('keydown', key);
    drag.activate = activate;
    return () => {
      cleanup();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const onPointerDown = (task) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest && e.target.closest('button, input, textarea, select, a, label')) return;
    if (drag.current) return;
    drag.current = {
      task,
      pointerId: e.pointerId,
      pointerType: e.pointerType || 'mouse',
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      rowEl: e.currentTarget,
      rect: e.currentTarget && e.currentTarget.getBoundingClientRect(),
      canSwipe: !!(handlers.current.canSwipe && handlers.current.canSwipe(task)),
    };
    if (drag.current.pointerType !== 'mouse') {
      drag.current.timer = setTimeout(() => drag.activate && drag.activate(), LONG_PRESS_MS);
    }
  };

  // Tras soltar, el clic que llega después no debe abrir el editor
  const clickSuppressed = () => Date.now() < suppressClickUntil.current;

  return { onPointerDown, dragging, dropTarget, clickSuppressed };
}
