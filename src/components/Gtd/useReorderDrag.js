// ORG Mode para Eli (2.15): reordenar tareas en la vista GTD arrastrando su asa (⋮⋮). Funciona
// igual con ratón y con el dedo (el asa no desplaza la página). Mientras se arrastra, una línea
// marca dónde quedará. Al soltar se llama a onDrop(task, drop) con:
//   drop = { section, index, beforeKey, afterKey }
// section: la sección visual (data-reorder-section) donde se suelta; index: posición dentro de
// ella; beforeKey / afterKey: las filas de al lado (o null).
import { useEffect, useRef, useState } from 'react';

const EDGE = 60; // px del borde en los que la lista se desplaza sola
const SPEED = 14;

const scrollParentOf = (el) => {
  let node = el && el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
};

// Dónde quedaría al soltar en la altura y (coordenadas de pantalla)
export const dropPositionAt = (container, y, draggedKey) => {
  const slots = Array.from(container.querySelectorAll('[data-reorder-slot]'));
  let section = null;
  let index = 0;
  let lastRowKey = null;
  let lineY = null;
  for (let i = 0; i < slots.length; i++) {
    const el = slots[i];
    const rect = el.getBoundingClientRect();
    const isHeader = el.hasAttribute('data-reorder-header');
    const elSection = el.getAttribute('data-reorder-section');
    const key = el.getAttribute('data-reorder-key');
    if (isHeader) {
      // Antes de la primera cabecera cuenta como el principio de su sección
      if (section === null && y < rect.top + rect.height / 2) {
        return {
          section: elSection,
          index: 0,
          beforeKey: null,
          afterKey: null,
          lineY: rect.bottom,
        };
      }
      if (y < rect.top + rect.height / 2) {
        return { section, index, beforeKey: null, afterKey: lastRowKey, lineY: rect.top };
      }
      section = elSection;
      index = 0;
      lastRowKey = null;
      lineY = rect.bottom;
      continue;
    }
    if (section === null) section = elSection;
    if (key === draggedKey) {
      // La propia fila no cuenta (soltarla encima = no moverla)
      if (y < rect.bottom) {
        return {
          section: elSection,
          index,
          beforeKey: null,
          afterKey: null,
          same: true,
          lineY: rect.top,
        };
      }
      continue;
    }
    if (y < rect.top + rect.height / 2) {
      return { section, index, beforeKey: key, afterKey: lastRowKey, lineY: rect.top };
    }
    index++;
    lastRowKey = key;
    lineY = rect.bottom;
  }
  return { section, index, beforeKey: null, afterKey: lastRowKey, lineY };
};

export default function useReorderDrag({ onDrop }) {
  const drag = useRef(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const [reordering, setReordering] = useState(null);
  const [dropSection, setDropSection] = useState(null);

  useEffect(() => {
    const stopAutoScroll = (d) => {
      if (d && d.scrollTimer) {
        clearInterval(d.scrollTimer);
        d.scrollTimer = null;
      }
    };
    const cleanup = () => {
      const d = drag.current;
      if (!d) return;
      stopAutoScroll(d);
      if (d.ghost) d.ghost.remove();
      if (d.line) d.line.remove();
      drag.current = null;
      setReordering(null);
      setDropSection(null);
    };
    const update = () => {
      const d = drag.current;
      if (!d) return;
      if (d.ghost) d.ghost.style.top = `${d.y}px`;
      const pos = dropPositionAt(d.container, d.y, d.task.key);
      d.pos = pos;
      const listRect = d.container.getBoundingClientRect();
      if (d.line) {
        d.line.style.display = pos.same || pos.lineY === null ? 'none' : 'block';
        d.line.style.top = `${(pos.lineY || 0) - 1}px`;
        d.line.style.left = `${listRect.left}px`;
        d.line.style.width = `${listRect.width}px`;
      }
      if (pos.section !== d.lastSection) {
        d.lastSection = pos.section;
        setDropSection(pos.section);
      }
    };
    const move = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (e.cancelable) e.preventDefault();
      d.y = e.clientY;
      update();
      // Desplazar la lista al acercarse a los bordes
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
    const up = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const { task, pos } = d;
      cleanup();
      if (pos && !pos.same && onDropRef.current) onDropRef.current(task, pos);
    };
    const cancel = () => cleanup();
    const key = (e) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        cleanup();
      }
    };
    const touchMove = (e) => {
      if (drag.current && e.cancelable) e.preventDefault();
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      cleanup();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('touchmove', touchMove);
    };
  }, []);

  // Para el asa: onPointerDown={startReorder(task)}
  const startReorder = (task) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.current) return;
    const container = e.currentTarget.closest('[data-reorder-container]');
    const row = e.currentTarget.closest('[data-reorder-slot]');
    if (!container || !row) return;
    const rect = row.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'gtd-reorder-ghost';
    ghost.textContent = task.title || '(sin título)';
    ghost.style.left = `${rect.left + 24}px`;
    ghost.style.top = `${e.clientY}px`;
    ghost.style.width = `${Math.max(120, rect.width - 48)}px`;
    document.body.appendChild(ghost);
    const line = document.createElement('div');
    line.className = 'gtd-reorder-line';
    line.style.display = 'none';
    document.body.appendChild(line);
    drag.current = {
      task,
      pointerId: e.pointerId,
      y: e.clientY,
      container,
      scroller: scrollParentOf(container),
      ghost,
      line,
      pos: null,
      lastSection: undefined,
    };
    try {
      e.currentTarget.releasePointerCapture && e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    setReordering(task.key);
    if (navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch (err) {}
    }
  };

  return { startReorder, reordering, dropSection };
}
