// ORG Mode para Eli: barra de formato (negrita, cursiva…) para cualquier <textarea>/<input>.
// No quita el foco al editor: la selección se mantiene al pulsar los botones.
import React from 'react';

import {
  ORG_EMPHASIS,
  LIST_MARKERS,
  applyListMarker,
  toggleOrgEmphasis,
  emphasisForKeyEvent,
  emphasisShortcutLabel,
} from '../../lib/eli_format';

import './stylesheet.css';

const setFieldValue = (el, value) => {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

// (2.16) marcador de lista al principio de la línea (o de cada línea seleccionada)
export const applyList = (el, kind) => {
  if (!el) return;
  const result = applyListMarker(el.value, el.selectionStart, el.selectionEnd, kind);
  setFieldValue(el, result.value);
  const restore = () => {
    try {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    } catch (e) {}
  };
  restore();
  requestAnimationFrame(() => el.value === result.value && restore());
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
  // React vuelve a pintar el valor: se recoloca la selección después (salvo que ya se haya
  // escrito algo, para no mover el cursor en medio)
  requestAnimationFrame(() => el.value === result.value && restore());
};

// ORG Mode para Eli: Ctrl/⌘+B, I, U, Mayús+X, E y Mayús+E en cualquier campo de texto de la app
// (no en los buscadores). Se instala una vez (desde Entry).
const NO_FORMAT = ['gtd-search', 'gtd-log-search', 'eli-palette-input'];
const isFormattable = (el) =>
  !!el &&
  !el.readOnly &&
  !el.disabled &&
  (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && /^(text|)$/i.test(el.getAttribute('type') || ''))) &&
  !NO_FORMAT.includes(el.getAttribute('data-testid')) &&
  !(el.closest && el.closest('[data-eli-noformat]'));

let hotkeysInstalled = false;
export const installFormatHotkeys = () => {
  if (hotkeysInstalled || typeof window === 'undefined') return;
  hotkeysInstalled = true;
  window.addEventListener(
    'keydown',
    (event) => {
      const item = emphasisForKeyEvent(event);
      if (!item) return;
      const el = event.target;
      if (!isFormattable(el)) return;
      event.preventDefault();
      event.stopPropagation();
      applyEmphasis(el, item.marker);
    },
    true
  );
};

const readOpen = () => {
  try {
    return localStorage.getItem('eliFormatBarOpen') === '1';
  } catch (e) {
    return false;
  }
};

// Plegada tras un botón «Aa» (se recuerda si se deja abierta)
// getListField (2.16): campo donde van los marcadores de lista (descripción, notas); sin él, no
// se muestran (en un título no tienen sentido)
export default ({
  getField,
  getListField = null,
  className = '',
  compact = false,
  collapsible = true,
}) => {
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
        ORG_EMPHASIS.map((item) => {
          const { marker, icon, id } = item;
          const title = `${item.title} · ${emphasisShortcutLabel(item)}`;
          return (
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
          );
        })}
      {open && getListField && <span className="eli-format-bar__sep" aria-hidden="true" />}
      {open &&
        getListField &&
        LIST_MARKERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="eli-format-bar__btn"
            title={item.title}
            aria-label={item.title}
            data-testid={`eli-format-list-${item.id}`}
            onMouseDown={keep}
            onClick={(e) => {
              e.stopPropagation();
              applyList(getListField(), item.id);
            }}
          >
            <i className={item.icon} />
          </button>
        ))}
    </div>
  );
};
