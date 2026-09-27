import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { eliPrepareOffline, eliClearOffline, offlineStatusText } from '../../actions/eli_offline';
import { getPersistPlainFiles, getOfflineEncrypted } from '../../lib/eli_security';

const selectClient = (state) => state.syncBackend.get('client');

// ORG Mode para Eli (2.12): Ajustes → Usar sin conexión
export default function OfflineSettings() {
  const dispatch = useDispatch();
  const client = useSelector(selectClient);
  const [, refresh] = useState(0);
  const isLocalFolder = client && client.type === 'LocalFolder';

  const run = async (action) => {
    await dispatch(action());
    refresh((n) => n + 1);
  };

  if (isLocalFolder) {
    return (
      <div className="eli-offline-settings">
        <p className="setting-label__description">
          Con una carpeta del ordenador la app ya funciona sin conexión.
        </p>
      </div>
    );
  }

  return (
    <div className="eli-offline-settings" data-testid="eli-offline-settings">
      <p className="setting-label__description">
        Guarda tus ficheros en este dispositivo para poder abrir la app y trabajar sin Internet (por
        ejemplo, en un viaje). Lo que cambies se sube solo al volver la conexión. En el iPhone,
        ábrela desde su icono de la pantalla de inicio.
      </p>
      <p className="eli-offline-settings__status" data-testid="eli-offline-status">
        <i className="fas fa-plane" /> {offlineStatusText()}
        <br />
        Copia local de ficheros sin cifrar: {getPersistPlainFiles() ? 'sí' : 'no'} · Ficheros
        cifrados (solo cifrados): {getOfflineEncrypted() ? 'sí' : 'no'}
      </p>
      <div className="eli-offline-settings__buttons">
        <button
          type="button"
          className="btn"
          onClick={() => run(eliPrepareOffline)}
          data-testid="eli-offline-prepare"
        >
          <i className="fas fa-download" /> Preparar para usar sin conexión
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => run(eliClearOffline)}
          data-testid="eli-offline-clear"
        >
          <i className="fas fa-trash-alt" /> Borrar lo guardado
        </button>
      </div>
    </div>
  );
}
