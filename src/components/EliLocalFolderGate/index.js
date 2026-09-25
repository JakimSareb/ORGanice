// ORG Mode para Eli: pide al navegador permiso para la carpeta local cuando hace falta
// (al volver a abrir la app, Edge/Chrome pueden pedir confirmación otra vez).
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  loadRootHandle,
  permissionState,
  requestFolderPermission,
  pickLocalFolder,
} from '../../sync_backend_clients/local_folder_sync_backend_client';

const selectType = (state) => {
  const client = state.syncBackend.get('client');
  return client ? client.type : null;
};

export default function EliLocalFolderGate() {
  const type = useSelector(selectType);
  const [state, setState] = useState(null); // null | 'prompt' | 'denied' | 'missing'
  const [name, setName] = useState('');

  useEffect(() => {
    if (type !== 'LocalFolder') return undefined;
    let alive = true;
    const check = async () => {
      const handle = await loadRootHandle().catch(() => null);
      if (!alive) return;
      setName(handle ? handle.name : '');
      const st = await permissionState(handle);
      if (alive) setState(st === 'granted' ? null : st);
    };
    check();
    const onNeeded = () => check();
    window.addEventListener('eli:local-permission-needed', onNeeded);
    return () => {
      alive = false;
      window.removeEventListener('eli:local-permission-needed', onNeeded);
    };
  }, [type]);

  if (type !== 'LocalFolder' || !state) return null;
  const folder = name ? `la carpeta «${name}»` : 'la carpeta elegida';

  const granted = () => {
    setState(null);
    window.dispatchEvent(new CustomEvent('eli:local-permission'));
  };
  const allow = async () => {
    const st = await requestFolderPermission().catch(() => 'denied');
    if (st === 'granted') granted();
    else setState(st);
  };
  const choose = async () => {
    try {
      const handle = await pickLocalFolder();
      setName(handle.name);
      granted();
    } catch (e) {
      // cancelado
    }
  };

  return (
    <div className="eli-prompt__overlay" data-testid="eli-local-gate">
      <div className="eli-prompt__box" role="dialog">
        <div className="eli-prompt__title">
          <i className="fas fa-folder-open" /> Carpeta de este ordenador
        </div>
        <div className="eli-prompt__message">
          {state === 'missing'
            ? 'Elige la carpeta donde están tus ficheros .org.'
            : state === 'denied'
            ? `El navegador no ha dado permiso para ${folder}. Vuelve a intentarlo o elige otra carpeta.`
            : `El navegador pide confirmar el acceso a ${folder}.`}
        </div>
        <div className="eli-prompt__buttons">
          <button className="btn eli-prompt__cancel" onClick={choose}>
            Elegir otra carpeta
          </button>
          {state !== 'missing' && (
            <button className="btn eli-prompt__ok" onClick={allow} data-testid="eli-local-allow">
              Permitir acceso
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
