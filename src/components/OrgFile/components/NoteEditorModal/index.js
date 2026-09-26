import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import './stylesheet.css';

import * as baseActions from '../../../../actions/base';
import * as orgActions from '../../../../actions/org';

import _ from 'lodash';
import EliFormatBar from '../../../EliFormatBar';

class NoteEditorModal extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, ['handleTextareaRef', 'addNote', 'handleDescriptionChange']);

    this.state = {
      allTags: props.allTags,
      note: '',
    };
  }

  handleTextareaRef(textarea) {
    this.textarea = textarea;
  }

  addNote() {
    let { note } = this.state;
    if (note !== null) note = note.trim();
    if (!note) return;

    if (this.props.onAddNote) {
      this.props.onAddNote(note, new Date());
    } else {
      this.props.org.addNote(note, new Date());
    }
    this.setState({ note: '' });
  }

  handleNoteFieldClick(event) {
    event.stopPropagation();
  }

  handleDescriptionChange(event) {
    this.setState({ note: event.target.value });
  }

  render() {
    return (
      <>
        <h2 className="drawer-modal__title">Añadir nota</h2>
        <div>Escribe una nota para añadir al encabezado:</div>
        <EliFormatBar getField={() => this.textarea} />
        <textarea
          autoFocus
          className="textarea drag-handle eli-note-textarea"
          data-testid="titleLineInput"
          rows="3"
          ref={this.handleTextareaRef}
          value={this.state.note}
          onClick={this.handleNoteFieldClick}
          onChange={this.handleDescriptionChange}
        />
        <button className="btn note-editor__done-btn" onClick={() => this.addNote()}>
          Añadir
        </button>
      </>
    );
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    base: bindActionCreators(baseActions, dispatch),
    org: bindActionCreators(orgActions, dispatch),
  };
};

export default connect(null, mapDispatchToProps)(NoteEditorModal);
