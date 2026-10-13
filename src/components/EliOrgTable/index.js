// ORG Mode para Eli (3.02): tabla Org vista como tabla («como en Logseq»). Una línea del fichero
// = una fila; las líneas |---| se ven como una raya. Si es editable, tocar una celda la abre para
// escribir en su sitio: Tab / Mayús+Tab = celda siguiente / anterior (en la última, Tab añade una
// fila, como en Emacs), Intro = celda de abajo (Mayús+Intro, la de arriba), Esc = cancelar,
// tocar fuera = guardar. Al guardar se reescribe la tabla alineada (org-table-align) y se llama a
// onChange(nuevasLíneas). Mientras se edita, la barra de Documentos ofrece añadir/borrar/mover
// filas y columnas (ver setActiveTable).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseTableLines,
  formatTable,
  columnCount,
  setCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  moveRow,
  moveColumn,
  nextDataRow,
} from '../../lib/eli_org_table';
import { setActiveTable } from '../../lib/eli_table_focus';
import './stylesheet.css';

export default function EliOrgTable({
  lines,
  editable = false,
  onChange = null,
  renderCell = null,
  className = '',
  testId = 'eli-org-table',
  // (3.02) guardar ya al empezar a tocar fuera (si fuera se cierra el editor que la contiene)
  commitOnPointerDown = false,
}) {
  const table = useMemo(() => parseTableLines(lines || []), [lines]);
  const ncols = columnCount(table);
  const [editing, setEditing] = useState(null); // { r, c }
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const selectAll = useRef(false);
  // estado actual para los manejadores (se llaman fuera del ciclo de React)
  const cur = useRef({});
  // la última tabla enviada (hasta que llegue por props): así dos cambios seguidos no se pisan
  const local = useRef(null);
  const lastLines = useRef(lines);
  if (lastLines.current !== lines) {
    lastLines.current = lines;
    local.current = null;
  }
  cur.current = { table: local.current || table, editing, draft, onChange };

  // La primera línea |---| separa la cabecera (se ve en negrita)
  const firstSep = table.rows.findIndex((r) => r.sep);
  const headerRows =
    firstSep > 0 && table.rows.slice(0, firstSep).every((r) => !r.sep) ? firstSep : 0;

  const valueAt = (t, r, c) => (t.rows[r] && !t.rows[r].sep ? t.rows[r].cells[c] || '' : '');

  // Guarda lo escrito (si cambió) y devuelve la tabla resultante
  const commitDraft = () => {
    const { table: t, editing: e, draft: d, onChange: ch } = cur.current;
    if (!e) return t;
    if (d.trim() === valueAt(t, e.r, e.c)) return t;
    const n = setCell(t, e.r, e.c, d);
    local.current = n;
    cur.current.table = n;
    if (ch) ch(formatTable(n));
    return n;
  };
  const apply = (n) => {
    local.current = n;
    cur.current.table = n;
    if (cur.current.onChange) cur.current.onChange(formatTable(n));
  };
  const start = (r, c, all = false) => {
    selectAll.current = all;
    setEditing({ r, c });
    setDraft(valueAt(cur.current.table, r, c));
  };
  // la tabla nueva aún no ha llegado por props: se lee el valor de `t`
  const startIn = (t, r, c, all = true) => {
    selectAll.current = all;
    setEditing({ r, c });
    setDraft(valueAt(t, r, c));
  };
  const stop = () => {
    setEditing(null);
    setDraft('');
  };

  const move = (dir) => {
    const e = cur.current.editing;
    let t = commitDraft();
    const cols = columnCount(t);
    if (dir === 'next' || dir === 'prev') {
      let { r, c } = e;
      c += dir === 'next' ? 1 : -1;
      if (c >= cols) {
        const nr = nextDataRow(t, r, 1);
        if (nr === null) {
          t = insertRow(t, r);
          apply(t);
          r = r + 1;
        } else r = nr;
        c = 0;
      } else if (c < 0) {
        const pr = nextDataRow(t, r, -1);
        if (pr === null) return startIn(t, r, 0);
        r = pr;
        c = cols - 1;
      }
      return startIn(t, r, c);
    }
    const nr = nextDataRow(t, e.r, dir === 'down' ? 1 : -1);
    if (nr === null) {
      if (dir === 'up') return startIn(t, e.r, e.c);
      t = insertRow(t, e.r);
      apply(t);
      return startIn(t, e.r + 1, e.c);
    }
    return startIn(t, nr, e.c);
  };

  // Acciones de la barra (añadir / borrar / mover filas y columnas)
  const api = useRef(null);
  api.current = {
    addRow: () => {
      const e = cur.current.editing;
      const t = insertRow(commitDraft(), e.r);
      apply(t);
      startIn(t, e.r + 1, e.c);
    },
    delRow: () => {
      const e = cur.current.editing;
      const t0 = commitDraft();
      const t = deleteRow(t0, e.r);
      if (t.rows.length === t0.rows.length) return;
      apply(t);
      const r = Math.min(e.r, t.rows.length - 1);
      const rr = t.rows[r] && t.rows[r].sep ? nextDataRow(t, r, -1) : r;
      if (rr === null) stop();
      else startIn(t, rr, e.c);
    },
    addCol: () => {
      const e = cur.current.editing;
      const t = insertColumn(commitDraft(), e.c);
      apply(t);
      startIn(t, e.r, e.c + 1);
    },
    delCol: () => {
      const e = cur.current.editing;
      const t0 = commitDraft();
      if (columnCount(t0) <= 1) return;
      const t = deleteColumn(t0, e.c);
      apply(t);
      startIn(t, e.r, Math.min(e.c, columnCount(t) - 1));
    },
    moveRow: (dir) => {
      const e = cur.current.editing;
      const m = moveRow(commitDraft(), e.r, dir);
      if (m.row === e.r) return;
      apply(m.table);
      startIn(m.table, m.row, e.c, false);
    },
    moveCol: (dir) => {
      const e = cur.current.editing;
      const m = moveColumn(commitDraft(), e.c, dir);
      if (m.col === e.c) return;
      apply(m.table);
      startIn(m.table, e.r, m.col, false);
    },
    done: () => {
      commitDraft();
      stop();
    },
  };

  useEffect(() => {
    if (!editing) return undefined;
    const proxy = {
      addRow: () => api.current.addRow(),
      delRow: () => api.current.delRow(),
      addCol: () => api.current.addCol(),
      delCol: () => api.current.delCol(),
      moveRow: (d) => api.current.moveRow(d),
      moveCol: (d) => api.current.moveCol(d),
      done: () => api.current.done(),
    };
    setActiveTable(proxy);
    return () => setActiveTable(null, proxy);
  }, [!!editing]); // eslint-disable-line

  // Foco y selección al cambiar de celda
  // (la fila nueva puede llegar un momento después, con la tabla nueva: por eso también `table`)
  const focusedAt = useRef(null);
  useEffect(() => {
    if (!editing || !inputRef.current) return;
    const el = inputRef.current;
    const at = `${editing.r}:${editing.c}`;
    if (focusedAt.current === at && document.activeElement === el) return;
    focusedAt.current = at;
    el.focus();
    try {
      if (selectAll.current) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    } catch (e) {}
    selectAll.current = false;
  }, [editing && editing.r, editing && editing.c, table]); // eslint-disable-line

  // Tocar fuera de la tabla (y de la barra) guarda y cierra
  useEffect(() => {
    if (!editing) return undefined;
    let touch = null;
    const outside = (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      if (wrapRef.current && wrapRef.current.contains(t)) return;
      if (t.closest('.eli-docbar, .eli-table-keep')) return;
      api.current.done();
    };
    const ts = (ev) => {
      const p = ev.touches && ev.touches[0];
      touch = p ? { x: p.clientX, y: p.clientY } : null;
    };
    const te = (ev) => {
      const p = ev.changedTouches && ev.changedTouches[0];
      if (!touch || !p) return;
      if (Math.hypot(p.clientX - touch.x, p.clientY - touch.y) > 10) return;
      outside(ev);
    };
    const pd = (ev) => {
      if (commitOnPointerDown) outside(ev);
    };
    document.addEventListener('pointerdown', pd, true);
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('touchstart', ts, true);
    document.addEventListener('touchend', te, true);
    return () => {
      document.removeEventListener('pointerdown', pd, true);
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('touchstart', ts, true);
      document.removeEventListener('touchend', te, true);
    };
  }, [!!editing]); // eslint-disable-line

  // Si se deja de poder editar (candado) mientras se escribe: se guarda
  useEffect(() => {
    if (!editable && cur.current.editing) api.current.done();
  }, [editable]);
  useEffect(
    () => () => {
      if (cur.current.editing) commitDraft();
    },
    [] // eslint-disable-line
  );

  const onKeyDown = (e) => {
    if (e.nativeEvent && e.nativeEvent.isComposing) return;
    const k = e.key;
    if (k === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      move(e.shiftKey ? 'prev' : 'next');
    } else if (k === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      move(e.shiftKey ? 'up' : 'down');
    } else if (k === 'Escape' || k === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      stop();
    } else if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
      // Alt+↑/↓ mueve la fila; Alt+←/→ la columna (como M-flechas en Emacs)
      e.preventDefault();
      e.stopPropagation();
      api.current.moveRow(k === 'ArrowUp' ? -1 : 1);
    } else if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      e.preventDefault();
      e.stopPropagation();
      api.current.moveCol(k === 'ArrowLeft' ? -1 : 1);
    } else {
      e.stopPropagation();
    }
  };

  const onCellClick = (e, r, c) => {
    if (!editable) return;
    const t = e.target;
    if (t && t.closest && t.closest('a, button, input[type="checkbox"], .eli-org-link')) return;
    e.stopPropagation();
    const ed = cur.current.editing;
    if (ed && ed.r === r && ed.c === c) return;
    if (ed) {
      const n = commitDraft();
      return startIn(n, r, c, false);
    }
    start(r, c);
  };

  const show = (text) => (renderCell ? renderCell(text) : text);

  return (
    <div
      className={'eli-table-wrap ' + className}
      ref={wrapRef}
      onClick={(e) => editable && e.stopPropagation()}
      onDoubleClick={(e) => editable && e.stopPropagation()}
    >
      <table className={'eli-table' + (editable ? ' is-editable' : '')} data-testid={testId}>
        <tbody>
          {table.rows.map((row, r) =>
            row.sep ? (
              <tr key={r} className="eli-table__sep" aria-hidden="true">
                <td colSpan={ncols} />
              </tr>
            ) : (
              <tr key={r} className={r < headerRows ? 'is-head' : ''}>
                {Array.from({ length: ncols }).map((_, c) => {
                  const v = row.cells[c] || '';
                  const here = editing && editing.r === r && editing.c === c;
                  return (
                    <td
                      key={c}
                      className={'eli-table__cell' + (here ? ' is-editing' : '')}
                      onClick={(e) => onCellClick(e, r, c)}
                      data-testid="eli-table-cell"
                    >
                      {here ? (
                        <input
                          ref={inputRef}
                          className="eli-table__input"
                          type="text"
                          value={draft}
                          size={Math.max(4, Math.min(40, draft.length + 1))}
                          enterKeyHint="next"
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={onKeyDown}
                          onClick={(e) => e.stopPropagation()}
                          data-testid="eli-table-cell-input"
                        />
                      ) : v ? (
                        show(v)
                      ) : (
                        ' '
                      )}
                    </td>
                  );
                })}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
