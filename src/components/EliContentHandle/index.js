// ORG Mode para Eli (4.35): tirador en el borde derecho del contenido para el ancho «Personalizado»
// (solo ordenador). Arrastrar = ancho nuevo (el contenido está centrado, así que se mueve el doble
// que el ratón); doble clic = el de siempre. El campo en px está en Ajustes › Documentos.
import React, { useEffect, useRef, useState } from 'react';
import './stylesheet.css';
import { CONTENT_PX, getContentPx, setContentPx } from '../../lib/eli_layout';

const CONTENT_SEL = '.org-file-container, .gtd-main > :not(.gtd-main__head)';

export default function EliContentHandle() {
  const [x, setX] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    const place = () => {
      if (document.documentElement.getAttribute('data-eli-width') !== 'custom') return setX(null);
      const el = document.querySelector(CONTENT_SEL);
      if (!el) return setX(null);
      const r = el.getBoundingClientRect();
      setX(r.width > 0 ? Math.round(r.right) : null);
    };
    place();
    const t = setInterval(place, 600);
    window.addEventListener('resize', place);
    return () => {
      clearInterval(t);
      window.removeEventListener('resize', place);
    };
  }, []);

  if (x === null) return null;
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: getContentPx() };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    document.body.classList.add('eli-resizing');
  };
  const move = (e, save) => {
    if (!drag.current) return;
    const w = setContentPx(drag.current.w + 2 * (e.clientX - drag.current.x), { save });
    if (save) {
      drag.current = null;
      document.body.classList.remove('eli-resizing');
    }
    return w;
  };
  return (
    <div
      className="eli-content-handle"
      role="separator"
      aria-orientation="vertical"
      title={`Arrastra para cambiar el ancho del contenido (${CONTENT_PX.min}–${CONTENT_PX.max} px; doble clic: el de siempre)`}
      style={{ left: x - 3 }}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => move(e, false)}
      onPointerUp={(e) => move(e, true)}
      onPointerCancel={(e) => move(e, true)}
      onDoubleClick={() => setContentPx(CONTENT_PX.def)}
      data-testid="eli-content-handle"
    />
  );
}
