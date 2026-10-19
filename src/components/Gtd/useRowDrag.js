// ORG Mode para Eli (3.0): arrastrar tareas como en Nirvana. Se arrastra la fila entera (o las
// seleccionadas, si la fila está en la selección):
//   - soltando en una lista, proyecto, Focus, Logbook o Papelera del menú lateral → onDrop
//   - soltando dentro de la lista → reordenar (una sola tarea), con una línea que marca el sitio
// Ratón: se arrastra al mover con el botón pulsado. Dedo: dejar pulsada un momento y arrastrar.
// Deslizar en horizontal (sin salir de la fila) sigue siendo: derecha = hecha, izquierda = papelera.
import { useEffect, useRef, useState } from 'react';
import { dropPositionAt } from './useReorderDrag';

const LONG_PRESS_MS = 450;
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 10;
const SWIPE_RATIO = 1.5;
const EDGE = 60;
// (3.16) con el dedo, el menú lateral (listas) solo se abre al acercar la tarea al borde izquierdo
const SIDE_EDGE = 40;
const SPEED = 14;

const dropIdAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  const target = el && el.closest && el.closest('[data-drop]');
  return target ? target.getAttribute('data-drop') : null;
};
const outsideRow = (d, e) => {
  const r = d.rect;
  if (!r) return false;
  return e.clientX < r.left || e.clientX > r.right || Math.abs(e.clientY - d.y0) > 40;
};
const swipeThreshold = (el) => Math.min(110, Math.max(60, ((el && el.offsetWidth) || 300) * 0.3));
const scrollParentOf = (el) => {
  let node = el && el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
};

