// ORG Mode para Eli 3.26: tirar hacia abajo de la lista GTD = sincronizar.
// Solo con el dedo (táctil), solo si la lista está arriba del todo.
import { useEffect, useRef, useState } from 'react';

export const PULL_THRESHOLD = 70; // px de tirón (ya amortiguado) para sincronizar
export const PULL_MAX = 110;
// Si el dedo se queda quieto más que esto antes de tirar, es una pulsación larga (arrastrar fila)
export const PULL_HOLD_MS = 400;

// Amortigua el desplazamiento del dedo (se siente como una goma).
export const dampPull = (dy) => {
  if (!(dy > 0)) return 0;
  return Math.min(PULL_MAX, dy * 0.5);
};

export const pullReady = (pull) => pull >= PULL_THRESHOLD;

const IGNORE =
  'input, textarea, select, [contenteditable="true"], .gtd-editor, .gtd-review, .eli-prompt';

export const usePullToRefresh = (ref, onRefresh, { enabled = true } = {}) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let start = null; // { y, x, t }
    let active = false;
    let current = 0;

    const reset = () => {
      start = null;
      active = false;
      current = 0;
      setPull(0);
    };

    const onStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return reset();
      const t = e.target;
      if (t && t.closest && t.closest(IGNORE)) return reset();
      if (el.scrollTop > 0) return reset();
      const p = e.touches[0];
      start = { y: p.clientY, x: p.clientX, t: Date.now() };
      active = false;
    };

    const onMove = (e) => {
      if (!start || !e.touches || e.touches.length !== 1) return;
      const p = e.touches[0];
      const dy = p.clientY - start.y;
      const dx = p.clientX - start.x;
      if (!active) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        // pulsación larga antes de mover → arrastre de fila, no tirón
        if (
          Date.now() - start.t > PULL_HOLD_MS ||
          dy <= 0 ||
          Math.abs(dx) > dy ||
          el.scrollTop > 0
        ) {
          start = null;
          return;
        }
        active = true;
      }
      current = dampPull(dy);
      setPull(current);
    };

    const onEnd = () => {
      const fire = active && pullReady(current);
      reset();
      if (fire) {
        setRefreshing(true);
        try {
          cb.current && cb.current();
        } finally {
          setTimeout(() => setRefreshing(false), 900);
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', reset);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [ref, enabled]);

  return { pull, refreshing };
};
