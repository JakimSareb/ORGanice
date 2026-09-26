import React, { PureComponent } from 'react';

import './stylesheet.css';
import EliMoreMenu from '../../../../../EliMoreMenu';

// ORG Mode para Eli: con el tabulador se salta entre estos editores (mayúsculas + tab, al revés)
const TAB_ORDER = [
  'title-editor',
  'description-editor',
  'tags-editor',
  'deadline-editor',
  'scheduled-editor',
];

export default class DrawerActionButtons extends PureComponent {
  constructor(props) {
    super(props);
    this.handleTabKey = this.handleTabKey.bind(this);
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleTabKey, true);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleTabKey, true);
  }

  handleTabKey(event) {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    const { activePopupType } = this.props;
    const index = TAB_ORDER.indexOf(activePopupType);
    if (index < 0) return;
    // Con otra ventana propia encima (p. ej. un diálogo), el tabulador funciona como siempre
    if (document.querySelector('.eli-prompt__overlay')) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? -1 : 1;
    const next = TAB_ORDER[(index + step + TAB_ORDER.length) % TAB_ORDER.length];
    const {
      onTitleClick,
      onDescriptionClick,
      onTagsClick,
      onDeadlineClick,
      onScheduledClick,
      restorePreferEditRawValues,
    } = this.props;
    if (next === 'title-editor' || next === 'description-editor') restorePreferEditRawValues();
    const handler = {
      'title-editor': onTitleClick,
      'description-editor': onDescriptionClick,
      'tags-editor': onTagsClick,
      'deadline-editor': onDeadlineClick,
      'scheduled-editor': onScheduledClick,
    }[next];
    if (handler) handler();
  }

  // A nasty hack required to get click handling to work properly in Firefox. No idea why its
  // broken in the first place or why this fixes it.
  iconWithFFClickCatcher({ className, onClick, title, disabled, testId = '', keepFocus }) {
    return (
      <div
        title={title}
        // ORG Mode para Eli: no quitar el foco (ni el cursor) del texto que se está editando
        onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
        onClick={!disabled ? onClick : undefined}
        className="header-action-drawer__ff-click-catcher-container"
      >
        <div className="header-action-drawer__ff-click-catcher" />
        <i className={className} data-testid={testId} />
      </div>
    );
  }

  render() {
    const {
      onSwitch,
      onTitleClick,
      onDescriptionClick,
      onTagsClick,
      onPropertiesClick,
      onDeadlineClick,
      onScheduledClick,
      onAddNote,
      onRemoveHeader,
      onAttachFiles,
      onInsertLink,
      activePopupType,
      editRawValues,
      setEditRawValues,
      restorePreferEditRawValues,
    } = this.props;

    return (
      <div className="header-action-drawer-container">
        <div className="header-action-drawer__row">
          {this.iconWithFFClickCatcher({
            className:
              'fas fa-pencil-alt fa-lg' +
              ('title-editor' === activePopupType ? ' drawer-action-button--selected' : ''),
            onClick: () => {
              if ('title-editor' === activePopupType) {
                onSwitch();
                setEditRawValues(!editRawValues);
              } else {
                restorePreferEditRawValues();
              }
              onTitleClick();
            },
            title: 'Editar título',
            testId: 'drawer-action-edit-title',
          })}

          {this.iconWithFFClickCatcher({
            className:
              'fas fa-edit fa-lg' +
              ('description-editor' === activePopupType ? ' drawer-action-button--selected' : ''),
            onClick: () => {
              if ('description-editor' === activePopupType) {
                onSwitch();
                setEditRawValues(!editRawValues);
              } else {
                restorePreferEditRawValues();
              }
              onDescriptionClick();
            },
            title: 'Editar descripción',
            testId: 'edit-header-title',
          })}

          {this.iconWithFFClickCatcher({
            className:
              'fas fa-tags fa-lg' +
              ('tags-editor' === activePopupType ? ' drawer-action-button--selected' : ''),
            onClick: onTagsClick,
            title: 'Modificar etiquetas',
            disabled: 'tags-editor' === activePopupType,
            testId: 'drawer-action-tags',
          })}

          {this.iconWithFFClickCatcher({
            className:
              'fas fa-calendar-check fa-lg' +
              ('deadline-editor' === activePopupType ? ' drawer-action-button--selected' : ''),
            onClick: onDeadlineClick,
            title: 'Fijar fecha límite',
            disabled: 'deadline-editor' === activePopupType,
            testId: 'drawer-action-deadline',
          })}
          {this.iconWithFFClickCatcher({
            className:
              'far fa-calendar-check fa-lg' +
              ('scheduled-editor' === activePopupType ? ' drawer-action-button--selected' : ''),
            onClick: onScheduledClick,
            title: 'Fijar fecha programada',
            disabled: 'scheduled-editor' === activePopupType,
            testId: 'drawer-action-scheduled',
          })}

          {onInsertLink &&
            ['title-editor', 'description-editor', 'note-editor'].includes(activePopupType) &&
            this.iconWithFFClickCatcher({
              className: 'fas fa-link fa-lg',
              onClick: onInsertLink,
              title: 'Insertar enlace [[enlace][descripción]]',
              testId: 'drawer-action-link',
              keepFocus: true,
            })}

          {/* ORG Mode para Eli: lo menos usado, en «⋯» */}
          <div className="header-action-drawer__ff-click-catcher-container eli-drawer-more">
            <EliMoreMenu
              testId="eli-more-editor"
              keepFocus
              items={[
                {
                  icon: 'fas fa-list',
                  label: 'Propiedades',
                  onClick: onPropertiesClick,
                  disabled: 'property-list-editor' === activePopupType,
                  testId: 'drawer-action-properties',
                },
                onAttachFiles && {
                  icon: 'fas fa-paperclip',
                  label: 'Adjuntar archivo',
                  onClick: onAttachFiles,
                  testId: 'drawer-action-attach',
                },
                {
                  icon: 'far fa-sticky-note',
                  label: 'Añadir una nota',
                  onClick: onAddNote,
                  disabled: 'note-editor' === activePopupType,
                  testId: 'drawer-action-note',
                },
                {
                  icon: 'fas fa-trash',
                  label: 'Borrar el encabezado',
                  onClick: onRemoveHeader,
                  disabled: 'note-editor' === activePopupType,
                  danger: true,
                  testId: 'drawer-action-remove',
                },
              ]}
            />
          </div>
        </div>
      </div>
    );
  }
}
