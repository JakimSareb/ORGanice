// ORG Mode para Eli: pantalla dividida. Dos copias completas de la app, una al lado de la otra
// (cada una en su marco). Cada copia es la app de siempre; se avisan al guardar (eli_multi).
import React, { useEffect, useRef, useState } from 'react';

import './stylesheet.css';

import { BASE_PATH } from '../../lib/base_path';

const LS_KEY = 'eliSplitView';

const readSaved = () => {
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY)) || {};
  } catch (e) {
    return {};
  }
};
const save = (value) => {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch (e) {}
};

// Ruta interna de la app (sin la base) de un marco
const routeOf = (frame) => {
  try {
    const loc = frame.contentWindow.location;
    const path = decodeURIComponent(loc.pathname);
    const inner = path.startsWith(BASE_PATH) ? path.slice(BASE_PATH.length) : path;
    return (inner || '/') + (loc.search || '');
  } catch (e) {
    return null;
  }
};

const cleanRoute = (r, fallback) =>
  r && r.startsWith('/') && !r.startsWith('/split') ? r : fallback;

export default function EliSplitView() {
  const params = new URLSearchParams(window.location.search);
  const saved = readSaved();
  const [left] = useState(() => cleanRoute(params.get('l') || saved.left, '/gtd'));
  const [right] = useState(() => cleanRoute(params.get('r') || saved.right, '/files'));
  const [ratio, setRatio] = useState(() => Math.min(0.8, Math.max(0.2, +saved.ratio || 0.5)));
  const [dragging, setDragging] = useState(false);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    window.__eliSplitView = true;
    document.title = 'ORGanice · pantalla dividida';
    // Recordar qué hay en cada lado (para recargar la página o volver a dividir)
    const timer = setInterval(() => {
      const l = routeOf(leftRef.current);
      const r = routeOf(rightRef.current);
      if (!l || !r) return;
      const current = readSaved();
      if (current.left !== l || current.right !== r) {
        save({ ...current, left: l, right: r });
        const url = `${BASE_PATH}/split?l=${encodeURIComponent(l)}&r=${encodeURIComponent(r)}`;
        window.history.replaceState(null, '', url);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => {
      const box = containerRef.current.getBoundingClientRect();
      const r = Math.min(0.8, Math.max(0.2, (e.clientX - box.left) / box.width));
      setRatio(r);
    };
    const up = () => {
      setDragging(false);
      save({ ...readSaved(), ratio });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, ratio]);

  return (
    <div
      className={'eli-split' + (dragging ? ' is-dragging' : '')}
      ref={containerRef}
      data-testid="eli-split"
    >
      <iframe
        ref={leftRef}
        className="eli-split__pane"
        style={{ width: `calc(${ratio * 100}% - 3px)` }}
        src={`${BASE_PATH}${left}`}
        title="Panel izquierdo"
        data-testid="eli-split-left"
      />
      <div
        className="eli-split__divider"
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        title="Arrastra para cambiar el tamaño"
        role="separator"
        aria-orientation="vertical"
      />
      <iframe
        ref={rightRef}
        className="eli-split__pane"
        style={{ width: `calc(${(1 - ratio) * 100}% - 3px)` }}
        src={`${BASE_PATH}${right}`}
        title="Panel derecho"
        data-testid="eli-split-right"
      />
    </div>
  );
}