export default function useRowDrag({
  onDrop,
  onReorder,
  onStart,
  onNearEdge,
  canSwipe,
  onSwipe,
  dragSet,
  canReorder,
}) {
  const drag = useRef(null);
  const activateRef = useRef(null);
  const handlers = useRef({});
  handlers.current = {
    onDrop,
    onReorder,
    onStart,
    onNearEdge,
    canSwipe,
    onSwipe,
    dragSet,
    canReorder,
  };
  const suppressClickUntil = useRef(0);
  const [dragging, setDragging] = useState(null); // claves que se arrastran
  const [dropTarget, setDropTarget] = useState(null);
  const [dropSection, setDropSection] = useState(null);

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
    const stopAutoScroll = (d) => {
      if (d && d.scrollTimer) {
        clearInterval(d.scrollTimer);
        d.scrollTimer = null;
      }
    };
    const cleanup = () => {
      const d = drag.current;
      if (!d) return;
      clearTimeout(d.timer);
      stopAutoScroll(d);
      if (d.swiping) resetSwipe(d);
      if (d.ghost) d.ghost.remove();
      if (d.line) d.line.remove();
      drag.current = null;
      setDragging(null);
      setDropTarget(null);
      setDropSection(null);
    };
    const activate = () => {
      const d = drag.current;
      if (!d || d.active) return;
      d.active = true;
      const set = (handlers.current.dragSet && handlers.current.dragSet(d.task)) || [d.task];
      d.tasks = set;
      d.reorder =
        set.length === 1 && !!(handlers.current.canReorder && handlers.current.canReorder(d.task));
      const ghost = document.createElement('div');
      ghost.className = 'gtd-drag-ghost';
      ghost.textContent =
        set.length > 1 ? `${set.length} elementos` : d.task.title || '(sin título)';
      ghost.style.left = `${d.x}px`;
      ghost.style.top = `${d.y}px`;
      document.body.appendChild(ghost);
      d.ghost = ghost;
      if (d.reorder && d.container) {
        const line = document.createElement('div');
        line.className = 'gtd-reorder-line';
        line.style.display = 'none';
        document.body.appendChild(line);
        d.line = line;
      }
      setDragging(set.map((t) => t.key));
      if (navigator.vibrate) {
        try {
          navigator.vibrate(15);
        } catch (e) {}
      }
      if (handlers.current.onStart) handlers.current.onStart(d.task);
    };
    const update = () => {
      const d = drag.current;
      if (!d || !d.active) return;
      if (d.ghost) {
        d.ghost.style.left = `${d.x}px`;
        d.ghost.style.top = `${d.y}px`;
      }
      if (
        !d.edgeDone &&
        d.pointerType !== 'mouse' &&
        d.x <= SIDE_EDGE &&
        handlers.current.onNearEdge
      ) {
        d.edgeDone = true;
        handlers.current.onNearEdge(d.task);
      }
      const id = dropIdAt(d.x, d.y);
      if (id !== d.over) {
        d.over = id;
        setDropTarget(id);
      }
      // ¿Dentro de la lista? → dónde quedaría
      d.pos = null;
      if (!id && d.reorder && d.container) {
        const r = d.container.getBoundingClientRect();
        if (d.x >= r.left && d.x <= r.right && d.y >= r.top - 20 && d.y <= r.bottom + 40) {
          d.pos = dropPositionAt(d.container, d.y, d.task.key);
        }
      }
      if (d.line) {
        const pos = d.pos;
        const r = d.container.getBoundingClientRect();
        d.line.style.display = !pos || pos.same || pos.lineY === null ? 'none' : 'block';
        if (pos) {
          d.line.style.top = `${(pos.lineY || 0) - 1}px`;
          d.line.style.left = `${r.left}px`;
          d.line.style.width = `${r.width}px`;
        }
      }
      const sec = d.pos ? d.pos.section : null;
      if (sec !== d.lastSection) {
        d.lastSection = sec;
        setDropSection(sec);
      }
    };
    const autoScroll = (e) => {
      const d = drag.current;
      if (!d || !d.scroller) return;
      const sp = d.scroller;
      const r =
        sp === document.scrollingElement || sp === document.documentElement
          ? { top: 0, bottom: window.innerHeight }
          : sp.getBoundingClientRect();
      const dir = e.clientY < r.top + EDGE ? -1 : e.clientY > r.bottom - EDGE ? 1 : 0;
      if (dir !== d.scrollDir) {
        d.scrollDir = dir;
        stopAutoScroll(d);
        if (dir) {
          d.scrollTimer = setInterval(() => {
            sp.scrollTop += dir * SPEED;
            update();
          }, 16);
        }
      }
    };
    const move = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (d.swiping) {
        if (e.cancelable) e.preventDefault();
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
        if (Math.hypot(dx, dy) <= slop) return;
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
        if (d.pointerType === 'mouse') activate();
        else {
          cleanup(); // es un desplazamiento de la lista
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      update();
      autoScroll(e);
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
      d.x = e.clientX;
      d.y = e.clientY;
      update();
      const { over, pos, tasks, task } = d;
      suppressClickUntil.current = Date.now() + 400;
      cleanup();
      if (over && handlers.current.onDrop) handlers.current.onDrop(tasks, over);
      else if (pos && !pos.same && handlers.current.onReorder)
        handlers.current.onReorder(task, pos);
    };
    const cancel = () => cleanup();
    const touchMove = (e) => {
      const d = drag.current;
      if (d && (d.active || d.swiping) && e.cancelable) e.preventDefault();
    };
    const contextMenu = (e) => {
      if (drag.current && drag.current.pointerType !== 'mouse') e.preventDefault();
    };
    const key = (e) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        cleanup();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('contextmenu', contextMenu);
    window.addEventListener('keydown', key, true);
    activateRef.current = activate;
    return () => {
      cleanup();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('keydown', key, true);
    };
  }, []);

  const onPointerDown = (task) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (
      e.target.closest &&
      e.target.closest('button, input, textarea, select, a, label, .gtd-task__dots')
    ) {
      return;
    }
    if (drag.current) return;
    const container = e.currentTarget.closest('[data-reorder-container]');
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
      container,
      scroller: container ? scrollParentOf(container) : null,
      canSwipe: !!(handlers.current.canSwipe && handlers.current.canSwipe(task)),
    };
    if (drag.current.pointerType !== 'mouse') {
      drag.current.timer = setTimeout(
        () => activateRef.current && activateRef.current(),
        LONG_PRESS_MS
      );
    }
  };

  const clickSuppressed = () => Date.now() < suppressClickUntil.current;

  return { onPointerDown, dragging, dropTarget, dropSection, clickSuppressed };
}

// (3.0) Lazo: pulsar en los puntos de la izquierda de una fila y arrastrar hacia arriba o abajo
// selecciona las filas que se recorren (con Ctrl/⌘ se añaden a la selección), como Nirvana.
export function useLasso({ onSelect }) {
  const ref = useRef(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;
  useEffect(() => {
    const keysBetween = (container, y0, y1) => {
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      return Array.from(container.querySelectorAll('[data-reorder-key]'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > top && r.top < bottom;
        })
        .map((el) => el.getAttribute('data-reorder-key'));
    };
    const move = (e) => {
      const l = ref.current;
      if (!l || e.pointerId !== l.pointerId) return;
      if (e.cancelable) e.preventDefault();
      l.moved = l.moved || Math.abs(e.clientY - l.y0) > 4;
      cb.current(keysBetween(l.container, l.y0, e.clientY), l.additive, false);
    };
    const up = (e) => {
      const l = ref.current;
      if (!l || e.pointerId !== l.pointerId) return;
      ref.current = null;
      if (!l.moved) cb.current([l.key], true, true); // un toque: añade o quita esa fila
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  const startLasso = (key) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const container = e.currentTarget.closest('[data-reorder-container]');
    if (!container) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture && e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    ref.current = {
      key,
      container,
      pointerId: e.pointerId,
      y0: e.clientY,
      additive: e.ctrlKey || e.metaKey,
      moved: false,
    };
  };
  return { startLasso };
}
