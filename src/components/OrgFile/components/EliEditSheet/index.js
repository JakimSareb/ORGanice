// ORG Mode para Eli (4.0): «Editar» de la barra de abajo: el título y el texto (notas) de la
// cabecera en una sola hoja, con la fila de formato (negrita, listas, casilla, tabla). Se guarda
// con «Listo», al tocar fuera o con Esc; «Cancelar» lo deja como estaba.
import React, { useEffect, useRef, useState } from 'react';

import EliFormatBar from '../../../EliFormatBar';
import { emptyOrgTable } from '../../../../lib/eli_format';
import { autoIndentEnter, isPlainEnter } from '../../../../lib/eli_autoindent';

import './stylesheet.css';

const setFieldValue = (el, value) => {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

// Tabla vacía en líneas propias, después de la línea del cursor
export const insertTableText = (value, cursor) => {
  const v = value || '';
  const s0 = cursor == null ? v.length : cursor;
  const lineEnd = v.indexOf('\n', s0) < 0 ? v.length : v.indexOf('\n', s0);
  const lineStart = v.lastIndexOf('\n', s0 - 1) + 1;
  const hasText = !!v.slice(lineStart, lineEnd).trim();
  const at = hasText ? lineEnd : lineStart;
  const pre = at > 0 && v[at - 1] !== '\n' ? '\n' : '';
  const post = at < v.length && v[at] !== '\n' ? '\n' : '';
  const block = pre + emptyOrgTable() + post;
  // el cursor, en la primera celda
  return { value: v.slice(0, at) + block + v.slice(at), cursor: at + pre.length + 2 };
};

export default function EliEditSheet({ header, setAccessor, onDone, onCancel }) {
  const [title, setTitle] = useState(header ? header.getIn(['titleLine', 'rawTitle']) || '' : '');
  const [notes, setNotes] = useState(header ? header.get('rawDescription') || '' : '');
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  const lastField = useRef(null);
  const values = useRef([title, notes]);
  values.current = [title, notes];

  useEffect(() => {
    if (setAccessor) setAccessor(() => values.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    try {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    } catch (e) {}
  }, []);

  const field = () => lastField.current || titleRef.current;
  const keep = (e) => e.preventDefault();

  const addTable = (e) => {
    e.stopPropagation();
    const el = notesRef.current;
    if (!el) return;
    const r = insertTableText(el.value, el.selectionStart);
    setFieldValue(el, r.value);
    try {
      el.focus();
      el.setSelectionRange(r.cursor, r.cursor);
    } catch (err) {}
  };

  return (
    <div className="eli-edit-sheet" data-testid="eli-edit-sheet">
      <div className="eli-edit-sheet__bar">
        <button
          type="button"
          className="btn-passive eli-edit-sheet__cancel"
          onClick={onCancel}
          data-testid="eli-edit-sheet-cancel"
        >
          Cancelar
        </button>
        <h2 className="eli-edit-sheet__heading">Editar</h2>
        <button
          type="button"
          className="btn eli-edit-sheet__done"
          onClick={onDone}
          data-testid="eli-edit-sheet-done"
        >
          <i className="fas fa-check" /> Listo
        </button>
      </div>
      <textarea
        ref={titleRef}
        className="textarea eli-edit-sheet__title"
        rows="2"
        value={title}
        placeholder="Título"
        enterKeyHint="next"
        onFocus={() => (lastField.current = titleRef.current)}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => {
          // Intro: al texto (el título es una sola línea)
          if (e.key === 'Enter' && !(e.nativeEvent && e.nativeEvent.isComposing)) {
            e.preventDefault();
            if (notesRef.current) notesRef.current.focus();
          }
        }}
        data-testid="eli-edit-sheet-title"
      />
      <div className="eli-edit-sheet__format">
        <EliFormatBar collapsible={false} getField={field} getListField={() => notesRef.current} />
        <button
          type="button"
          className="eli-format-bar__btn eli-edit-sheet__table"
          title="Tabla"
          aria-label="Tabla"
          onMouseDown={keep}
          onClick={addTable}
          data-testid="eli-edit-sheet-table"
        >
          <i className="fas fa-table" />
        </button>
      </div>
      <textarea
        ref={notesRef}
        className="textarea eli-edit-sheet__notes"
        rows="10"
        value={notes}
        placeholder="Texto"
        onFocus={() => (lastField.current = notesRef.current)}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if (!isPlainEnter(e)) return;
          const el = e.currentTarget;
          const r = autoIndentEnter(el.value, el.selectionStart, el.selectionEnd);
          if (!r) return;
          e.preventDefault();
          setFieldValue(el, r.value);
          try {
            el.setSelectionRange(r.cursor, r.cursor);
          } catch (err) {}
        }}
        data-testid="eli-edit-sheet-notes"
      />
    </div>
  );
}
