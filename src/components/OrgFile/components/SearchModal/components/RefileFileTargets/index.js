// ORG Mode para Eli: en el refile, destinos "fichero" (nivel superior, sin encabezado padre).
import './stylesheet.css';
import React, { useState } from 'react';
import { useSelector } from 'react-redux';

import { STATIC_FILE_PREFIX } from '../../../../../../lib/org_utils';
import { fileDisplayName } from '../../../../../../lib/eli_app_name';

const selectPresent = (s) => s.org.present;
const selectClient = (s) => s.syncBackend.get('client');

const dirOf = (p) => p.replace(/\/[^/]*$/, '') || '/';

function FileRow({ path, onPick, current }) {
  return (
    <button
      className="eli-refile-file"
      onClick={() => onPick(path)}
      title={`Mover al nivel superior de ${path}`}
      data-testid={`eli-refile-file-${path}`}
    >
      <i className="far fa-file-alt" />{' '}
      <span className="eli-refile-file__name">
        {/\.(gpg|asc)$/i.test(path) && <i className="fas fa-lock" />} {fileDisplayName(path)}
      </span>
      {current && <span className="eli-refile-file__tag">este fichero</span>}
      {dirOf(path) !== '/' && <span className="eli-refile-file__dir">{dirOf(path)}</span>}
    </button>
  );
}

export default function RefileFileTargets({ onPick }) {
  const present = useSelector(selectPresent);
  const client = useSelector(selectClient);
  const filter = (present.getIn(['search', 'searchFilter']) || '').trim().toLowerCase();
  const currentPath = present.get('path');
  const fileSettings = present.get('fileSettings');
  const [others, setOthers] = useState(null); // null | 'loading' | [paths] | {error}

  const loaded = Array.from(present.get('files').keys()).filter((p) => {
    if (!p || p.startsWith(STATIC_FILE_PREFIX)) return false;
    if (p === currentPath) return true;
    const setting = fileSettings.find((s) => s.get('path') === p);
    return !!setting && !!setting.get('includeInRefile');
  });
  const matches = (p) => !filter || p.toLowerCase().includes(filter);
  const shown = loaded
    .filter(matches)
    .sort((a, b) => (a === currentPath ? -1 : b === currentPath ? 1 : a.localeCompare(b)));

  const loadOthers = () => {
    if (!client || !client.listOrgFiles) {
      setOthers({ error: 'No disponible con este servicio.' });
      return;
    }
    setOthers('loading');
    client.listOrgFiles().then(
      (paths) => setOthers(paths),
      (e) => setOthers({ error: (e && e.message) || 'No se pudo leer Dropbox' })
    );
  };

  const otherList = Array.isArray(others)
    ? others.filter((p) => !loaded.includes(p) && matches(p))
    : [];

  return (
    <div className="eli-refile-files" data-testid="eli-refile-files">
      <div className="eli-refile-files__title">Al nivel superior de un fichero</div>
      {shown.map((p) => (
        <FileRow key={p} path={p} onPick={onPick} current={p === currentPath} />
      ))}
      {others === null && (
        <button
          className="eli-refile-files__more"
          onClick={loadOthers}
          data-testid="eli-refile-more"
        >
          <i className="fas fa-folder-open" /> Otro fichero de Dropbox…
        </button>
      )}
      {others === 'loading' && (
        <div className="eli-refile-files__muted">
          <i className="fas fa-spinner fa-spin" /> Buscando ficheros…
        </div>
      )}
      {others && others.error && <div className="eli-refile-files__muted">{others.error}</div>}
      {otherList.map((p) => (
        <FileRow key={p} path={p} onPick={onPick} />
      ))}
      {Array.isArray(others) && otherList.length === 0 && (
        <div className="eli-refile-files__muted">No hay más ficheros .org.</div>
      )}
      <div className="eli-refile-files__title">O debajo de un encabezado</div>
    </div>
  );
}
