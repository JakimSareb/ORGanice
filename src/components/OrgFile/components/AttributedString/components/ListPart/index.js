import React, { PureComponent, Fragment } from 'react';
import { UnmountClosed as Collapse } from 'react-collapse';

import './stylesheet.css';

import AttributedString from '../../../AttributedString/';
import Checkbox from '../../../../../UI/Checkbox/';
import ListActionDrawer from './ListActionDrawer';
import { listPartContainsItemId } from '../../../../../../lib/org_utils';

import { attributedStringToRawText } from '../../../../../../lib/export_org';

import { eliInsertTodayInactive } from '../../../../../../lib/timestamps';

import _ from 'lodash';
import classNames from 'classnames';
import EliFormatBar from '../../../../../EliFormatBar';
import { Map } from 'immutable';

export default class ListPart extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, [
      'handleListItemSelect',
      'handleCheckboxClick',
      'handleTextareaBlur',
      'handleEliTextareaKeyDown',
      'handleListTitleChange',
      'handleListContentsChange',
      'handleInsertTimestampListTitle',
      'handleInsertTimestampListContents',
      'handleTextareaRef',
    ]);

    this.state = {
      listTitleValues: this.generateListTitleValueMap(props.part),
      listContentsValues: this.generateListContentsValueMap(props.part),
      shouldIgnoreBlur: false,
    };
  }

  componentDidUpdate(prevProps) {
    const {
      subPartDataAndHandlers: {
        onListTitleValueUpdate,
        onListContentsValueUpdate,
        inListTitleEditMode,
        inListContentsEditMode,
        selectedListItemId,
      },
    } = this.props;
    const { listTitleValues, listContentsValues } = this.state;

    if (prevProps.subPartDataAndHandlers.inListTitleEditMode && !inListTitleEditMode) {
      if (listTitleValues.has(selectedListItemId)) {
        onListTitleValueUpdate(selectedListItemId, listTitleValues.get(selectedListItemId));
      }
    }

    const prevSelectedListItemId = prevProps.subPartDataAndHandlers.selectedListItemId;
    if (
      prevSelectedListItemId !== selectedListItemId &&
      inListTitleEditMode &&
      prevProps.subPartDataAndHandlers.inListTitleEditMode
    ) {
      if (
        listTitleValues.has(prevSelectedListItemId) &&
        listPartContainsItemId(this.props.part, prevSelectedListItemId)
      ) {
        onListTitleValueUpdate(prevSelectedListItemId, listTitleValues.get(prevSelectedListItemId));
      }
    }

    if (prevProps.subPartDataAndHandlers.inListContentsEditMode && !inListContentsEditMode) {
      if (listContentsValues.has(selectedListItemId)) {
        onListContentsValueUpdate(selectedListItemId, listContentsValues.get(selectedListItemId));
      }
    }

    if (
      prevSelectedListItemId !== selectedListItemId &&
      inListContentsEditMode &&
      prevProps.subPartDataAndHandlers.inListContentsEditMode
    ) {
      if (
        listContentsValues.has(prevSelectedListItemId) &&
        listPartContainsItemId(this.props.part, prevSelectedListItemId)
      ) {
        onListContentsValueUpdate(
          prevSelectedListItemId,
          listContentsValues.get(prevSelectedListItemId)
        );
      }
    }

    if (this.props.part !== prevProps.part) {
      this.setState({ listTitleValues: this.generateListTitleValueMap(this.props.part) });
      this.setState({ listContentsValues: this.generateListContentsValueMap(this.props.part) });
    }
  }

  generateListTitleValueMap(part) {
    return Map(
      part
        .get('items')
        .map((item) => [item.get('id'), attributedStringToRawText(item.get('titleLine'))])
    );
  }

  generateListContentsValueMap(part) {
    return Map(
      part
        .get('items')
        .map((item) => [item.get('id'), attributedStringToRawText(item.get('contents'))])
    );
  }

  handleListItemSelect(itemId) {
    return () => this.props.subPartDataAndHandlers.onListItemSelect(itemId);
  }

  handleCheckboxClick(e, itemId) {
    // Ticking a checkbox should only tick the checkbox, not enable
    // the list item manipulating functions from
    // `handleListItemSelect`.
    // Relevant discussion:
    // https://github.com/200ok-ch/organice/discussions/950
    e.stopPropagation();
    return this.props.subPartDataAndHandlers.onCheckboxClick(itemId);
  }

  // ORG Mode para Eli: Esc deja de editar el elemento (guardando, igual que al salir del cuadro)
  handleEliTextareaKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.target.blur();
    }
  }

  handleTextareaBlur() {
    setTimeout(() => {
      if (!this.state.shouldIgnoreBlur) {
        this.props.subPartDataAndHandlers.onExitListTitleEditMode();
      } else {
        this.setState({ shouldIgnoreBlur: false });
      }
    }, 0);
  }

  handleListTitleChange(event) {
    const { listTitleValues } = this.state;
    const {
      subPartDataAndHandlers: { selectedListItemId },
    } = this.props;

    this.setState({
      listTitleValues: listTitleValues.set(selectedListItemId, event.target.value),
    });
  }

  handleListContentsChange(event) {
    const { listContentsValues } = this.state;
    const {
      subPartDataAndHandlers: { selectedListItemId },
    } = this.props;

    this.setState({
      listContentsValues: listContentsValues.set(selectedListItemId, event.target.value),
    });
  }

  handleInsertTimestampListTitle() {
    // Clicking this button will unfocus the textarea, but we don't want to exit edit mode,
    // so instruct the blur handler to ignore the event.
    this.setState({ shouldIgnoreBlur: true });

    const { listTitleValues } = this.state;
    const {
      subPartDataAndHandlers: { selectedListItemId },
    } = this.props;
    const listTitleValue = listTitleValues.get(selectedListItemId);

    const insertionIndex = this.textarea.selectionStart;
    this.setState({
      listTitleValues: listTitleValues.set(
        selectedListItemId,
        eliInsertTodayInactive(
          listTitleValue,
          insertionIndex,
          this.textarea.selectionEnd || insertionIndex
        )
      ),
    });

    this.textarea.focus();
  }

  handleInsertTimestampListContents() {
    this.setState({ shouldIgnoreBlur: true });

    const { listContentsValues } = this.state;
    const {
      subPartDataAndHandlers: { selectedListItemId },
    } = this.props;
    const listContentsValue = listContentsValues.get(selectedListItemId);

    const insertionIndex = this.textarea.selectionStart;
    this.setState({
      listContentsValues: listContentsValues.set(
        selectedListItemId,
        eliInsertTodayInactive(
          listContentsValue,
          insertionIndex,
          this.textarea.selectionEnd || insertionIndex
        )
      ),
    });

    this.textarea.focus();
  }
  handleTextareaRef(textarea) {
    this.textarea = textarea;
  }

  renderContent() {
    const {
      part,
      subPartDataAndHandlers: {
        selectedListItemId,
        inListTitleEditMode,
        inListContentsEditMode,
        shouldDisableActions,
      },
    } = this.props;
    const { listTitleValues, listContentsValues } = this.state;

    return part.get('items').map((item) => {
      const isItemSelected = item.get('id') === selectedListItemId;
      const lineContainerClass = classNames({
        'list-part__not_checkbox-container': !item.get('isCheckbox'),
        'list-part__checkbox-container': item.get('isCheckbox'),
        'list-part__item--selected': isItemSelected,
      });

      return (
        <li key={item.get('id')} value={item.get('forceNumber')}>
          <div className={lineContainerClass} onClick={this.handleListItemSelect(item.get('id'))}>
            {item.get('isCheckbox') && (
              <Checkbox
                onClick={(e) => this.handleCheckboxClick(e, item.get('id'))}
                state={item.get('checkboxState')}
              />
            )}
            {isItemSelected && inListTitleEditMode ? (
              <div className="list-title-line__edit-container">
                <EliFormatBar compact getField={() => this.textarea} />
                <textarea
                  autoFocus
                  className="textarea"
                  data-testid="list-item-edit"
                  rows="3"
                  ref={this.handleTextareaRef}
                  value={listTitleValues.get(item.get('id'))}
                  onBlur={this.handleTextareaBlur}
                  onKeyDown={this.handleEliTextareaKeyDown}
                  onChange={this.handleListTitleChange}
                />
                <div
                  className="list-title-line__insert-timestamp-button"
                  onClick={this.handleInsertTimestampListTitle}
                >
                  <i className="fas fa-plus insert-timestamp-icon" />
                  Insertar fecha
                </div>
              </div>
            ) : listTitleValues.get(item.get('id')) ? (
              <AttributedString
                parts={item.get('titleLine')}
                subPartDataAndHandlers={this.props.subPartDataAndHandlers}
              />
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
          <Collapse isOpened={isItemSelected && !shouldDisableActions}>
            <ListActionDrawer subPartDataAndHandlers={this.props.subPartDataAndHandlers} />
          </Collapse>
          {isItemSelected && inListContentsEditMode ? (
            <div className="list-contents__edit-container">
              <EliFormatBar compact getField={() => this.textarea} />
              <textarea
                autoFocus
                className="textarea"
                rows="8"
                ref={this.handleTextareaRef}
                value={listContentsValues.get(item.get('id'))}
                onBlur={this.handleTextareaBlur}
                onKeyDown={this.handleEliTextareaKeyDown}
                onChange={this.handleListContentsChange}
              />
              <div
                className="list-contents__insert-timestamp-button"
                onClick={this.handleInsertTimestampListContents}
              >
                <i className="fas fa-plus insert-timestamp-icon" />
                Insertar fecha
              </div>
            </div>
          ) : (
            // ORG Mode para Eli: tocar el texto que cuelga de un elemento de la lista lo
            // selecciona (salvo que se toque un enlace o un elemento anidado)
            <div
              className="list-part__item-contents"
              onClick={(e) => {
                if (e.target.closest('a, .eli-org-link, input, button')) return;
                if (e.target.closest('li') !== e.currentTarget.closest('li')) return;
                this.props.subPartDataAndHandlers.onListItemSelect(item.get('id'));
              }}
            >
              <AttributedString
                parts={item.get('contents')}
                subPartDataAndHandlers={this.props.subPartDataAndHandlers}
              />
            </div>
          )}
        </li>
      );
    });
  }

  render() {
    return (
      <Fragment>
        {this.props.part.get('isOrdered') ? (
          <ol className="attributed-string__list-part attributed-string__list-part--ordered">
            {this.renderContent()}
          </ol>
        ) : (
          <ul className="attributed-string__list-part">{this.renderContent()}</ul>
        )}
      </Fragment>
    );
  }
}
