import React, { PureComponent, Fragment } from 'react';

import './stylesheet.css';

import AttributedString from '../../../AttributedString';

import _ from 'lodash';
import classNames from 'classnames';
import { fromJS } from 'immutable';

import { parseMarkupAndCookies } from '../../../../../../lib/parse_org';

// ORG Mode para Eli (2.15): las celdas se editan en su sitio. Tocar una celda la abre para
// escribir; Intro guarda y baja a la celda de abajo, Tab / Mayús+Tab pasan a la siguiente /
// anterior (como org-table en Emacs), Esc cancela y tocar fuera guarda. Para añadir, borrar o
// mover filas y columnas sigue la ventana del editor de tablas (botón junto a la tabla).

// «|» separa columnas en Org: dentro de una celda rompería la tabla
export const sanitizeCellValue = (value) => String(value || '').replace(/[|\r\n]/g, '¦');

// En organice, una «fila» puede ocupar varias líneas (las que hay entre dos líneas |---|): cada
// celda guarda todas sus líneas en rawContents. Para el usuario (y en Org) cada línea es una fila,
// así que aquí se edita LÍNEA A LÍNEA: una posición es { cellId, line }.
const linesOf = (raw) => String(raw || '').split('\n');

// Rejilla visual: filas de pantalla (fila de organice × línea), cada una con sus posiciones
export const visualGrid = (table) => {
  const grid = [];
  table.get('contents').forEach((row) => {
    const cells = row.get('contents');
    const height = Math.max(1, ...cells.map((c) => linesOf(c.get('rawContents')).length).toArray());
    for (let line = 0; line < height; line++) {
      grid.push(cells.map((c) => ({ cellId: c.get('id'), line })).toArray());
    }
  });
  return grid;
};

// Posición vecina: dir = 'next' | 'prev' | 'down' | 'up'. Devuelve { cellId, line } o null.
export const neighborPosition = (table, pos, dir) => {
  const grid = visualGrid(table);
  let r = -1;
  let c = -1;
  grid.forEach((row, ri) =>
    row.forEach((x, ci) => {
      if (x.cellId === pos.cellId && x.line === pos.line) {
        r = ri;
        c = ci;
      }
    })
  );
  if (r < 0) return null;
  if (dir === 'next') {
    if (c + 1 < grid[r].length) return grid[r][c + 1];
    return grid[r + 1] && grid[r + 1][0] ? grid[r + 1][0] : null;
  }
  if (dir === 'prev') {
    if (c > 0) return grid[r][c - 1];
    return grid[r - 1] && grid[r - 1].length ? grid[r - 1][grid[r - 1].length - 1] : null;
  }
  const target = grid[dir === 'down' ? r + 1 : r - 1];
  if (!target || !target.length) return null;
  return target[Math.min(c, target.length - 1)];
};

const rawValueOf = (table, cellId) => {
  let value = null;
  table.get('contents').forEach((row) =>
    row.get('contents').forEach((cell) => {
      if (cell.get('id') === cellId) value = cell.get('rawContents');
    })
  );
  return value;
};

// Texto de una línea de una celda (sin los espacios de relleno)
export const cellLineValue = (raw, line) => (linesOf(raw)[line] || '').trim();

// rawContents con la línea `line` cambiada (se añaden líneas vacías si hace falta)
export const replaceCellLine = (raw, line, value) => {
  const lines = raw ? linesOf(raw) : [''];
  while (lines.length <= line) lines.push('');
  lines[line] = value;
  return lines.join('\n');
};

export default class TablePart extends PureComponent {
  constructor(props) {
    super(props);

    _.bindAll(this, [
      'handleTableSelect',
      'handleOpenTableEditor',
      'handleInputChange',
      'handleInputKeyDown',
      'handleInputBlur',
      'handleOutsidePointer',
      'handleOutsideTouchStart',
      'handleOutsideTouchEnd',
    ]);

    // editing: { cellId, line } de la línea que se está escribiendo
    this.state = { editing: null, draft: '' };
    this.inputRef = React.createRef();
  }

  componentDidUpdate(prevProps, prevState) {
    const { editing } = this.state;
    // Si la celda que se editaba desaparece (p. ej. se borró la fila), se cierra
    if (
      editing &&
      this.props.table !== prevProps.table &&
      rawValueOf(this.props.table, editing.cellId) === null
    ) {
      this.setState({ editing: null, draft: '' });
      return;
    }
    if (editing && editing !== prevState.editing && this.inputRef.current) {
      const el = this.inputRef.current;
      el.focus();
      // Tocando una celda, el cursor va al final; con Tab / Intro se selecciona todo (como en
      // org-table: lo que se escribe sustituye el contenido)
      try {
        if (this.selectAllNext) el.select();
        else el.setSelectionRange(el.value.length, el.value.length);
      } catch (e) {}
      this.selectAllNext = false;
    }
    // Tocar fuera guarda (algunas zonas, como los títulos, no quitan el foco al campo)
    if (!!editing !== !!prevState.editing) {
      if (editing) {
        document.addEventListener('mousedown', this.handleOutsidePointer, true);
        document.addEventListener('touchstart', this.handleOutsideTouchStart, true);
        document.addEventListener('touchend', this.handleOutsideTouchEnd, true);
      } else {
        this.removeOutsideListeners();
      }
    }
  }

