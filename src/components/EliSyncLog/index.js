// ORG Mode para Eli (4.33): registro de errores de sincronización. Panel (Ajustes ›
// Sincronización › Registro) y hoja que se abre desde el aviso ⚠ del botón de sincronizar
// (evento `eli:sync-log`).
import React, { useEffect, useState } from 'react';

import './stylesheet.css';

import {
  useSyncLog,
  clearSyncLog,
  syncLogText,
  markSyncLogSeen,
  MAX_EVENTS,
} from '../../lib/eli_sync_log';

const when = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
};

export const SyncLogPanel = () => {
  const list = useSyncLog();
  const [msg, setMsg] = useState('');
  useEffect(() => {
    markSyncLogSeen();
  }, [list.length]);
  const copy = async () => {
    const text = syncLogText(list);
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copiado');
    } catch (e) {
      // sin portapapeles: se selecciona el texto para copiarlo a mano
      window.prompt('Copia el registro:', text);
    }
  };
  return (
    <div className="eli-synclog" data-testid="eli-sync-log">
      <div className="eli-synclog__bar">
        <span className="eli-synclog__count">
          {list.length
            ? `${list.length} evento${list.length === 1 ? '' : 's'} (como mucho ${MAX_EVENTS})`
            : 'Sin errores de sincronización.'}
        </span>
        <span className="eli-synclog__msg">{msg}</span>
        <button
          type="button"
          className="btn-passive"
          onClick={copy}
          disabled={!list.length}
          data-testid="eli-sync-log-copy"
        >
          <i className="fas fa-copy" /> Copiar
        </button>
        <button
          type="button"
          className="btn-passive"
          onClick={() => {
            clearSyncLog();
            setMsg('');
          }}
          disabled={!list.length}
          data-testid="eli-sync-log-clear"
        >
          <i className="fas fa-trash-alt" /> Vaciar
        </button>
      </div>
      {list.length > 0 && (
        <ul className="eli-synclog__list">
          {list.map((e, i) => (
            <li key={e.at + i} className="eli-synclog__item" data-testid="eli-sync-log-item">
              <span className="eli-synclog__when">{when(e.at)}</span>
              <span className="eli-synclog__op">{e.op}</span>
              <span className="eli-synclog__file">{e.file}</span>
              <span className="eli-synclog__err">{e.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function EliSyncLog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('eli:sync-log', on);
    return () => window.removeEventListener('eli:sync-log', on);
  }, []);
  if (!open) return null;
  return (
    <div
      className="eli-scratch__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
      data-testid="eli-sync-log-sheet"
    >
      <div className="eli-scratch eli-synclog-sheet" role="dialog" aria-label="Registro">
        <div className="eli-scratch__bar">
          <strong>Registro de sincronización</strong>
          <span className="eli-scratch__spacer" />
          <button type="button" className="eli-scratch__btn" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
        <SyncLogPanel />
      </div>
    </div>
  );
}
