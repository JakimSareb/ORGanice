// ORG Mode para Eli (4.31): tirador vertical para cambiar el ancho de un panel (solo ordenador;
// en el móvil no se pinta, ver CSS). Arrastrar = ancho nuevo; doble clic = el de por defecto.
import React, { useRef } from 'react';
import './stylesheet.css';
import { getPaneWidth, setPaneWidth } from '../../lib/eli_layout';

export default function EliResizeHandle({ pane, testId }) {
  const drag = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: getPaneWidth(pane) };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    document.body.classList.add('eli-resizing');
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPaneWidth(pane, drag.current.w + (e.clientX - drag.current.x), { save: false });
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    setPaneWidth(pane, drag.current.w + (e.clientX - drag.current.x));
    drag.current = null;
    document.body.classList.remove('eli-resizing');
  };
  return (
    <div
      className="eli-resize-handle"
      role="separator"
      aria-orientation="vertical"
      title="Arrastra para cambiar el ancho (doble clic: el de siempre)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setPaneWidth(pane, null)}
      data-testid={testId}
    />
  );
}
