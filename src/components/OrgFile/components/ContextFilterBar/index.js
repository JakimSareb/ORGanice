import React from 'react';
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

function ContextFilterBar({ contexts, todos, selectedContexts, selectedTodos, org }) {
  const allContexts = contexts;
  return (
    <div className="context-filter-bars">
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
