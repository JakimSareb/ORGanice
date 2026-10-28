import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { withRouter } from 'react-router-dom';

import { Map } from 'immutable';

import ShortcutRow from './components/ShortcutRow';

import * as baseActions from '../../actions/base';

import {
  calculateNamedKeybindings,
  calculateDocKeybindings,
  calculateGtdKeybindings,
  keybindingLabel,
  OFF_PREFIX,
} from '../../lib/keybindings';

import { isNotesMode } from '../../lib/eli_notes_mode';

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
    // (4.49) darle una tecla nueva a un atajo desactivado lo vuelve a activar
    if (customKeybindings.get(OFF_PREFIX + bindingName) === 'true')
      base.setCustomKeybinding(OFF_PREFIX + bindingName, '');
  };
  // (4.49) «Desactivar» cada atajo (conserva la tecla asignada)
  const handleToggleOff = (name, off) =>
    base.setCustomKeybinding(OFF_PREFIX + name, off ? '' : 'true');

  const notes = isNotesMode();
  return (
    <div className="keyboard-shortcuts-editor-container">
      <h3 className="keyboard-shortcuts-editor__section">Documentos</h3>
      {calculateDocKeybindings(customKeybindings).map(({ name, assigned, off }) => (
        <ShortcutRow
          key={name}
          name={name}
          binding={assigned}
          off={off}
          onToggleOff={handleToggleOff}
          onBindingChange={handleBindingChange}
        />
      ))}
      {/* (4.04) en el Modo Notas, solo los de Documentos */}
      {!notes && (
        <h3 className="keyboard-shortcuts-editor__section" data-testid="kb-gtd-section">
          Vista GTD
        </h3>
      )}
      {!notes &&
        gtd.map(({ name, assigned, off }) => (
          <ShortcutRow
            key={name}
            name={name}
            binding={assigned}
            off={off}
            onToggleOff={handleToggleOff}
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
