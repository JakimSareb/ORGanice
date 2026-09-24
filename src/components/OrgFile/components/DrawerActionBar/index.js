import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Map } from 'immutable';

import * as orgActions from '../../../../actions/org';
import * as baseActions from '../../../../actions/base';

import './stylesheet.css';

import _ from 'lodash';

import DrawerActionButtons from './components/DrawerActionButtons';

import { getSelectedHeader } from '../../../../lib/org_utils';
import { getCurrentTimestampAsText } from '../../../../lib/timestamps';
import { insertIntoField, openUploadDialog } from '../../../EliTools';

// ORG Mode para Eli: campo de texto que se está editando en la ventana de edición del
// encabezado (título o descripción), si lo hay.
const activeEditField = () =>
  document.querySelector(
    '.header-content__edit-container textarea, .title-line__edit-container textarea'
  );

class DrawerActionBar extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, [
      'handleShowTitleEditModal',
      'handleShowDescriptionEditModal',
      'handleShowTagsModal',
      'handleShowPropertyListEditorModal',
      'handleShowDeadlineModal',
      'handleShowScheduledModal',
      'handleShowNoteModal',
      'handleRemoveHeader',
      'handleInsertInactiveDate',
      'handleAttachFiles',
    ]);
  }

  handleShowTitleEditModal() {
    this.props.onSwitch();
    this.props.base.activatePopup('title-editor');
  }

  handleShowDescriptionEditModal() {
    this.props.onSwitch();
    if (!this.props.captureMode && this.props.selectedHeaderId) {
      this.props.org.openHeader(this.props.selectedHeaderId);
    }
    this.props.base.activatePopup('description-editor');
  }

  handleShowTagsModal() {
    this.props.onSwitch();
    this.props.base.activatePopup('tags-editor');
  }

  handleShowPropertyListEditorModal() {
    this.props.onSwitch();
    this.props.base.activatePopup('property-list-editor');
  }

  handleDeadlineAndScheduledClick(planningType) {
    const { captureMode, captureHeader, header, selectedHeaderId } = this.props;
    const activeHeader = captureMode ? captureHeader : header;
    const popupType = {
      DEADLINE: 'deadline-editor',
      SCHEDULED: 'scheduled-editor',
    }[planningType];

    const existingDeadlinePlanningItemIndex = activeHeader
      ? activeHeader
          .get('planningItems', [])
          .findIndex((planningItem) => planningItem.get('type') === planningType)
      : -1;
    this.props.base.activatePopup(popupType, {
      headerId: activeHeader ? activeHeader.get('id') : null,
      planningItemIndex: existingDeadlinePlanningItemIndex,
    });

    if (!captureMode && selectedHeaderId) {
      this.props.org.openHeader(selectedHeaderId);
    }
  }

  handleShowDeadlineModal() {
    this.props.onSwitch();
    this.handleDeadlineAndScheduledClick('DEADLINE');
  }

  handleShowScheduledModal() {
    this.props.onSwitch();
    this.handleDeadlineAndScheduledClick('SCHEDULED');
  }

  handleShowNoteModal() {
    this.props.onSwitch();
    this.props.base.activatePopup('note-editor');
  }

  // ORG Mode para Eli: fecha inactiva de hoy en el cursor del texto que se edita; si no se
  // está editando texto, al final del contenido del encabezado.
  handleInsertInactiveDate() {
    const stamp = getCurrentTimestampAsText({ isActive: false });
    const field = activeEditField();
    if (field) {
      insertIntoField(field, stamp, field.selectionStart, field.selectionEnd);
      return;
    }
    const { captureMode, selectedHeaderId } = this.props;
    if (!captureMode && selectedHeaderId) this.props.org.insertInactiveDate(selectedHeaderId);
  }

  // ORG Mode para Eli: adjuntar archivos (se suben a assets/AAAA); el enlace va al cursor del
  // texto que se edita o, si no, al final del encabezado.
  handleAttachFiles() {
    const field = activeEditField();
    const target = field
      ? { el: field, start: field.selectionStart, end: field.selectionEnd }
      : null;
    const { captureMode, selectedHeaderId } = this.props;
    const headerId = captureMode ? null : selectedHeaderId;
    if (!target && !headerId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (files.length) openUploadDialog({ files, headerId, target, source: 'attach' });
    });
    document.body.appendChild(input);
    input.click();
  }

  handleRemoveHeader() {
    if (this.props.captureMode) {
      // In capture mode, "delete" discards the capture by closing the popup
      this.props.base.closePopup();
      return;
    }
    this.props.base.closePopup();
    this.props.org.selectHeader(null);
    this.props.org.removeHeader(this.props.header.get('id'));
  }

  render() {
    return (
      <div className="static-action-bar">
        <DrawerActionButtons
          activePopupType={this.props.activePopupType}
          onSwitch={this.props.onSwitch}
          onTitleClick={this.handleShowTitleEditModal}
          onDescriptionClick={this.handleShowDescriptionEditModal}
          onTagsClick={this.handleShowTagsModal}
          onPropertiesClick={this.handleShowPropertyListEditorModal}
          onDeadlineClick={this.handleShowDeadlineModal}
          onScheduledClick={this.handleShowScheduledModal}
          onAddNote={this.handleShowNoteModal}
          onRemoveHeader={this.handleRemoveHeader}
          onInsertInactiveDate={this.handleInsertInactiveDate}
          onAttachFiles={this.handleAttachFiles}
          editRawValues={this.props.editRawValues}
          setEditRawValues={this.props.setEditRawValues}
          restorePreferEditRawValues={this.props.restorePreferEditRawValues}
        />
      </div>
    );
  }
}

const mapStateToProps = (state) => {
  const path = state.org.present.get('path');
  const file = state.org.present.getIn(['files', path], Map());
  const activePopup = state.base.get('activePopup');
  return {
    selectedHeaderId: file.get('selectedHeaderId'),
    header: getSelectedHeader(state),
    activePopupType: !!activePopup ? activePopup.get('type') : null,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    org: bindActionCreators(orgActions, dispatch),
    base: bindActionCreators(baseActions, dispatch),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(DrawerActionBar);
