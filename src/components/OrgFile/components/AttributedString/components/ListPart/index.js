import React, { PureComponent, Fragment } from 'react';

import './stylesheet.css';

import AttributedString from '../../../AttributedString/';
import Checkbox from '../../../../../UI/Checkbox/';
import { listPartContainsItemId } from '../../../../../../lib/org_utils';

import { attributedStringToRawText } from '../../../../../../lib/export_org';

import { eliInsertTodayInactive } from '../../../../../../lib/timestamps';

import _ from 'lodash';
import classNames from 'classnames';
import EliFormatBar from '../../../../../EliFormatBar';
import { Map } from 'immutable';
import {
  isListFolded,
  toggleListFold,
  itemHasChildren,
  subscribeListFold,
} from '../../../../../../lib/eli_list_fold';

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
      'handleBulletClick',
    ]);

    this.state = {
      listTitleValues: this.generateListTitleValueMap(props.part),
      listContentsValues: this.generateListContentsValueMap(props.part),
      shouldIgnoreBlur: false,
    };
  }

  // (4.40) el plegado de los elementos es solo visual: se repinta cuando cambia
  componentDidMount() {
    this.unsubscribeFold = subscribeListFold(() => this.forceUpdate());
  }

  componentWillUnmount() {
    if (this.unsubscribeFold) this.unsubscribeFold();
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
    // ORG Mode para Eli (2.13): en el texto de un elemento de la lista, Intro termina (como en
    // el título de un encabezado); Mayúsculas+Intro hace un salto de línea
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !(event.nativeEvent && event.nativeEvent.isComposing) &&
      event.keyCode !== 229 &&
      event.target.getAttribute('data-testid') === 'list-item-edit'
    ) {
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
    // ORG Mode para Eli (2.13): al empezar a editar, el cursor al final del texto
    if (textarea && textarea !== this.textarea) {
      const end = (textarea.value || '').length;
      try {
        textarea.setSelectionRange(end, end);
      } catch (e) {}
    }
    this.textarea = textarea;
  }

  renderContent() {
    const {
      part,
      subPartDataAndHandlers: { selectedListItemId, inListTitleEditMode, inListContentsEditMode },
    } = this.props;
    const { listTitleValues, listContentsValues } = this.state;

    return part.get('items').map((item) => {
      const isItemSelected = item.get('id') === selectedListItemId;
      const lineContainerClass = classNames({
        'list-part__not_checkbox-container': !item.get('isCheckbox'),
        'list-part__checkbox-container': item.get('isCheckbox'),
        'list-part__item--selected': isItemSelected,
      });

      // (4.40) tocar la viñeta (el propio <li>, no su texto) pliega o despliega los hijos
      const hasChildren = itemHasChildren(item);
      const isFolded = hasChildren && isListFolded(item.get('id'));
      return (
        <li
          key={item.get('id')}
          value={item.get('forceNumber')}
          data-list-item-id={item.get('id')}
          className={classNames({
            'list-part__li--has-children': hasChildren,
            'list-part__li--folded': isFolded,
          })}
          onClick={(e) => {
            if (hasChildren && e.target === e.currentTarget) toggleListFold(item.get('id'));
          }}
        >
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
          {/* (3.04) Las acciones del elemento (✎, contenido, ＋, ✕) van en la barra flotante */}
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
                if (e.target.closest('a, .eli-org-link, input, button, .eli-table-wrap, table'))
                  return;
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

  // (4.40) La viñeta cae fuera del <li> (en el margen de la lista): un toque ahí llega a la propia
  // lista. Se busca la fila tocada y se pliega/despliega si tiene hijos.
  handleBulletClick(e) {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY;
    const lis = Array.from(e.currentTarget.children);
    const li = lis.find((el) => {
      const row = el.firstElementChild;
      if (!row) return false;
      const r = row.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (!li) return;
    const item = this.props.part
      .get('items')
      .find((it) => String(it.get('id')) === li.getAttribute('data-list-item-id'));
    if (item && itemHasChildren(item)) toggleListFold(item.get('id'));
  }

  render() {
    return (
      <Fragment>
        {this.props.part.get('isOrdered') ? (
          <ol
            className="attributed-string__list-part attributed-string__list-part--ordered"
            onClick={this.handleBulletClick}
          >
            {this.renderContent()}
          </ol>
        ) : (
          <ul className="attributed-string__list-part" onClick={this.handleBulletClick}>
            {this.renderContent()}
          </ul>
        )}
      </Fragment>
    );
  }
}