  componentWillUnmount() {
    this.removeOutsideListeners();
    // Si el encabezado se cierra mientras se escribe, no se pierde lo escrito
    const { editing, draft } = this.state;
    if (editing) this.commit(editing, draft);
  }

  removeOutsideListeners() {
    document.removeEventListener('mousedown', this.handleOutsidePointer, true);
    document.removeEventListener('touchstart', this.handleOutsideTouchStart, true);
    document.removeEventListener('touchend', this.handleOutsideTouchEnd, true);
  }

  // Con el dedo, solo un toque (sin desplazar la página) fuera de la celda la guarda y la cierra
  handleOutsideTouchStart(event) {
    const t = event.touches && event.touches[0];
    this.touchStart = t ? { x: t.clientX, y: t.clientY } : null;
  }

  handleOutsideTouchEnd(event) {
    const start = this.touchStart;
    this.touchStart = null;
    const t = event.changedTouches && event.changedTouches[0];
    if (!start || !t) return;
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) return;
    this.handleOutsidePointer(event);
  }

  handleOutsidePointer(event) {
    const { editing, draft } = this.state;
    if (!editing) return;
    const input = this.inputRef.current;
    const target = event.target;
    if (input && target && (target === input || input.contains(target))) return;
    // Otra línea de esta misma tabla o el botón del editor: lo gestiona su propio clic
    if (
      target &&
      target.closest &&
      this.wrapRef &&
      this.wrapRef.contains(target) &&
      target.closest('.table-part__line, .table-part__cell, .table-part__editor-btn')
    ) {
      return;
    }
    this.commit(editing, draft);
    this.setState({ editing: null, draft: '' });
  }

  canEdit() {
    const handlers = this.props.subPartDataAndHandlers || {};
    return !!handlers.onTableSelect && !!handlers.onTableCellEdit && !handlers.shouldDisableActions;
  }

  handleTableSelect(tableId) {
    this.props.subPartDataAndHandlers.onTableSelect(tableId, this.props.descriptionItemIndex);
  }

  handleOpenTableEditor(event) {
    event.stopPropagation();
    const { editing, draft } = this.state;
    if (editing) this.commit(editing, draft);
    this.setState({ editing: null, draft: '' });
    const handlers = this.props.subPartDataAndHandlers;
    if (handlers.onTableSelect) {
      handlers.onTableSelect(
        this.props.table.get('id'),
        this.props.descriptionItemIndex,
        editing ? editing.cellId : null
      );
    }
  }

  startEditing(pos) {
    const raw = rawValueOf(this.props.table, pos.cellId);
    this.setState({ editing: pos, draft: raw === null ? '' : cellLineValue(raw, pos.line) });
  }

  commit(pos, value) {
    if (!pos) return;
    const original = rawValueOf(this.props.table, pos.cellId);
    if (original === null) return;
    const clean = sanitizeCellValue(value).trim();
    if (clean === cellLineValue(original, pos.line)) return;
    const updated = replaceCellLine(original, pos.line, clean);
    // Una celda de una sola línea se guarda sin espacios de relleno
    this.props.subPartDataAndHandlers.onTableCellEdit(
      pos.cellId,
      updated.includes('\n') ? updated : updated.trim()
    );
  }

  handleLineClick(event, pos) {
    if (!this.canEdit()) return;
    // Los enlaces y las fechas de dentro de la celda siguen funcionando
    const target = event.target;
    if (
      target &&
      target.closest &&
      target.closest('a, button, input, .attributed-string__timestamp-part')
    ) {
      return;
    }
    event.stopPropagation();
    const { editing, draft } = this.state;
    if (editing && editing.cellId === pos.cellId && editing.line === pos.line) return;
    if (editing) this.commit(editing, draft);
    this.startEditing(pos);
  }

  handleInputChange(event) {
    this.setState({ draft: event.target.value });
  }

  moveTo(dir) {
    const { editing, draft } = this.state;
    this.commit(editing, draft);
    const next = dir ? neighborPosition(this.props.table, editing, dir) : null;
    this.selectAllNext = true;
    if (next) this.startEditing(next);
    else this.setState({ editing: null, draft: '' });
  }

  handleInputKeyDown(event) {
    const key = event.key;
    if (event.nativeEvent && event.nativeEvent.isComposing) return;
    // preventDefault: así los atajos del documento (listener propio) no actúan
    if (key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.moveTo(event.shiftKey ? 'up' : 'down');
    } else if (key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.moveTo(event.shiftKey ? 'prev' : 'next');
    } else if (key === 'Escape' || key === 'Esc') {
      event.preventDefault();
      event.stopPropagation();
      this.setState({ editing: null, draft: '' });
    } else {
      event.stopPropagation();
    }
  }

  handleInputBlur(event) {
    const { editing } = this.state;
    const cellId = event.target.getAttribute('data-cell-id');
    const line = +event.target.getAttribute('data-line');
    if (!editing || editing.cellId !== cellId || editing.line !== line) return;
    // Al pulsar el botón del editor de tablas, él se encarga
    const next = event.relatedTarget;
    if (next && next.getAttribute && next.getAttribute('data-eli-table-editor') === 'true') return;
    this.commit(editing, event.target.value);
    this.setState({ editing: null, draft: '' });
  }

  renderInput(cellId, line) {
    const { draft } = this.state;
    return (
      <input
        ref={this.inputRef}
        className="table-part__cell-input"
        type="text"
        value={draft}
        size={Math.max(4, Math.min(40, (draft || '').length + 1))}
        enterKeyHint="next"
        data-cell-id={cellId}
        data-line={line}
        data-testid="eli-table-cell-input"
        onChange={this.handleInputChange}
        onKeyDown={this.handleInputKeyDown}
        onBlur={this.handleInputBlur}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  renderCell(cell, height) {
    const { editing } = this.state;
    const cellId = cell.get('id');
    const editable = this.canEdit();
    const raw = cell.get('rawContents') || '';
    const isEditingHere = !!editing && editing.cellId === cellId;
    const className = classNames('table-part__cell', {
      'table-part__cell--editable': editable,
      'table-part__cell--editing': isEditingHere,
    });
    // Celda de una línea (lo normal): como siempre
    if (height === 1) {
      return (
        <td
          className={className}
          key={cellId}
          onClick={(e) => this.handleLineClick(e, { cellId, line: 0 })}
          data-testid="eli-table-cell"
        >
          {isEditingHere ? (
            this.renderInput(cellId, 0)
          ) : cell.get('contents').size > 0 ? (
            <AttributedString
              parts={cell.get('contents')}
              subPartDataAndHandlers={this.props.subPartDataAndHandlers}
            />
          ) : (
            '   '
          )}
        </td>
      );
    }
    // Fila de varias líneas: cada línea se muestra y se edita por separado
    const lines = linesOf(raw);
    return (
      <td className={className} key={cellId} data-testid="eli-table-cell">
        {_.times(height).map((line) => {
          const value = (lines[line] || '').trim();
          const editingLine = isEditingHere && editing.line === line;
          return (
            <div
              key={line}
              className="table-part__line"
              onClick={(e) => this.handleLineClick(e, { cellId, line })}
            >
              {editingLine ? (
                this.renderInput(cellId, line)
              ) : value ? (
                <AttributedString
                  parts={fromJS(parseMarkupAndCookies(value, { excludeCookies: true }))}
                  subPartDataAndHandlers={this.props.subPartDataAndHandlers}
                />
              ) : (
                ' '
              )}
            </div>
          );
        })}
      </td>
    );
  }

  render() {
    const { table } = this.props;
    const editable = this.canEdit();
    const handlers = this.props.subPartDataAndHandlers || {};
    // Sin edición en la celda (p. ej. vistas de solo lectura), tocar la tabla hace lo de siempre
    const legacyClick =
      !editable && handlers.onTableSelect
        ? () => this.handleTableSelect(table.get('id'))
        : undefined;
    return (
      <Fragment>
        <div className="table-part__wrap" ref={(el) => (this.wrapRef = el)}>
          <table className="table-part" onClick={legacyClick}>
            <tbody>
              {table.get('contents').map((row) => {
                const cells = row.get('contents');
                const height = Math.max(
                  1,
                  ...cells.map((c) => linesOf(c.get('rawContents')).length).toArray()
                );
                return (
                  <tr key={row.get('id')}>{cells.map((cell) => this.renderCell(cell, height))}</tr>
                );
              })}
            </tbody>
          </table>
          {editable && (
            <button
              type="button"
              className="table-part__editor-btn"
              title="Editor de la tabla: añadir, borrar o mover filas y columnas"
              aria-label="Editor de la tabla"
              data-eli-table-editor="true"
              data-testid="eli-table-editor-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={this.handleOpenTableEditor}
            >
              <i className="fas fa-table" />
            </button>
          )}
        </div>
      </Fragment>
    );
  }
}
