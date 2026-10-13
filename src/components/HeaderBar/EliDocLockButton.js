// ORG Mode para Eli (3.02): candado de Documentos (modo lectura), siempre a la vista en la barra
// de arriba del documento. Con él puesto se lee y se navega sin entrar nunca en edición.
import React from 'react';
import { useDocLock, toggleDocLock } from '../../lib/eli_doc_lock';

export default function EliDocLockButton() {
  const locked = useDocLock();
  return (
    <i
      className={
        (locked ? 'fas fa-lock' : 'fas fa-lock-open') +
        ' header-bar__actions__item eli-lock-btn' +
        (locked ? ' is-active' : '')
      }
      onClick={() => {
        // si se estaba escribiendo, se guarda antes (como al tocar fuera)
        const el = document.activeElement;
        if (!locked && el && el.blur) el.blur();
        toggleDocLock();
      }}
      title={
        locked
          ? 'Candado puesto (solo lectura): tócalo para poder editar'
          : 'Poner el candado (solo lectura): leer sin editar sin querer'
      }
      aria-label={locked ? 'Quitar el candado' : 'Poner el candado'}
      aria-pressed={locked}
      data-testid="eli-doc-lock"
      role="button"
    />
  );
}
