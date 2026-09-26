// ORG Mode para Eli: botón «⋯ Más» con un menú desplegable. Sirve para dejar a la vista solo lo
// que se usa a diario y guardar el resto aquí (barra superior, barra del encabezado, editores).
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

import './stylesheet.css';

/**
 * items: [{ icon, label, onClick, testId, disabled, danger, keepOpen }] (los falsos se ignoran)
 * align: 'right' | 'left'
 */
export default ({
  items,
  align = 'right',
  className = '',
  buttonClassName = '',
  testId = 'eli-more',
  title = 'Más opciones',
  keepFocus = false,
}) => {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);

  // Si no cabe hacia abajo (p. ej. en la barra inferior de un editor), se abre hacia arriba
  useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    const menu = menuRef.current;
    if (!menu || up) return;
    const r = menu.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) setUp(true);
  }, [open, up]);
  const visible = (items || []).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!visible.length) return null;
  const keep = (e) => keepFocus && e.preventDefault();

  return (
    <div className={`eli-more ${className}`} ref={ref}>
      <button
        type="button"
        className={`eli-more__btn ${buttonClassName} ${open ? 'is-open' : ''}`}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onMouseDown={keep}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <i className="fas fa-ellipsis-h" />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`eli-more__menu eli-more__menu--${align}${up ? ' eli-more__menu--up' : ''}`}
          role="menu"
          data-testid={`${testId}-menu`}
        >
          {visible.map((item, i) => (
            <button
              key={item.testId || item.label || i}
              type="button"
              role="menuitem"
              className={
                'eli-more__item' +
                (item.danger ? ' eli-more__item--danger' : '') +
                (item.active ? ' is-active' : '')
              }
              disabled={item.disabled}
              data-testid={item.testId}
              title={item.title || item.label}
              onMouseDown={keep}
              onClick={(e) => {
                e.stopPropagation();
                if (!item.keepOpen) setOpen(false);
                if (item.onClick) item.onClick(e);
              }}
            >
              <i className={item.icon} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
