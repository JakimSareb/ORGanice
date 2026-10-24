// ORG Mode para Eli: botón «⋯ Más» con un menú desplegable. Sirve para dejar a la vista solo lo
// que se usa a diario y guardar el resto aquí (barra superior, barra del encabezado, editores).
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

import './stylesheet.css';

// (4.23) Con ratón (pointer: fine) los submenús se abren al pasar por encima, como un panel al
// lado; con el dedo se queda el submenú que sustituye al menú (con «‹» para volver).
const hasFinePointer = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(pointer: fine)').matches;

// Panel del submenú: posición fija junto al elemento que lo abre (no lo recorta el scroll del menú)
const Flyout = ({ anchor, align, testId, children }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const a = anchor.current;
    const f = ref.current;
    if (!a || !f) return;
    const ar = a.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'right' ? ar.left - fr.width + 4 : ar.right - 4;
    if (left < 4) left = Math.min(ar.right - 4, vw - fr.width - 4);
    if (left + fr.width > vw - 4) left = Math.max(4, ar.left - fr.width + 4);
    let top = ar.top - 6;
    if (top + fr.height > vh - 8) top = Math.max(8, vh - 8 - fr.height);
    setPos({ left, top });
  }, [anchor, align]);
  return (
    <div
      ref={ref}
      className="eli-more__flyout"
      role="menu"
      data-testid={testId}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      {children}
    </div>
  );
};

const SubWrap = ({ open, align, testId, onEnter, panel, children }) => {
  const ref = useRef(null);
  return (
    <div className="eli-more__subwrap" ref={ref} onMouseEnter={onEnter}>
      {children}
      {open && (
        <Flyout anchor={ref} align={align} testId={testId}>
          {panel}
        </Flyout>
      )}
    </div>
  );
};

/**
 * items: [{ icon, label, onClick, testId, disabled, danger, keepOpen, items }] (los falsos se
 * ignoran). (3.03) Con `items`, el elemento abre un submenú vertical (con «‹» para volver).
 * (4.04) `{ heading: 'Texto' }` es un rótulo de grupo (no se pulsa).
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
  icon = 'fas fa-ellipsis-h',
  badge = null, // (4.09) icono pequeño en una esquina del botón (p. ej. el reloj en marcha)
  label = null,
}) => {
  const [open, setOpenRaw] = useState(false);
  const [stack, setStack] = useState([]); // submenús abiertos (índices)
  const setOpen = (v) => {
    setOpenRaw(v);
    setStack([]);
    setFlyout([]);
  };
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const scrollRef = useRef(null);
  const [flyout, setFlyout] = useState([]); // (4.23) claves de los submenús abiertos (con ratón)
  const closeTimer = useRef(null);
  const [more, setMore] = useState({ up: false, down: false }); // (4.23) ¿hay más arriba/abajo?
  const fine = hasFinePointer();

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

  // (4.23) flechitas que dicen que el menú tiene más por arriba/abajo cuando hace scroll
  const measure = () => {
    const el = scrollRef.current;
    if (!el) return;
    const upM = el.scrollTop > 2;
    const downM = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setMore((m) => (m.up === upM && m.down === downM ? m : { up: upM, down: downM }));
  };
  useLayoutEffect(() => {
    if (open) measure();
  }, [open, stack, up, visible.length]);
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

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

  const flyoutIs = (path, key, depth) =>
    flyout.length > depth && flyout[depth] === key && path.every((k, j) => flyout[j] === k);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = (depth) => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyout((f) => f.slice(0, depth)), 160);
  };
  const renderItems = (list, depth, path) =>
    list.filter(Boolean).map((item, i) => {
      if (item.heading)
        return (
          <div
            key={'h-' + item.heading}
            className="eli-more__heading"
            role="presentation"
            data-testid={item.testId}
          >
            {item.heading}
          </div>
        );
      const key = item.testId || item.label;
      const sub = fine && !!item.items;
      const isOpen = sub && flyoutIs(path, key, depth);
      const btn = (
        <button
          key={sub ? undefined : key || i}
          type="button"
          role="menuitem"
          className={
            'eli-more__item' +
            (item.danger ? ' eli-more__item--danger' : '') +
            (item.active || isOpen ? ' is-active' : '')
          }
          disabled={item.disabled}
          data-testid={item.testId}
          title={item.title || item.label}
          onMouseDown={keep}
          aria-haspopup={item.items ? 'menu' : undefined}
          onMouseEnter={
            fine
              ? () => {
                  cancelClose();
                  if (item.items && !item.disabled) setFlyout([...path, key]);
                  else if (flyout.length > depth) scheduleClose(depth);
                }
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation();
            if (item.items) {
              if (fine) setFlyout([...path, key]);
              // con ratón el clic solo lo abre (ya se abrió al pasar)
              else setStack((st) => [...st, key]);
              return;
            }
            if (!item.keepOpen) setOpen(false);
            if (item.onClick) item.onClick(e);
          }}
        >
          <i className={item.icon} aria-hidden="true" />
          <span>{item.label}</span>
          {item.items && <i className="fas fa-chevron-right eli-more__chev" aria-hidden="true" />}
        </button>
      );
      if (!sub) return btn;
      return (
        <SubWrap
          key={key || i}
          open={isOpen}
          align={align}
          testId={`${item.testId || 'eli-more-sub'}-flyout`}
          onEnter={cancelClose}
          panel={renderItems(item.items, depth + 1, [...path, key])}
        >
          {btn}
        </SubWrap>
      );
    });

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
        <i className={icon} />
        {badge && (
          <i
            className={`${badge} eli-more__badge`}
            aria-hidden="true"
            data-testid={`${testId}-badge`}
          />
        )}
        {label && <span className="eli-more__btn-label">{label}</span>}
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`eli-more__menu eli-more__menu--${align}${up ? ' eli-more__menu--up' : ''}`}
          role="menu"
          data-testid={`${testId}-menu`}
        >
          <div
            ref={scrollRef}
            className="eli-more__scroll"
            data-testid={`${testId}-scroll`}
            onScroll={() => {
              measure();
              if (flyout.length) setFlyout([]);
            }}
          >
            {trail.length > 0 && !fine && (
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
            {renderItems(fine ? visible : level.items, 0, [])}
          </div>
          {more.up && (
            <div className="eli-more__more eli-more__more--up" aria-hidden="true">
              <i className="fas fa-chevron-up" />
            </div>
          )}
          {more.down && (
            <div
              className="eli-more__more eli-more__more--down"
              aria-hidden="true"
              data-testid={`${testId}-more-down`}
            >
              <i className="fas fa-chevron-down" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
