// ORG Mode para Eli: botón «⋯ Más» con un menú desplegable. Sirve para dejar a la vista solo lo
// que se usa a diario y guardar el resto aquí (barra superior, barra del encabezado, editores).
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

import './stylesheet.css';

/**
 * items: [{ icon, label, onClick, testId, disabled, danger, keepOpen, items }] (los falsos se
 * ignoran). (3.03) Con `items`, el elemento abre un submenú vertical (con «‹» para volver).
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
  const [open, setOpenRaw] = useState(false);
  const [stack, setStack] = useState([]); // submenús abiertos (índices)
  const setOpen = (v) => {
    setOpenRaw(v);
    setStack([]);
  };
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
  // lo que se ve: el menú principal o el submenú abierto
  let level = { label: null, items: visible };
  const trail = [];
  stack.forEach((key) => {
    const it = level.items.find((x) => (x.testId || x.label) === key);
    if (it && it.items) {
      trail.push(it);
      level = { label: it.label, icon: it.icon, items: it.items.filter(Boolean) };
    }
  });

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
          {trail.length > 0 && (
            <button
              type="button"
              className="eli-more__item eli-more__back"
              data-testid={`${testId}-back`}
              onMouseDown={keep}
              onClick={(e) => {
                e.stopPropagation();
                setStack((st) => st.slice(0, -1));
              }}
            >
              <i className="fas fa-chevron-left" aria-hidden="true" />
              <span>{level.label}</span>
            </button>
          )}
          {level.items.map((item, i) => (
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
              aria-haspopup={item.items ? 'menu' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (item.items) {
                  const key = item.testId || item.label;
                  setStack((st) => [...st, key]);
                  return;
                }
                if (!item.keepOpen) setOpen(false);
                if (item.onClick) item.onClick(e);
              }}
            >
              <i className={item.icon} aria-hidden="true" />
              <span>{item.label}</span>
              {item.items && (
                <i className="fas fa-chevron-right eli-more__chev" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
