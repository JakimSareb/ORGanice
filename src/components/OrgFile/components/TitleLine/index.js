import { getPriority, titlePartsWithoutPriority } from '../../../../lib/eli_priority';
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import './stylesheet.css';

import _ from 'lodash';
import classNames from 'classnames';

import * as orgActions from '../../../../actions/org';
import * as baseActions from '../../../../actions/base';

import { createIsTodoKeywordInDoneState, hasHeaderContent } from '../../../../lib/org_utils';

import { generateTitleLine } from '../../../../lib/export_org';
import AttributedString from '../AttributedString';
import { attachmentCountOfHeader } from '../../../../lib/eli_attachments';
import { legacyHeaderTapOpen } from '../../../../lib/eli_tap_mode';
import { isDocLocked } from '../../../../lib/eli_doc_lock';

class TitleLine extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, ['handleTitleClick', 'handleTodoClick', 'handleTimestampClick']);

    this.state = {
      titleValue: this.calculateRawTitle(props.header),
      containerWidth: null,
      shouldIgnoreBlur: false,
    };
  }

  storeContainerWidth() {
    if (this.containerDiv) {
      this.setState({ containerWidth: this.containerDiv.offsetWidth });
    }
  }

  componentDidMount() {
    this.storeContainerWidth();
  }

  componentDidUpdate(prevProps) {
    const { header } = this.props;

    if (prevProps.header !== header) {
      this.setState(
        {
          titleValue: this.calculateRawTitle(header),
        },
        () => this.storeContainerWidth()
      );
    }
  }

  calculateRawTitle(header) {
    return generateTitleLine(header.toJS(), false);
  }

  handleTitleClick(event) {
    const { header, hasContent, isSelected, onClick, closeSubheadersRecursively } = this.props;

    if (!!onClick) {
      onClick();
      return;
    }
    // (3.02) Dos toques / doble clic = editar el título en su sitio (con el candado puesto, no).
    // (3.05) Un toque en uno no seleccionado = solo seleccionarlo; en el ya seleccionado =
    // plegar/desplegar (antes, el primer toque ya plegaba).
    const onInner =
      event &&
      event.target &&
      event.target.closest &&
      event.target.closest('a, button, input, .timestamp, .todo-keyword, .eli-attach-indicator');
    // (4.04) Sin ajuste: el primer toque selecciona; en la ya seleccionada, el título se pone en
    // edición en su sitio. Plegar/desplegar = la viñeta (con el candado, el toque pliega).
    if (legacyHeaderTapOpen()) {
      if (hasContent && !onInner)
        this.props.org.toggleHeaderOpened(header.get('id'), closeSubheadersRecursively);
      this.props.org.selectHeader(header.get('id'));
      return;
    }
    if (!isSelected) {
      this.props.org.selectHeader(header.get('id'));
      return;
    }
    if (onInner) return;
    if (!this.props.shouldDisableActions && !isDocLocked()) {
      this.props.base.activatePopup('title-editor');
      return;
    }
    if (hasContent) this.props.org.toggleHeaderOpened(header.get('id'), closeSubheadersRecursively);
    this.props.org.selectHeader(header.get('id'));
  }

  handleTodoClick(event) {
    const { header, shouldTapTodoToAdvance, setShouldLogIntoDrawer, onClick } = this.props;

    if (!!onClick) {
      onClick();
      event.stopPropagation();
    } else {
      this.props.org.selectHeader(header.get('id'));

      if (shouldTapTodoToAdvance && !isDocLocked()) {
        this.props.org.advanceTodoState(null, setShouldLogIntoDrawer);
      }
    }
  }

  handleTitleFieldClick(event) {
    event.stopPropagation();
  }

  handleTimestampClick(timestampId) {
    this.props.base.activatePopup('timestamp-editor', {
      headerId: this.props.header.get('id'),
      timestampId,
    });
  }

  render() {
    const {
      header,
      color,
      hasContent,
      shouldDisableActions,
      shouldDisableExplicitWidth,
      todoKeywordSets,
      addition,
      showDeadlineDisplay,
      headerDeadlineMap,
      deadlineString,
      isOverdue,
      eliHideTodoKeyword,
    } = this.props;
    const { containerWidth } = this.state;

    const isTodoKeywordInDoneState = createIsTodoKeywordInDoneState(todoKeywordSets);
    const todoKeyword = header.getIn(['titleLine', 'todoKeyword']);
    const priority = getPriority(header);
    // ORG Mode para Eli (2.11): clip si el encabezado tiene archivos adjuntos
    const attachmentCount = attachmentCountOfHeader(header);

    const titleStyle = {
      color,
      wordBreak: 'break-word',
    };

    const additionStyle = {
      color,
      minWidth: '5em',
      textAlign: 'right',
      marginRight: '2em',
      whiteSpace: 'nowrap',
    };

    return (
      <div
        className={classNames('title-line', {
          // (2.17) DONE / CANCELLED: encabezado atenuado
          'title-line--finished': !!todoKeyword && isTodoKeywordInDoneState(todoKeyword),
        })}
        onClick={this.handleTitleClick}
        style={{ width: shouldDisableExplicitWidth ? '' : containerWidth }}
      >
        {/* ORG Mode para Eli: en los hábitos de la agenda no se muestra el estado */}
        {!!todoKeyword && !eliHideTodoKeyword ? (
          <span
            // INFO: Instead of `todoKeyword.toLowerCase()` it would
            // be best to render todo-keyword--done if the keyword is
            // the last of a keywordSet. Then it would get rendered
            // with the appropriate color, no matter what the keyword
            // is.
            // Relevant issue: https://github.com/200ok-ch/organice/issues/16
            className={classNames(
              'todo-keyword',
              isTodoKeywordInDoneState(todoKeyword) ? 'todo-keyword--done-state' : null
            )}
            onClick={this.handleTodoClick}
          >
            {todoKeyword}
          </span>
        ) : (
          ''
        )}

        {
          <div style={{ width: '100%' }}>
            <div className="title-line-text">
              <span style={titleStyle}>
                {priority === 'A' ? (
                  <i className="fas fa-star eli-priority-star" title="Prioridad A" />
                ) : priority ? (
                  <span className="eli-priority-badge" title={`Prioridad ${priority}`}>
                    {priority}
                  </span>
                ) : null}
                <AttributedString
                  parts={titlePartsWithoutPriority(header.getIn(['titleLine', 'title']))}
                  subPartDataAndHandlers={{
                    onTimestampClick: this.handleTimestampClick,
                    shouldDisableActions,
                  }}
                />
                {(!header.get('opened') && hasContent) ||
                (header.get('opened') && header.get('eliHideBody') && hasHeaderContent(header))
                  ? '...'
                  : ''}
                {attachmentCount > 0 && (
                  <span
                    className="eli-attach-indicator"
                    title={
                      attachmentCount === 1
                        ? 'Tiene 1 archivo adjunto'
                        : `Tiene ${attachmentCount} archivos adjuntos`
                    }
                    data-testid="eli-attach-indicator"
                  >
                    <i className="fas fa-paperclip" />
                    {attachmentCount > 1 ? ` ${attachmentCount}` : ''}
                  </span>
                )}
              </span>
              {addition ? <span style={additionStyle}>{addition}</span> : null}
              {showDeadlineDisplay && headerDeadlineMap && (
                <span
                  className={classNames('header-deadline', {
                    'header-deadline--overdue': isOverdue,
                  })}
                >
                  {addition ? ' ' : ''}
                  {deadlineString}
                </span>
              )}
            </div>
            {header.getIn(['titleLine', 'tags']).size > 0 && (
              <div>
                {header
                  .getIn(['titleLine', 'tags'])
                  .toSet()
                  .toList()
                  .filter((tag) => !!tag)
                  .map((tag) => (
                    <div className="header-tag" key={tag}>
                      {tag}
                    </div>
                  ))}
              </div>
            )}
          </div>
        }
      </div>
    );
  }
}

const mapStateToProps = (state, ownProps) => {
  const path = state.org.present.get('path');
  const file = state.org.present.getIn(['files', path]);
  const selectedHeaderId = !!file ? file.get('selectedHeaderId') : null;
  // ORG Mode para Eli: en la agenda/búsqueda el encabezado trae su fichero (puede no ser el
  // abierto, o no haber ninguno abierto, p. ej. desde el explorador de ficheros)
  const ownPath = ownProps.header.get('path');
  const ownFile = ownPath ? state.org.present.getIn(['files', ownPath]) : null;
  const sets = (ownFile && ownFile.get('todoKeywordSets')) || (file && file.get('todoKeywordSets'));
  return {
    setShouldLogIntoDrawer: state.base.get('shouldLogIntoDrawer'),
    shouldTapTodoToAdvance: state.base.get('shouldTapTodoToAdvance'),
    closeSubheadersRecursively: state.base.get('closeSubheadersRecursively'),
    isSelected: selectedHeaderId === ownProps.header.get('id'),
    todoKeywordSets: sets || null,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
    base: bindActionCreators(baseActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(TitleLine);
