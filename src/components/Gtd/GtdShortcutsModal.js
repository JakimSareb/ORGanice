// ORG Mode para Eli (2.15): ventana con los atajos de teclado (como la de Nirvana): los de la
// vista GTD por grupos y, debajo, los de Documentos. «Configurar» lleva a Ajustes.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Map as IMap } from 'immutable';

import {
  calculateDocKeybindings,
  DOC_GROUPS,
  keybindingLabel,
  defaultBindingOf,
} from '../../lib/keybindings';
import { bindingFromEvent } from '../../lib/eli_binding_capture';
import { setCustomKeybinding } from '../../actions/base';
import { isNotesMode } from '../../lib/eli_notes_mode';

const GROUPS = ['Crear', 'Tareas', 'Navegación', 'Áreas', 'Más', 'Editor'];
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

// Filas informativas (no configurables) de cada grupo de la vista GTD
const INFO_ROWS = {
  Áreas: [['Mayús 1…9', 'ir al área 1…9 (el número sale en el selector de áreas)']],
  Más: [
    ['Tab', 'al buscador (con una tarea seleccionada: plegar/desplegar sus notas)'],
    ['Ctrl Espacio', 'paleta de comandos'],
  ],
  Tareas: [
    ['Clic', 'seleccionar (Ctrl/⌘ clic: añadir a la selección)'],
    ['Doble clic', 'editar (también Intro)'],
    ['Mayús Clic', 'seleccionar desde la última elegida hasta esa'],
    ['⋮⋮ y arrastrar', 'seleccionar varias (lazo)'],
    ['Arrastrar', 'mover a una lista o proyecto del menú, o cambiar el orden'],
    ['Clic derecho', 'menú (también el ▾ del final de la fila)'],
    ['↑ ↓', 'recorrer la lista (Mayús: ampliar la selección)'],
    ['Supr ⌫', 'a la Papelera'],
    ['Intro', 'guardar (en el título)'],
    ['Ctrl Intro', 'guardar desde cualquier campo (configurable aquí, en «Editor»)'],
    ['Esc', 'guardar y salir (Cancelar descarta)'],
    ['⌘C Ctrl C', 'copiar la lista (o la selección) como ORG Mode'],
    ['⌘A Ctrl A', 'seleccionar todas'],
    ['Tab', 'plegar/desplegar las notas de la tarea seleccionada'],
    ['Alt ↑ / Alt ↓', 'mover la tarea seleccionada (donde la lista se puede ordenar)'],
    ['Alt → / Alt ←', 'hacer subtarea de la de encima / sacarla (con «Subtareas» encendido)'],
    ['Alt ←', 'volver de la tarea madre'],
  ],
};

// Un grupo plegable (mismo estilo que los de Ajustes). Con búsqueda activa se abre solo.
const KeyGroup = ({ title, count, forceOpen, testId, children }) => (
  <details className="gtd-keys__details" open={forceOpen ? true : undefined} data-testid={testId}>
    <summary>
      <span className="gtd-keys__details-title">{title}</span>
      <span className="gtd-keys__details-count">{count}</span>
    </summary>
    <div className="gtd-keys__details-body">{children}</div>
  </details>
);

