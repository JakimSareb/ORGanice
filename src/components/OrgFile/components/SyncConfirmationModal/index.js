import React from 'react';

import './stylesheet.css';

import { customFormatDistanceToNow } from '../../../../lib/org_utils';
import format from 'date-fns/format';

export default ({ lastServerModifiedAt, lastSyncAt, path, onPull, onPush, onCancel }) => {
  return (
    <>
      <h2 className="sync-confirmation-modal__header">Conflicto de sincronización</h2>
      Desde la última vez que descargaste {path}, se ha subido al servidor una versión más reciente
      del fichero. La versión más reciente es del:
      <br />
      &nbsp;
      <br />
      <div className="sync-confirmation-modal__last-sync-time">
        {format(lastServerModifiedAt, 'dd/MM/yyyy HH:mm:ss')}
        <br />({customFormatDistanceToNow(lastServerModifiedAt)})
      </div>
      <br />
      &nbsp;
      <br />
      Mientras que tu versión es del:
      <br />
      &nbsp;
      <br />
      <div className="sync-confirmation-modal__last-sync-time">
        {format(lastSyncAt, 'dd/MM/yyyy HH:mm:ss')}
        <br />({customFormatDistanceToNow(lastSyncAt)})
      </div>
      <div className="sync-confirmation-modal__buttons-container">
        <button className="btn sync-confirmation-modal__button" onClick={onPull}>
          Descargar la última versión del servidor
        </button>
        <button className="btn sync-confirmation-modal__button" onClick={onPush}>
          Sobrescribir la versión del servidor
        </button>
        <button className="btn sync-confirmation-modal__button" onClick={onCancel}>
          Cancelar sincronización
        </button>
      </div>
      <br />
    </>
  );
};
