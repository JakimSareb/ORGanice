// ORG Mode para Eli (3.0): menú contextual de la vista GTD (clic derecho en una tarea, o el ▾ del
// final de la fila; también el ⋯ de la cabecera), como el de Nirvana. Los submenús («Mover a ▸»,
// «Convertir ▸»…) se abren en el mismo sitio, con «‹» para volver (así funciona igual con el dedo).
//   items: [{ label, icon, onClick, sub: [...], checked, danger, disabled, sep, hint }]
//   (3.01) { heading: 'Texto' }: título de un grupo de opciones (no se puede pulsar)
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function GtdMenu({ x, y, items, header, onClose, testId = 'gtd-menu' }) {
  const [stack, setStack] = useState([{ items, title: null }]);
  const [pos, setPos] = useState({ left: x, top: y });
  const ref = useRef(null);
  const page = stack[stack.length - 1];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      left: Math.max(8, Math.min(x, vw - r.width - 8)),
      top: Math.max(8, Math.min(y, vh - r.height - 8)),
    });
  }, [x, y, stack.length]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (stack.length > 1) setStack((s) => s.slice(0, -1));
        else onClose();
      }
    };
    const onCtx = (e) => {
      if (ref.current && ref.current.contains(e.target)) e.preventDefault();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', onCtx, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', onCtx, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, stack.length]);

  const choose = (item) => {
    if (item.disabled) return;
    if (item.sub) {
      setStack((s) => [...s, { items: item.sub, title: item.label }]);
      return;
    }
    onClose();
    if (item.onClick) item.onClick();
  };

  return (
    <div
      className="gtd-menu"
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      data-testid={testId}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {stack.length > 1 ? (
        <button
          type="button"
          className="gtd-menu__back"
          onClick={() => setStack((s) => s.slice(0, -1))}
          data-testid="gtd-menu-back"
        >
          <i className="fas fa-chevron-left" /> {page.title}
        </button>
      ) : (
        header && <div className="gtd-menu__header">{header}</div>
      )}
      <div className="gtd-menu__items">
        {page.items.map((item, i) =>
          item.sep ? (
            <div key={`sep${i}`} className="gtd-menu__sep" />
          ) : item.heading ? (
            <div key={`h${i}`} className="gtd-menu__heading">
              {item.heading}
            </div>
          ) : (
            <button
              key={item.label + i}
              type="button"
              role="menuitem"
              className={
                'gtd-menu__item' +
                (item.danger ? ' is-danger' : '') +
                (item.checked ? ' is-checked' : '')
              }
              disabled={item.disabled}
              onClick={() => choose(item)}
              data-testid={item.testId}
            >
              <span className="gtd-menu__icon">
                {item.checked ? <i className="fas fa-check" /> : item.icon ? <i className={item.icon} /> : null}
              </span>
              <span className="gtd-menu__label">{item.label}</span>
              {item.hint && <span className="gtd-menu__hint">{item.hint}</span>}
              {item.sub && <i className="fas fa-chevron-right gtd-menu__more" />}
            </button>
          )
        )}
      </div>
    </div>
  );
}