export default function GtdShortcutsModal({ bindings, onClose, onConfigure }) {
  const custom = useSelector(selectCustomKeybindings) || IMap();
  const dispatch = useDispatch();
  const docs = useMemo(() => calculateDocKeybindings(custom), [custom]);
  // (4.04) en el Modo Notas, solo los de Documentos
  const notes = isNotesMode();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // nombre del atajo que se está grabando
  const [msg, setMsg] = useState('');

  const gtdList = notes ? [] : bindings;
  // teclas repetidas dentro de cada vista (Documentos y GTD se comprueban por separado)
  const dupOf = (list) => {
    const seen = {};
    list.forEach((b) => b.binding && (seen[b.binding] = (seen[b.binding] || 0) + 1));
    return (b) => !!b.binding && seen[b.binding] > 1;
  };
  const isDocDup = useMemo(() => dupOf(docs), [docs]);
  const isGtdDup = useMemo(() => dupOf(gtdList), [gtdList]);
  const anyDup = docs.some(isDocDup) || gtdList.some(isGtdDup);

  const change = (name, newBinding, pool) => {
    const clash = pool.find((b) => b.binding === newBinding && b.name !== name);
    if (clash) {
      setMsg(`Ese atajo ya se usa para «${keybindingLabel(clash.name)}»`);
      return;
    }
    setMsg('');
    dispatch(setCustomKeybinding(name, newBinding));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (editing) {
        // grabando un atajo: la tecla es para él (Esc incluida)
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const nb = bindingFromEvent(e);
        const pool = editing.pool;
        const name = editing.name;
        setEditing(null);
        if (nb) change(name, nb, pool);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line
  }, [onClose, editing, docs, bindings]);

  const q = query.trim().toLowerCase();
  const matches = (b) =>
    !q ||
    keybindingLabel(b.name).toLowerCase().includes(q) ||
    String(b.binding || '')
      .toLowerCase()
      .includes(q) ||
    prettyBinding(b.binding).toLowerCase().includes(q);

  const renderRow = (b, pool, dup) => {
    const def = defaultBindingOf(b.name);
    const changed = (b.binding || '') !== (def || '');
    const isEd = editing && editing.name === b.name;
    return (
      <div
        key={b.name}
        className={'gtd-keys__row' + (dup(b) ? ' is-dup' : '')}
        data-testid={`gtd-keys-row`}
      >
        <span className="gtd-keys__name">{keybindingLabel(b.name)}</span>
        {dup(b) && (
          <span className="gtd-keys__dup" title="Otra acción usa la misma tecla">
            ⚠
          </span>
        )}
        {changed && (
          <button
            type="button"
            className="gtd-keys__reset"
            title={`Volver a ${prettyBinding(def)}`}
            aria-label="Volver al atajo por defecto"
            onClick={() => change(b.name, def, [])}
            data-testid="gtd-keys-reset"
          >
            <i className="fas fa-undo" />
          </button>
        )}
        <kbd
          role="button"
          tabIndex={0}
          className={'gtd-keys__chip' + (isEd ? ' is-editing' : '')}
          title="Cambiar el atajo"
          onClick={() => setEditing(isEd ? null : { name: b.name, pool })}
          onKeyDown={(e) => {
            if (!editing && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              e.stopPropagation();
              setEditing({ name: b.name, pool });
            }
          }}
          data-testid="gtd-keys-chip"
        >
          {isEd ? '…' : prettyBinding(b.binding)}
        </kbd>
      </div>
    );
  };

  const gtdGroups = ['Crear', 'Tareas', 'Navegación', 'Áreas', 'Más', 'Editor'].map((g) => {
    const rows = gtdList.filter((b) => b.group === g && matches(b));
    const info = (INFO_ROWS[g] || []).filter(
      ([k, t]) => !q || k.toLowerCase().includes(q) || t.toLowerCase().includes(q)
    );
    return { g, rows, info };
  });
  const docGroups = DOC_GROUPS.map((g) => ({
    g,
    rows: docs.filter((b) => b.group === g && matches(b)),
  }));

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
        <input
          type="search"
          className="gtd-keys__search"
          placeholder="Buscar por nombre o tecla…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          data-testid="gtd-keys-search"
        />
        <div className="gtd-keys__hint">
          Toca una tecla para cambiarla (después, pulsa la nueva).
        </div>
        {msg && (
          <div className="gtd-keys__msg" role="alert" data-testid="gtd-keys-msg">
            {msg}
          </div>
        )}
        {anyDup && (
          <div className="gtd-keys__msg" data-testid="gtd-keys-dup-warning">
            ⚠ Hay acciones con la misma tecla (marcadas con ⚠).
          </div>
        )}
        {!notes && <div className="gtd-keys__title">Vista GTD</div>}
        {!notes &&
          gtdGroups
            .filter(({ rows, info }) => rows.length || info.length)
            .map(({ g, rows, info }) => (
              <KeyGroup
                key={g}
                title={g}
                count={rows.length + info.length}
                forceOpen={!!q}
                testId={`gtd-keys-group-${g}`}
              >
                {rows.map((b) => renderRow(b, gtdList, isGtdDup))}
                {info.map(([k, t]) => (
                  <div key={k + t} className="gtd-keys__row">
                    <span className="gtd-keys__name">{t}</span>
                    <kbd className="gtd-keys__chip is-static">{k}</kbd>
                  </div>
                ))}
              </KeyGroup>
            ))}
        <div className="gtd-keys__title">Documentos</div>
        {docGroups
          .filter(({ rows }) => rows.length)
          .map(({ g, rows }) => (
            <KeyGroup
              key={g}
              title={g}
              count={rows.length}
              forceOpen={!!q}
              testId={`gtd-keys-group-doc-${g}`}
            >
              {rows.map((b) => renderRow(b, docs, isDocDup))}
            </KeyGroup>
          ))}
      </div>
    </div>
  );
}
