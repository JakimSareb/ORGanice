import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { withRouter } from 'react-router-dom';

import { Map } from 'immutable';

import ShortcutRow from './components/ShortcutRow';

import * as baseActions from '../../actions/base';

import { calculateNamedKeybindings, keybindingLabel } from '../../lib/keybindings';

import './stylesheet.css';

const KeyboardShortcutsEditor = ({ customKeybindings, base }) => {
  const handleBindingChange = (bindingName, newBinding) => {
    const alreadyInUseBinding = calculateNamedKeybindings(customKeybindings).filter(
      ([_, binding]) => binding === newBinding
    )[0];

    if (!!alreadyInUseBinding) {
      alert(`Ese atajo ya se usa para «${keybindingLabel(alreadyInUseBinding[0])}»`);
      return;
    }

    base.setCustomKeybinding(bindingName, newBinding);
  };

  return (
    <div className="keyboard-shortcuts-editor-container">
      {calculateNamedKeybindings(customKeybindings).map(([name, binding]) => (
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
