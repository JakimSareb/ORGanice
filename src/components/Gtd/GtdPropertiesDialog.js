// ORG Mode para Eli (3.11): ver y editar el cajón PROPERTIES de una tarea (nombre y valor de
// cada una; añadir, quitar y cambiar el orden no hace falta: se guardan en el orden de la lista).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { propertyRowsOf } from '../../lib/gtd/gtd_actions';

let nextKey = 1;
const withKeys = (rows) => rows.map((r) => ({ ...r, key: nextKey++ }));

export default function GtdPropertiesDialog({ task, onSave, onClose }) {
  const [rows, setRows] = useState(() => withKeys(propertyRowsOf(task)));
  const boxRef = useRef(null);
  const focusLast = useRef(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (!focusLast.current || !boxRef.current) return;
    focusLast.current = false;
    const inputs = boxRef.current.querySelectorAll('[data-testid="gtd-prop-name"]');
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  });

  const setRow = (key, field, value) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = () => {
    focusLast.current = true;
    setRows((rs) => [...rs, { key: nextKey++, name: '', value: '' }]);
  };
  const save = () => {
    onSave(rows.map(({ id, name, value }) => ({ id, name, value })));
    onClose();
  };

  const names = rows.map((r) => r.name.trim().toUpperCase()).filter(Boolean);
  const dup = names.find((n, i) => names.indexOf(n) !== i);

  const box = (
    <div
      className="eli-prompt__overlay gtd-props__overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="eli-prompt__box gtd-props"
        ref={boxRef}
        role="dialog"
        aria-label="Propiedades"
        data-testid="gtd-props"
        // (que las teclas y toques no lleguen al editor de la tarea, que está «detrás» en React)
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !(e.nativeEvent && e.nativeEvent.isComposing)) {
            e.preventDefault();
            save();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="eli-prompt__title">
          <i className="fas fa-list-ul" /> Propiedades
        </div>
        <div className="gtd-props__task">{task.title || '(sin título)'}</div>
        {rows.length === 0 && (
          <div className="gtd-props__empty">Esta tarea no tiene propiedades.</div>
        )}
        <div className="gtd-props__rows">
          {rows.map((r) => (
            <div className="gtd-props__row" key={r.key} data-testid="gtd-prop-row">
              <input
                className="gtd-props__name"
                value={r.name}
                placeholder="NOMBRE"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setRow(r.key, 'name', e.target.value)}
                data-testid="gtd-prop-name"
              />
              <input
                className="gtd-props__value"
                value={r.value}
                placeholder="valor"
                autoCorrect="off"
                onChange={(e) => setRow(r.key, 'value', e.target.value)}
                data-testid="gtd-prop-value"
              />
              <button
                type="button"
                className="gtd-props__del"
                onClick={() => removeRow(r.key)}
                title="Quitar esta propiedad"
                aria-label="Quitar esta propiedad"
                data-testid="gtd-prop-del"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="gtd-btn gtd-btn--link gtd-props__add"
          onClick={addRow}
          data-testid="gtd-prop-add"
        >
          <i className="fas fa-plus" /> Añadir propiedad
        </button>
        {dup && (
          <div className="eli-prompt__error">«{dup}» está repetida: solo se guarda la primera.</div>
        )}
        <div className="eli-prompt__buttons">
          <button type="button" className="btn" onClick={onClose} data-testid="gtd-props-cancel">
            Cancelar
          </button>
          <button type="button" className="btn" onClick={save} data-testid="gtd-props-save">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(box, document.body) : box;
}
