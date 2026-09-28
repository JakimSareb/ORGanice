// ORG Mode para Eli (2.15): ventana con los atajos de teclado (como la de Nirvana): los de la
// vista GTD por grupos y, debajo, los de Documentos. «Configurar» lleva a Ajustes.
import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Map as IMap } from 'immutable';

import { calculateNamedKeybindings, keybindingLabel } from '../../lib/keybindings';

const GROUPS = ['Crear', 'Navegación', 'Áreas', 'Más'];
const selectCustomKeybindings = (s) => s.base.get('customKeybindings');

// «shift+n» → «Mayús N», «ctrl+k» → «Ctrl K»
export const prettyBinding = (binding) =>
  String(binding || '—')
    .split('+')
    .map(
      (p) =>
        ({
          shift: 'Mayús',
          ctrl: 'Ctrl',
          alt: 'Alt',
          meta: '⌘',
          escape: 'Esc',
          enter: 'Intro',
          space: 'Espacio',
          backspace: '⌫',
          up: '↑',
          down: '↓',
          left: '←',
          right: '→',
          tab: 'Tab',
        }[p] || (p.length === 1 ? p.toUpperCase() : p))
    )
    .join(' ');

export default function GtdShortcutsModal({ bindings, onClose, onConfigure }) {
  const custom = useSelector(selectCustomKeybindings) || IMap();
  const docs = calculateNamedKeybindings(custom);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="eli-prompt__overlay gtd-keys__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="eli-prompt__box gtd-keys"
        role="dialog"
        aria-label="Atajos de teclado"
        data-testid="gtd-shortcuts"
      >
        <div className="gtd-keys__head">
          <strong>
            <i className="far fa-keyboard" /> Atajos de teclado
          </strong>
          <span className="gtd-keys__spacer" />
          <button type="button" className="btn" onClick={onConfigure} data-testid="gtd-keys-config">
            Configurar
          </button>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Cerrar"
            data-testid="gtd-keys-close"
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="gtd-keys__title">Vista GTD</div>
        <div className="gtd-keys__grid">
          {GROUPS.map((g) => (
            <section key={g} className="gtd-keys__group">
              <h3>{g}</h3>
              {bindings
                .filter((b) => b.group === g)
                .map((b) => (
                  <div key={b.action} className="gtd-keys__row">
                    <kbd>{prettyBinding(b.binding)}</kbd>
                    <span>{keybindingLabel(b.name)}</span>
                  </div>
                ))}
              {g === 'Más' && (
                <>
                  <div className="gtd-keys__row">
                    <kbd>G</kbd>
                    <span>cambiar entre Documentos y GTD</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Ctrl Espacio</kbd>
                    <span>paleta de comandos</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Esc</kbd>
                    <span>cerrar / cancelar</span>
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
        <div className="gtd-keys__title">Documentos</div>
        <div className="gtd-keys__grid gtd-keys__grid--docs">
          {docs.map(([name, binding]) => (
            <div key={name} className="gtd-keys__row">
              <kbd>{prettyBinding(binding)}</kbd>
              <span>{keybindingLabel(name)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
