import React, { PureComponent } from 'react';

import './stylesheet.css';

import _ from 'lodash';
import classNames from 'classnames';

import { keybindingLabel } from '../../../../lib/keybindings';

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

    let key = null;
    if (event.code.startsWith('Key')) {
      key = event.code.substr(3).toLowerCase();
    } else if (event.code.startsWith('Digit')) {
      key = event.code.substr(5);
    } else {
      key = {
        Minus: '-',
        Equal: '=',
        Backspace: 'backspace',
        Enter: 'enter',
        Return: 'return',
        Tab: 'tab',
        BracketLeft: '[',
        BracketRight: ']',
        Semicolon: ';',
        Quote: '"',
        Backslash: '\\',
        Comma: ',',
        Period: '.',
        Slash: '/',
        Escape: 'escape',
        Space: 'space',
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }[event.code];
    }

    if (!key) {
      return;
    }

    const modifiers = [
      ['ctrlKey', 'ctrl'],
      ['altKey', 'alt'],
      ['metaKey', 'meta'],
      ['shiftKey', 'shift'],
    ];

    const newModifiers = modifiers
      .filter(([modifier, _]) => event[modifier])
      .map(([_, symbol]) => symbol)
      .join('+');
    const newBinding = `${newModifiers}${!!newModifiers ? '+' : ''}${key}`;

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
    const { name, binding } = this.props;
    const { isEditMode } = this.state;

    const rebindAreaClassName = classNames('keyboard-shortcut-container__shortcut-key', {
      'keyboard-shortcut-container__shortcut-key--edit-mode': isEditMode,
    });

    return (
      <div className="keyboard-shortcut-container">
        <div className="keyboard-shortcut-container__shortcut-name">{keybindingLabel(name)}</div>
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
