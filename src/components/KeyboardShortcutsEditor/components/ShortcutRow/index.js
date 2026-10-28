import React, { PureComponent } from 'react';

import './stylesheet.css';

import _ from 'lodash';
import classNames from 'classnames';

import { keybindingLabel } from '../../../../lib/keybindings';
import { bindingFromEvent } from '../../../../lib/eli_binding_capture';

export default class ShortcutRow extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, ['handleRebindClick', 'handleKeyPress']);

    this.state = {
      isEditMode: false,
    };
  }

  componentDidMount() {
    this.rebindArea.addEventListener('blur', () => this.setState({ isEditMode: false }));
  }

  handleRebindClick() {
    this.setState({ isEditMode: true });
    document.addEventListener('keydown', this.handleKeyPress);
  }

  handleKeyPress(event) {
    // ORG Mode para Eli: keydown (keypress no llega para Escape ni las flechas); las teclas
    // modificadoras solas no terminan la grabación
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    event.preventDefault();
    this.setState({ isEditMode: false });
    document.removeEventListener('keydown', this.handleKeyPress);

    const newBinding = bindingFromEvent(event);
    if (!newBinding) return;

    this.props.onBindingChange(this.props.name, newBinding);
  }

  symbolizeKeybinding(binding) {
    if (!binding) {
      return '';
    }

    const replacements = [
      ['ctrl', '^'],
      ['alt', '⌥'],
      ['option', '⌥'],
      ['command', '⌘'],
      ['meta', '⌘'],
      ['shift', '⇧'],
      ['backspace', '⌫'],
      ['escape', 'Esc'],
      ['return', '⏎'],
      ['enter', '⏎'],
      ['left', '←'],
      ['right', '→'],
      ['up', '↑'],
      ['down', '↓'],
    ];

    return replacements.reduce(
      (currentBinding, [name, symbol]) => currentBinding.replace(RegExp(`${name}\\+?`), symbol),
      binding
    );
  }

  render() {
    const { name, binding, off, onToggleOff } = this.props;
    const { isEditMode } = this.state;

    const rebindAreaClassName = classNames('keyboard-shortcut-container__shortcut-key', {
      'keyboard-shortcut-container__shortcut-key--edit-mode': isEditMode,
    });

    return (
      <div className="keyboard-shortcut-container" style={off ? { opacity: 0.55 } : undefined}>
        <div className="keyboard-shortcut-container__shortcut-name">{keybindingLabel(name)}</div>
        {/* (4.49) «Desactivar» este atajo */}
        {onToggleOff && (
          <button
            type="button"
            className="btn"
            role="switch"
            aria-checked={!off}
            title={off ? 'Activar este atajo' : 'Desactivar este atajo'}
            onClick={() => onToggleOff(name, off)}
            data-testid="kb-off"
          >
            <i className={off ? 'fas fa-ban' : 'fas fa-power-off'} />
          </button>
        )}
        <div
          className={rebindAreaClassName}
          onClick={this.handleRebindClick}
          tabIndex="-1"
          ref={(div) => (this.rebindArea = div)}
        >
          {isEditMode ? '...' : this.symbolizeKeybinding(binding)}
        </div>
      </div>
    );
  }
}
