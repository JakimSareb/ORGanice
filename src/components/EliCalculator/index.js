// ORG Mode para Eli (2.15): calculadora básica (menú ⋯ en todas las vistas y paleta).
import React, { useEffect, useRef, useState } from 'react';

import './stylesheet.css';

import { evaluate, formatNumber, plainNumber } from '../../lib/eli_calc';

export const openCalculator = () => window.dispatchEvent(new CustomEvent('eli:calculator'));

const KEYS = [
  ['C', '(', ')', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['%', '0', ',', '='],
];

const isTouch = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

export default function EliCalculator() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [last, setLast] = useState(null); // { expr, value } del último «=»
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setCopied(false);
    };
    window.addEventListener('eli:calculator', onOpen);
    return () => window.removeEventListener('eli:calculator', onOpen);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  if (!open) return null;

  let preview = '';
  let error = '';
  try {
    const v = evaluate(expr);
    preview = v === null ? '' : formatNumber(v);
  } catch (e) {
    error = e.message;
  }

  const close = () => setOpen(false);
  const focus = () => inputRef.current && !isTouch() && inputRef.current.focus();

  const equals = () => {
    try {
      const v = evaluate(expr);
      if (v === null) return;
      setLast({ expr, value: v });
      setExpr(plainNumber(v));
    } catch (e) {}
  };

  const press = (k) => {
    setCopied(false);
    if (k === 'C') setExpr('');
    else if (k === '⌫') setExpr((x) => x.slice(0, -1));
    else if (k === '=') equals();
    else setExpr((x) => x + k);
    focus();
  };

  const copy = () => {
    let text = '';
    try {
      const v = evaluate(expr);
      text = v === null ? '' : plainNumber(v);
    } catch (e) {}
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || (e.key === '=' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      equals();
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      if (expr) setExpr('');
      else close();
    } else {
      e.stopPropagation();
    }
  };

  return (
    <div
      className="eli-calc__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="eli-calculator"
    >
      <div className="eli-calc" role="dialog" aria-label="Calculadora">
        <div className="eli-calc__bar">
          <strong>Calculadora</strong>
          <span className="eli-calc__spacer" />
          <button
            className="eli-calc__tool"
            onClick={copy}
            title="Copiar el resultado"
            data-testid="eli-calc-copy"
          >
            {copied ? 'Copiado' : <i className="far fa-copy" />}
          </button>
          <button
            className="eli-calc__tool"
            onClick={close}
            title="Cerrar (Esc)"
            aria-label="Cerrar"
            data-testid="eli-calc-close"
          >
            <i className="fas fa-times" />
          </button>
        </div>
        {last && (
          <div className="eli-calc__last" data-testid="eli-calc-last">
            {last.expr} = {formatNumber(last.value)}
          </div>
        )}
        <input
          ref={inputRef}
          className="eli-calc__input"
          value={expr}
          onChange={(e) => {
            setCopied(false);
            setExpr(e.target.value);
          }}
          onKeyDown={onKeyDown}
          inputMode={isTouch() ? 'none' : 'decimal'}
          autoComplete="off"
          spellCheck="false"
          placeholder="0"
          aria-label="Operación"
          data-testid="eli-calc-input"
        />
        <div
          className={'eli-calc__result' + (error && expr ? ' is-error' : '')}
          data-testid="eli-calc-result"
        >
          {expr ? (error ? error : `= ${preview}`) : ' '}
        </div>
        <div className="eli-calc__keys">
          {KEYS.flat().map((k) => (
            <button
              key={k}
              className={
                'eli-calc__key' +
                ('÷×−+='.includes(k) ? ' is-op' : '') +
                (k === '=' ? ' is-eq' : '') +
                (k === 'C' ? ' is-clear' : '')
              }
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press(k)}
              data-testid={`eli-calc-key-${k}`}
            >
              {k}
            </button>
          ))}
          <button
            className="eli-calc__key eli-calc__key--wide"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press('⌫')}
            aria-label="Borrar el último"
            data-testid="eli-calc-key-back"
          >
            <i className="fas fa-backspace" />
          </button>
        </div>
      </div>
    </div>
  );
}
