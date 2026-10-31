// (4.55) Reordenar una lista de filas arrastrando su asa (ratón y dedo). Cada fila lleva
// `data-drag-id="<id>"` y su asa llama a `startDrag(id)(event)`. Al soltar se llama a
// onMove(id, beforeId) (beforeId = null: al final). Mientras se arrastra, `over` dice dónde caerá:
// { id, after } (la fila de al lado y si va después de ella).
import { useRef, useState, useEffect } from 'react';

// Dónde caería al soltar en la altura y: { id, after } o null
export const dropTargetAt = (container, y, draggedId) => {
  if (!container) return null;
  const rows = Array.from(container.querySelectorAll('[data-drag-id]')).filter(
    (el) => el.getAttribute('data-drag-id') !== draggedId
  );
  if (!rows.length) return null;
  for (const el of rows) {
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) return { id: el.getAttribute('data-drag-id'), after: false };
  }
  return { id: rows[rows.length - 1].getAttribute('data-drag-id'), after: true };
};

// Orden nuevo al mover `id` junto a `target` ({ id, after })
export const reorderIds = (order, id, target) => {
  if (!target || target.id === id) return order;
  const without = order.filter((x) => x !== id);
  const at = without.indexOf(target.id);
  if (at < 0) return order;
  without.splice(target.after ? at + 1 : at, 0, id);
  return without;
};

export const useListDrag = (containerRef, onDrop) => {
  const [drag, setDrag] = useState(null); // { id, over }
  const live = useRef(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const over = dropTargetAt(containerRef.current, e.clientY, live.current.id);
      live.current = { ...live.current, over };
      setDrag(live.current);
      // desplazamiento automático cerca de los bordes de la pantalla
      if (e.clientY < 50) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 50) window.scrollBy(0, 12);
    };
    const up = () => {
      const cur = live.current;
      live.current = null;
      setDrag(null);
      if (cur && cur.over) dropRef.current(cur.id, cur.over);
    };
    const cancel = () => {
      live.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const startDrag = (id) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    live.current = { id, over: null };
    setDrag(live.current);
  };
  return { drag, startDrag };
};
