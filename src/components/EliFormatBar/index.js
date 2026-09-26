// ORG Mode para Eli: barra de formato (negrita, cursiva…) para cualquier <textarea>/<input>.
// No quita el foco al editor: la selección se mantiene al pulsar los botones.
import React from 'react';

import { ORG_EMPHASIS, toggleOrgEmphasis } from '../../lib/eli_format';

import './stylesheet.css';

const setFieldValue = (el, value) => {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

export const applyEmphasis = (el, marker) => {
  if (!el) return;
  const result = toggleOrgEmphasis(el.value, el.selectionStart, el.selectionEnd, marker);
  setFieldValue(el, result.value);
  const restore = () => {
    try {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    } catch (e) {}
  };
  restore();
  // React vuelve a pintar el valor: se recoloca la selección después
  requestAnimationFrame(restore);
};

const readOpen = () => {
  try {
    return localStorage.getItem('eliFormatBarOpen') === '1';
  } catch (e) {
    return false;
  }
};

// Plegada tras un botón «Aa» (se recuerda si se deja abierta)
export default ({ getField, className = '', compact = false, collapsible = true }) => {
  const [open, setOpen] = React.useState(!collapsible || readOpen());
  const keep = (e) => e.preventDefault();
  const toggle = (e) => {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem('eliFormatBarOpen', next ? '1' : '0');
    } catch (err) {}
  };
  return (
    <div
      className={`eli-format-bar ${compact ? 'eli-format-bar--compact' : ''} ${className}`}
      data-testid="eli-format-bar"
      onMouseDown={keep}
      onPointerDown={keep}
    >
      {collapsible && (
        <button
          type="button"
          className={'eli-format-bar__btn eli-format-bar__toggle' + (open ? ' is-open' : '')}
          title={open ? 'Ocultar el formato de texto' : 'Formato de texto'}
          aria-label="Formato de texto"
          aria-expanded={open}
          data-testid="eli-format-toggle"
          onMouseDown={keep}
          onClick={toggle}
        >
          Aa
        </button>
      )}
      {open &&
        ORG_EMPHASIS.map(({ marker, icon, title, id }) => (
          <button
            key={id}
            type="button"
            className="eli-format-bar__btn"
            title={title}
            aria-label={title}
            data-testid={`eli-format-${id}`}
            onMouseDown={keep}
            onClick={(e) => {
              e.stopPropagation();
              applyEmphasis(getField(), marker);
            }}
          >
            <i className={icon} />
          </button>
        ))}
    </div>
  );
};
