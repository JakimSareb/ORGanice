import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { List } from 'immutable';

import './stylesheet.css';

import * as orgActions from '../../../../actions/org';
import { collectContexts, TODO_FILTER_KEYWORDS } from '../../../../lib/gtd_contexts';

// ORG Mode para Eli: barras de filtro.
//  - Contextos GTD: de las líneas "#+TAGS:" (solo etiquetas que empiezan por @).
//  - Estado: TODO, NEXT, WAITING, MAYBE, PROJECT.
// Dentro de una fila, varios seleccionados = cualquiera de ellos; entre filas se combinan (Y).
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

function ContextFilterBar({ contexts, selectedContexts, selectedTodos, org }) {
  const allContexts = contexts.concat(
    selectedContexts.filter((c) => !contexts.includes(c)).toArray()
  );
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
      <ChipRow
        label="Estado"
        items={TODO_FILTER_KEYWORDS}
        selected={selectedTodos}
        onToggle={org.toggleTodoFilter}
        onClear={org.clearTodoFilter}
      />
    </div>
  );
}

const mapStateToProps = (state) => ({
  contexts: collectContexts(state.org.present.get('files')),
  selectedContexts: state.org.present.get('contextFilter') || List(),
  selectedTodos: state.org.present.get('todoFilter') || List(),
});

const mapDispatchToProps = (dispatch) => ({
  org: bindActionCreators(orgActions, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(ContextFilterBar);
