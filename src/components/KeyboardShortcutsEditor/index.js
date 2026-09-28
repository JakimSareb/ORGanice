import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { withRouter } from 'react-router-dom';

import { Map } from 'immutable';

import ShortcutRow from './components/ShortcutRow';

import * as baseActions from '../../actions/base';

import {
  calculateNamedKeybindings,
  calculateGtdKeybindings,
  keybindingLabel,
} from '../../lib/keybindings';

import './stylesheet.css';

const KeyboardShortcutsEditor = ({ customKeybindings, base }) => {
  // ORG Mode para Eli (2.15): los atajos de Documentos y los de la vista GTD se comprueban por
  // separado (cada vista tiene los suyos)
  const gtd = calculateGtdKeybindings(customKeybindings);
  const isGtd = (name) => gtd.some((b) => b.name === name);
  const handleBindingChange = (bindingName, newBinding) => {
    const pool = isGtd(bindingName)
      ? gtd.map((b) => [b.name, b.binding])
      : calculateNamedKeybindings(customKeybindings);
    const alreadyInUseBinding = pool.filter(
      ([name, binding]) => binding === newBinding && name !== bindingName
    )[0];

    if (!!alreadyInUseBinding) {
      alert(`Ese atajo ya se usa para «${keybindingLabel(alreadyInUseBinding[0])}»`);
      return;
    }

    base.setCustomKeybinding(bindingName, newBinding);
  };

  return (
    <div className="keyboard-shortcuts-editor-container">
      <h3 className="keyboard-shortcuts-editor__section">Documentos</h3>
      {calculateNamedKeybindings(customKeybindings).map(([name, binding]) => (
        <ShortcutRow
          key={name}
          name={name}
          binding={binding}
          onBindingChange={handleBindingChange}
        />
      ))}
      <h3 className="keyboard-shortcuts-editor__section" data-testid="kb-gtd-section">
        Vista GTD
      </h3>
      {gtd.map(({ name, binding }) => (
        <ShortcutRow
          key={name}
          name={name}
          binding={binding}
          onBindingChange={handleBindingChange}
        />
      ))}
    </div>
  );
};

const mapStateToProps = (state) => {
  return {
    customKeybindings: state.base.get('customKeybindings') || Map(),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    base: bindActionCreators(baseActions, dispatch),
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(KeyboardShortcutsEditor));
