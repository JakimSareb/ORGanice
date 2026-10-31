// ORG Mode para Eli (4.58): Ajustes › Copias de seguridad (rotativas, en `backups/`).
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Switch from '../UI/Switch';
import { askConfirm, showMessage } from '../../lib/eli_prompt';
import { getBackupsOn, setBackupsOn, subscribeBackupsOn } from '../../lib/eli_backups';
import {
  backupsSupported,
  eliBackupTick,
  eliListBackups,
  eliRestoreBackup,
} from '../../actions/eli_backups';

const selectClient = (state) => state.syncBackend.get('client');

const formatDate = (d) =>
  d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatSize = (n) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const MESSAGES = {
  created: 'Copia creada.',
  unchanged: 'No hay cambios desde la última copia.',
  recent: 'Ya hay una copia de hace menos de una hora.',
  empty: 'No hay ficheros que copiar.',
  unverified: 'La copia no se pudo comprobar; no se ha borrado nada.',
  busy: 'Hay una copia en curso.',
};

export default function BackupsSettings() {
  const dispatch = useDispatch();
  const client = useSelector(selectClient);
  const [on, setOn] = useState(getBackupsOn());
  const [backups, setBackups] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const supported = backupsSupported(client);

  useEffect(() => subscribeBackupsOn(setOn), []);

  const refresh = async () => {
    try {
      const list = await dispatch(eliListBackups());
      setBackups(list.slice().reverse());
    } catch (e) {
      setBackups([]);
      setNote('No se han podido leer las copias (¿sin conexión?).');
    }
  };

  const backupNow = async () => {
    setBusy(true);
    setNote('');
    const result = await dispatch(eliBackupTick({ force: true }));
    setNote(
      result.status === 'error'
        ? `No se ha podido copiar: ${result.message}`
        : MESSAGES[result.status] || ''
    );
    await refresh();
    setBusy(false);
  };

  const restore = async (b) => {
    const ok = await askConfirm({
      title: 'Restaurar copia',
      message: `Se reescribirán los ficheros con los de la copia del ${formatDate(
        b.date
      )}. Antes se guarda una copia del estado actual y no se borra ningún fichero.`,
      okLabel: 'Restaurar',
      focusCancel: true,
    });
    if (!ok) return;
    setBusy(true);
    const result = await dispatch(eliRestoreBackup(b));
    setBusy(false);
    if (result.status !== 'restored') {
      await showMessage('No se ha restaurado', result.message || 'Error desconocido');
      return;
    }
    await showMessage(
      'Copia restaurada',
      `${result.restored} ficheros restaurados${
        result.skipped.length ? `; sin restaurar: ${result.skipped.join(', ')}` : ''
      }. Se recarga la app.`
    );
    window.location.reload();
  };

  return (
    <details
      className="eli-settings-section"
      data-testid="eli-settings-backups"
      onToggle={(e) => e.target.open && supported && backups === null && refresh()}
    >
      <summary>
        <span className="eli-settings-section__title">Copias de seguridad</span>
        <span className="eli-settings-section__hint">
          Una copia por hora si cambió algo; se guardan en la carpeta backups/
        </span>
      </summary>
      {!supported ? (
        <p className="setting-label__description" data-testid="eli-backups-unsupported">
          Las copias rotativas funcionan con Dropbox y con una carpeta del ordenador.
        </p>
      ) : (
        <>
          <div className="setting-container" data-testid="eli-setting-backups">
            <div className="setting-label">
              Copias automáticas
              <div className="setting-label__description">
                Se guardan las de las últimas 24 horas, 7 días, 4 semanas y 12 meses, y la más
                antigua de cada año. Las demás se borran solas.
              </div>
            </div>
            <Switch isEnabled={on} onToggle={() => setBackupsOn(!on)} />
          </div>
          <div className="setting-container">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={backupNow}
              data-testid="eli-backups-now"
            >
              Copiar ahora
            </button>
            <button type="button" className="btn" disabled={busy} onClick={refresh}>
              Ver copias
            </button>
          </div>
          {note && (
            <p className="setting-label__description" data-testid="eli-backups-note">
              {note}
            </p>
          )}
          {backups && (
            <ul className="eli-backups-list" data-testid="eli-backups-list">
              {backups.length === 0 && <li>Aún no hay copias.</li>}
              {backups.map((b) => (
                <li key={b.name} data-testid="eli-backups-item">
                  {formatDate(b.date)} · {formatSize(b.size)}{' '}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => restore(b)}
                    data-testid="eli-backups-restore"
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </details>
  );
}
