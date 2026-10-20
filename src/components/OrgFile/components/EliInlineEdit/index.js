// ORG Mode para Eli (3.02): edición EN EL SITIO (sin caja de edición). El título y las notas de un
// encabezado se escriben donde están: Documentos (OrgFile) da, por contexto, qué se edita y cómo
// pintar el editor; cada encabezado pone el editor en lugar de su título o de su contenido. Así
// el campo aparece en el mismo paso del toque (en el iPhone, el teclado sale a la primera).
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import './stylesheet.css';
import { keepCaretVisible, scrollParentOf } from '../../../../lib/eli_caret_view';

export const NOT_EDITING = { editing: null, render: null };
export const EliInlineEditContext = React.createContext(NOT_EDITING);

// Pinta el editor si este encabezado se está editando en `kind` ('title' | 'desc'); si no, `children`
export const InlineOr = ({ kind, headerId, children }) => (
  <EliInlineEditContext.Consumer>
    {(ctx) =>
      ctx.editing && ctx.editing.kind === kind && ctx.editing.headerId === headerId && ctx.render
        ? ctx.render(kind)
        : children
    }
  </EliInlineEditContext.Consumer>
);

// Cuadro de texto sin marco que crece solo. Esc (o tocar fuera) guarda y sale.
export const InlineTextarea = React.forwardRef(function InlineTextarea(
  { value, onDone, onKeyDown, className = '', ...rest },
  ref
) {
  const inner = useRef(null);
  const setRef = (el) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    // (3.47) al medir, el cuadro se encoge un instante: la página no debe volver arriba
    const scroller = scrollParentOf(el);
    const before = scroller ? scroller.scrollTop : window.scrollY;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
    const after = scroller ? scroller.scrollTop : window.scrollY;
    if (after !== before) {
      if (scroller) scroller.scrollTop = before;
      else window.scrollTo(window.scrollX, before);
    }
    keepCaretVisible(el);
  }, [value]);
  // (3.47) la vista sigue al cursor (notas más largas que la pantalla; teclado del iPhone)
  useEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const follow = () => keepCaretVisible(el);
    const timers = [60, 350, 700].map((ms) => setTimeout(follow, ms));
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', follow);
    document.addEventListener('selectionchange', follow);
    return () => {
      timers.forEach(clearTimeout);
      if (vv) vv.removeEventListener('resize', follow);
      document.removeEventListener('selectionchange', follow);
    };
  }, []);
  // Tocar fuera (salvo la barra de Documentos, menús y ventanas) guarda y sale
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let touch = null;
    const outside = (target) => {
      const el = inner.current;
      if (!el || !target || !target.closest || !target.isConnected) return;
      if (el.contains(target) || target === el) return;
      if (
        target.closest(
          '.eli-docbar, .eli-docbar-menu, .eli-prompt__overlay, .eli-palette__overlay, ' +
            '.eli-cal__overlay, .drawer-outer-container, .eli-more-menu, .eli-inline-keep'
        )
      )
        return;
      if (doneRef.current) doneRef.current();
    };
    const md = (e) => {
      if (e.pointerType === 'touch') return;
      outside(e.target);
    };
    const ts = (e) => {
      const p = e.touches && e.touches[0];
      touch = p ? { x: p.clientX, y: p.clientY, target: e.target } : null;
    };
    const te = (e) => {
      const p = e.changedTouches && e.changedTouches[0];
      if (!touch || !p) return;
      // desplazar la página no cuenta como tocar fuera
      if (Math.hypot(p.clientX - touch.x, p.clientY - touch.y) > 10) return;
      outside(touch.target);
    };
    document.addEventListener('pointerdown', md, true);
    document.addEventListener('touchstart', ts, true);
    document.addEventListener('touchend', te, true);
    return () => {
      document.removeEventListener('pointerdown', md, true);
      document.removeEventListener('touchstart', ts, true);
      document.removeEventListener('touchend', te, true);
    };
  }, []);
  return (
    <textarea
      ref={setRef}
      value={value}
      rows={1}
      className={'eli-inline-textarea ' + className}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          e.stopPropagation();
          if (onDone) onDone();
          return;
        }
        if (onKeyDown) onKeyDown(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        keepCaretVisible(e.currentTarget);
      }}
      onKeyUp={(e) => keepCaretVisible(e.currentTarget)}
      onDoubleClick={(e) => e.stopPropagation()}
      {...rest}
    />
  );
});
