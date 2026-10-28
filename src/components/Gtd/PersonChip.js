// ORG Mode para Eli (4.50): chip de una persona (:PERSONA:). Lo usan el editor de tarea (con ×
// para quitarla) y la fila de tarea de todas las listas GTD (compacto). Tocar el nombre = ficha.
import React from 'react';

export const PersonChip = ({
  name,
  broken = false,
  onOpen = null,
  onRemove = null,
  compact = false,
  testId = 'gtd-editor-person',
}) => (
  <span
    className={
      'gtd-chip gtd-chip--person' + (compact ? ' gtd-chip--row' : '') + (broken ? ' is-broken' : '')
    }
    data-testid={testId}
    title={broken ? 'Contacto no encontrado en personas.org' : undefined}
  >
    <span
      className="gtd-chip__label"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (!onOpen) return;
        e.stopPropagation();
        onOpen();
      }}
      onDoubleClick={compact ? (e) => e.stopPropagation() : undefined}
      onPointerDown={compact ? (e) => e.stopPropagation() : undefined}
      title={broken ? undefined : 'Ver la ficha'}
    >
      <i className="fas fa-user" aria-hidden="true" /> {name || '?'}
    </span>
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label={`Quitar ${name}`}>
        ×
      </button>
    )}
  </span>
);

export default PersonChip;
