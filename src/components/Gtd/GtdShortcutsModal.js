// ORG Mode para Eli (2.15): ventana con los atajos de teclado (como la de Nirvana): los de la
// vista GTD por grupos y, debajo, los de Documentos. «Configurar» lleva a Ajustes.
import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Map as IMap } from 'immutable';

import { calculateNamedKeybindings, keybindingLabel } from '../../lib/keybindings';

const GROUPS = ['Crear', 'Tareas', 'Navegación', 'Áreas', 'Más'];
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
                .filter((b) => b.binding)
                .map((b) => (
                  <div key={b.action} className="gtd-keys__row">
                    <kbd>{prettyBinding(b.binding)}</kbd>
                    <span>{keybindingLabel(b.name)}</span>
                  </div>
                ))}
              {g === 'Áreas' && (
                <div className="gtd-keys__row">
                  <kbd>Mayús 1…9</kbd>
                  <span>ir al área 1…9 (el número sale en el selector de áreas)</span>
                </div>
              )}
              {g === 'Más' && (
                <>
                  <div className="gtd-keys__row">
                    <kbd>Tab</kbd>
                    <span>al buscador (con una tarea seleccionada: hacerla subtarea)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Ctrl Espacio</kbd>
                    <span>paleta de comandos</span>
                  </div>
                </>
              )}
              {g === 'Tareas' && (
                <>
                  <div className="gtd-keys__row">
                    <kbd>Clic</kbd>
                    <span>seleccionar (Ctrl/⌘ clic: añadir a la selección)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Doble clic</kbd>
                    <span>editar (también Intro)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Mayús Clic</kbd>
                    <span>seleccionar desde la última elegida hasta esa</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>⋮⋮ y arrastrar</kbd>
                    <span>seleccionar varias (lazo)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Arrastrar</kbd>
                    <span>mover a una lista o proyecto del menú, o cambiar el orden</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Clic derecho</kbd>
                    <span>menú (también el ▾ del final de la fila)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>↑ ↓</kbd>
                    <span>recorrer la lista (Mayús: ampliar la selección)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Supr ⌫</kbd>
                    <span>a la Papelera</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Intro</kbd>
                    <span>guardar (en el título)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Mayús Intro</kbd>
                    <span>guardar desde cualquier campo</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Esc</kbd>
                    <span>guardar y salir (Cancelar descarta)</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>⌘C Ctrl C</kbd>
                    <span>copiar la lista (o la selección) como ORG Mode</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>⌘A Ctrl A</kbd>
                    <span>seleccionar todas</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Tab / Mayús Tab</kbd>
                    <span>hacer subtarea de la de encima / sacarla</span>
                  </div>
                  <div className="gtd-keys__row">
                    <kbd>Alt ←</kbd>
                    <span>volver de la tarea madre</span>
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
