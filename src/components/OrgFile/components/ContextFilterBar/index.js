import React, { useState } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { List } from 'immutable';

import './stylesheet.css';

import * as orgActions from '../../../../actions/org';
import { availableFacets } from '../../../../lib/gtd_contexts';

// ORG Mode para Eli: barras de filtro.
//  - Contextos GTD: de las líneas "#+TAGS:" (solo etiquetas que empiezan por @).
//  - Estado: TODO, NEXT, WAITING, MAYBE, PROJECT.
// Solo se muestran los contextos y estados presentes con los filtros actuales. Varios contextos
// seleccionados = deben cumplirse todos (Y); varios estados = cualquiera de ellos (O).
const ChipRow = ({ label, items, selected, onToggle, onClear }) => (
  <div className="context-filter-bar" role="group" aria-label={label}>
    <span className="context-filter-bar__label">{label}</span>
    <span
      className={'context-filter-bar__chip' + (selected.size === 0 ? ' is-selected' : '')}
      onClick={onClear}
    >
      Todos
    </span>
    {items.map((c) => (
      <span
        key={c}
        className={'context-filter-bar__chip' + (selected.includes(c) ? ' is-selected' : '')}
        onClick={() => onToggle(c)}
      >
        {c}
      </span>
    ))}
  </div>
);

// ORG Mode para Eli: plegado tras «Filtrar», como en la vista GTD; fuera solo se ven los filtros
// activos (tocarlos los quita)
function ContextFilterBar({ contexts, todos, selectedContexts, selectedTodos, org }) {
  const [open, setOpen] = useState(false);
  const allContexts = contexts;
  const active = selectedContexts.size + selectedTodos.size;
  if (!allContexts.length && !todos.length && !active) return null;
  return (
    <div className="context-filter-bars" data-testid="context-filter-bars">
      <div className="context-filter-bars__bar">
        <button
          type="button"
          className={'context-filter-bars__toggle' + (open ? ' is-open' : '')}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          data-testid="context-filter-toggle"
        >
          <i className="fas fa-filter" /> Filtrar
          {active > 0 && <span className="context-filter-bars__count">{active}</span>}
        </button>
        {!open &&
          selectedContexts.map((c) => (
            <button
              type="button"
              key={`c-${c}`}
              className="context-filter-bar__chip is-selected"
              onClick={() => org.toggleContextFilter(c)}
            >
              {c} ×
            </button>
          ))}
        {!open &&
          selectedTodos.map((t) => (
            <button
              type="button"
              key={`t-${t}`}
              className="context-filter-bar__chip is-selected"
              onClick={() => org.toggleTodoFilter(t)}
            >
              {t} ×
            </button>
          ))}
        {active > 0 && (
          <button
            type="button"
            className="context-filter-bar__chip context-filter-bar__chip--clear"
            onClick={() => {
              org.clearContextFilter();
              org.clearTodoFilter();
            }}
          >
            Quitar filtros
          </button>
        )}
      </div>
      {open && (
        <div className="context-filter-bars__panel" data-testid="context-filter-panel">
          {allContexts.length > 0 && (
            <ChipRow
              label="Contexto"
              items={allContexts}
              selected={selectedContexts}
              onToggle={org.toggleContextFilter}
              onClear={org.clearContextFilter}
            />
          )}
          {todos.length > 0 && (
            <ChipRow
              label="Estado"
              items={todos}
              selected={selectedTodos}
              onToggle={org.toggleTodoFilter}
              onClear={org.clearTodoFilter}
            />
          )}
        </div>
      )}
    </div>
  );
}

const mapStateToProps = (state) => {
  const selectedContexts = state.org.present.get('contextFilter') || List();
  const selectedTodos = state.org.present.get('todoFilter') || List();
  const { contexts, todos } = availableFacets(
    state.org.present.get('files'),
    selectedContexts,
    selectedTodos
  );
  return { contexts, todos, selectedContexts, selectedTodos };
};

const mapDispatchToProps = (dispatch) => ({
  org: bindActionCreators(orgActions, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(ContextFilterBar);
