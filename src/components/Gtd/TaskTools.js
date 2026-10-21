// ORG Mode para Eli (4.11): herramientas de la tarea en su editor: reloj (iniciar/parar, lista de
// registros CLOCK con sus tiempos y el total), enlace propio y exportar (PDF y Org).
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setDisappearingLoadingMessage } from '../../actions/base';
import { gtdClockSetTime, gtdClockDelete } from '../../lib/gtd/gtd_actions';
import {
  clockEntriesOf,
  clockMillis,
  clockSummary,
  formatClock,
  isClockRunning,
  toDateTimeInput,
  fromDateTimeInput,
} from '../../lib/gtd/gtd_tools';
import { copyTaskLink, shareTaskOrg, exportTaskPdf, toggleTaskClock } from './gtdTaskActions';

// Cualquier cambio en la tarea vuelve a crear su editor: el panel de registros se queda abierto
let panelOpenKey = null;

export default function TaskTools({ task, commit }) {
  const dispatch = useDispatch();
  const [open, setOpenState] = useState(() => panelOpenKey === task.key);
  const setOpen = (v) => {
    panelOpenKey = v ? task.key : null;
    setOpenState(v);
  };
  const entries = clockEntriesOf(task.header);
  const running = isClockRunning(task.header);
  const toast = (label) => label && dispatch(setDisappearingLoadingMessage(label, 1500));
  const run = (fn) => async () => {
    commit();
    toast(await dispatch(fn(task)));
  };
  const summary = clockSummary(task.header);
  // al salir del campo (así no se recrea el editor con cada cambio del selector)
  const applyTime = (entry, type, text) => {
    const date = fromDateTimeInput(text);
    const old = entry[type];
    if (!date || (old && toDateTimeInput(old) === text)) return;
    commit();
    dispatch(gtdClockSetTime(task, entry.id, type, date));
  };
  return (
    <div className="gtd-editor__tools" data-testid="gtd-editor-tools">
      <button
        type="button"
        className={'gtd-btn gtd-btn--link' + (running ? ' is-running' : '')}
        onClick={run(toggleTaskClock)}
        title={running ? 'Parar el reloj de esta tarea' : 'Iniciar el reloj de esta tarea'}
        data-testid="gtd-editor-clock-toggle"
      >
        <i className={running ? 'fas fa-stop' : 'fas fa-play'} />{' '}
        {running ? 'Parar reloj' : 'Iniciar reloj'}
      </button>
      {summary ? (
        <button
          type="button"
          className="gtd-btn gtd-btn--link gtd-editor__clock-summary"
          onClick={() => setOpen(!open)}
          title="Ver y editar los registros de tiempo (CLOCK)"
          data-testid="gtd-editor-clock-summary"
        >
          {summary}
        </button>
      ) : null}
      <span className="gtd-spacer" />
      <button
        type="button"
        className="gtd-btn gtd-btn--link"
        onClick={run(copyTaskLink)}
        title="Copiar el enlace de esta tarea ([[id:…]]) para pegarlo en otra"
        data-testid="gtd-editor-copy-link"
      >
        <i className="fas fa-share-alt" /> Enlace
      </button>
      <button
        type="button"
        className="gtd-btn gtd-btn--link"
        onClick={run(exportTaskPdf)}
        title="Exportar a PDF (con notas y subtareas)"
        data-testid="gtd-editor-export-pdf"
      >
        <i className="far fa-file-pdf" /> PDF
      </button>
      <button
        type="button"
        className="gtd-btn gtd-btn--link"
        onClick={run(shareTaskOrg)}
        title="Compartir o copiar como texto Org (con notas y subtareas)"
        data-testid="gtd-editor-export-org"
      >
        <i className="far fa-file-alt" /> Org
      </button>
      {open && entries.length > 0 && (
        <div className="gtd-clock-panel" data-testid="gtd-clock-panel">
          {entries.map((e) => (
            <div key={e.id} className="gtd-clock-row" data-testid="gtd-clock-row">
              <input
                type="datetime-local"
                defaultValue={toDateTimeInput(e.start)}
                onBlur={(ev) => applyTime(e, 'start', ev.target.value)}
                data-testid="gtd-clock-start"
              />
              <span>→</span>
              {e.end ? (
                <input
                  type="datetime-local"
                  defaultValue={toDateTimeInput(e.end)}
                  onBlur={(ev) => applyTime(e, 'end', ev.target.value)}
                  data-testid="gtd-clock-end"
                />
              ) : (
                <em>en marcha</em>
              )}
              <span className="gtd-clock-row__dur" data-testid="gtd-clock-dur">
                {formatClock(clockMillis([e]))}
              </span>
              <button
                type="button"
                className="gtd-btn gtd-btn--link gtd-btn--danger"
                onClick={() => dispatch(gtdClockDelete(task, e.id))}
                title="Borrar este registro"
                data-testid="gtd-clock-delete"
              >
                <i className="fas fa-trash" />
              </button>
            </div>
          ))}
          <div className="gtd-clock-total" data-testid="gtd-clock-total">
            Total: {formatClock(clockMillis(entries))}
          </div>
        </div>
      )}
    </div>
  );
}
