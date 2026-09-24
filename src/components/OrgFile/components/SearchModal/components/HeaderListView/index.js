import React, { useEffect } from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';

import { Map } from 'immutable';

import * as orgActions from '../../../../../../actions/org';
import './stylesheet.css';

import { millisDuration } from '../../../../../../lib/timestamps';

import TitleLine from '../../../TitleLine';
import { getBreadcrumbsStringFunction } from '../../../../../../lib/org_utils';
import {
  searchTerms,
  snippetsFor,
  findOccurrences,
} from '../../../../../../lib/eli_search_snippets';

function HeaderListView(props) {
  const { context } = props;
  function handleHeaderClick(path, headerId, reveal) {
    return (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      props.onHeaderClick(path, headerId, reveal);
    };
  }

  // Populate filteredHeaders
  useEffect(() => {
    // No specific searchFilter and cursorPosition, but set the
    // context (like 'search' or 'refile')
    if (context === 'Clock List') {
      props.org.setSearchFilterInformation('clock:now', 0, 'search');
    } else {
      props.org.setSearchFilterInformation('', 0, context);
    }
  }, [context, props.org]);

  const { headers, allHeaders, showClockedTimes, searchFilterExpr, searchScope } = props;
  // ORG Mode para Eli: en la búsqueda de Texto, fragmentos con contexto debajo de cada resultado
  const terms = context === 'search' && searchScope === 'text' ? searchTerms(searchFilterExpr) : [];

  return (
    <div className="agenda-day__container">
      <div className="agenda-day__headers-container">
        {Array.from(headers.entries(), ([path, headersOfFile]) => {
          const getBreadcrumbs = getBreadcrumbsStringFunction(allHeaders, path);
          return headersOfFile.map((header) => {
            const snippets = terms.length ? snippetsFor(header.get('rawDescription'), terms) : [];
            const titleMatches =
              terms.length > 0 &&
              findOccurrences(header.getIn(['titleLine', 'rawTitle']) || '', terms).length > 0;
            const firstReveal =
              snippets.length && !titleMatches
                ? { term: snippets[0].term, occurrence: snippets[0].occurrence }
                : undefined;
            return (
              <div key={header.get('id')} className="agenda-day__header-container">
                <div className="search__breadcrumbs">{getBreadcrumbs(header)}</div>
                <div className="agenda-day__header__header-container">
                  <TitleLine
                    header={header}
                    color="var(--base03)"
                    hasContent={false}
                    isSelected={false}
                    shouldDisableActions
                    shouldDisableExplicitWidth
                    onClick={handleHeaderClick(path, header.get('id'), firstReveal)}
                    addition={
                      showClockedTimes && header.get('totalFilteredTimeLoggedRecursive') !== 0
                        ? millisDuration(header.get('totalFilteredTimeLoggedRecursive'))
                        : null
                    }
                  />
                  {snippets.length > 0 && (
                    <div className="eli-search-snippets" data-testid="eli-search-snippets">
                      {snippets.map((sn, i) => (
                        <div
                          key={i}
                          className="eli-search-snippet"
                          onClick={handleHeaderClick(path, header.get('id'), {
                            term: sn.term,
                            occurrence: sn.occurrence,
                          })}
                          title="Ir a este texto"
                        >
                          {sn.before}
                          <mark>{sn.match}</mark>
                          {sn.after}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

const mapStateToProps = (state) => {
  const files = state.org.present.get('files');
  return {
    allHeaders: files.map((file) => file.get('headers')),
    headers: state.org.present.getIn(['search', 'filteredHeaders']) || Map(),
    showClockedTimes: state.org.present.getIn(['search', 'showClockedTimes']),
    searchFilterExpr: state.org.present.getIn(['search', 'searchFilterExpr']),
    searchScope: state.org.present.getIn(['search', 'scope']) || 'headers',
  };
};

const mapDispatchToProps = (dispatch) => ({
  org: bindActionCreators(orgActions, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(HeaderListView);
