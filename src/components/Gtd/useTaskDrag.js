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

export default function useTaskDrag({ onDrop, onStart, onEnd }) {
  const drag = useRef(null);
  const handlers = useRef({ onDrop, onStart, onEnd });
  handlers.current = { onDrop, onStart, onEnd };
  const suppressClickUntil = useRef(0);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    const cleanup = () => {
      const d = drag.current;
      if (!d) return;
      clearTimeout(d.timer);
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
      if (!d.active) {
        if (d.pointerType === 'mouse') {
          if (dist <= MOUSE_SLOP) return;
          activate();
        } else {
          if (dist > TOUCH_SLOP) cleanup(); // es un desplazamiento, no un arrastre
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
      if (drag.current && drag.current.active && e.cancelable) e.preventDefault();
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
    };
    if (drag.current.pointerType !== 'mouse') {
      drag.current.timer = setTimeout(() => drag.activate && drag.activate(), LONG_PRESS_MS);
    }
  };

  // Tras soltar, el clic que llega después no debe abrir el editor
  const clickSuppressed = () => Date.now() < suppressClickUntil.current;

  return { onPointerDown, dragging, dropTarget, clickSuppressed };
}
