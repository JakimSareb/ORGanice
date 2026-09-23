import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { List } from 'immutable';

import './stylesheet.css';

import * as orgActions from '../../../../actions/org';
import { collectContexts } from '../../../../lib/gtd_contexts';

// ORG Mode para Eli: barra de filtro por contextos GTD.
// Los contextos salen de las líneas "#+TAGS:" (solo etiquetas que empiezan por @)
// de los ficheros cargados. Seleccionar varios = cualquiera de ellos (O).
function ContextFilterBar({ contexts, selected, org }) {
  if (contexts.length === 0 && selected.size === 0) return null;
  const all = contexts.concat(selected.filter((c) => !contexts.includes(c)).toArray());
  return (
    <div className="context-filter-bar" role="group" aria-label="Filtro por contexto">
      <span
        className={'context-filter-bar__chip' + (selected.size === 0 ? ' is-selected' : '')}
        onClick={() => org.clearContextFilter()}
      >
        Todos
      </span>
      {all.map((c) => (
        <span
          key={c}
          className={'context-filter-bar__chip' + (selected.includes(c) ? ' is-selected' : '')}
          onClick={() => org.toggleContextFilter(c)}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

const mapStateToProps = (state) => ({
  contexts: collectContexts(state.org.present.get('files')),
  selected: state.org.present.get('contextFilter') || List(),
});

const mapDispatchToProps = (dispatch) => ({
  org: bindActionCreators(orgActions, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(ContextFilterBar);
