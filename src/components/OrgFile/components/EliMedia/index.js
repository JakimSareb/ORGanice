import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import './stylesheet.css';

import {
  mediaKind,
  resolveDropboxPath,
  loadPreviewUrl,
  loadTemporaryLink,
  openInNewTab,
} from '../../../../lib/eli_media';
import { STATIC_FILE_PREFIX } from '../../../../lib/org_utils';

// ORG Mode para Eli: muestra un enlace Org a un fichero de Dropbox (imagen, vídeo, audio u
// otro). Las imágenes se ven en línea (miniatura); al pulsar se abre el original.
const selectClient = (state) => state.syncBackend.get('client');
const selectPath = (state) => state.org.present.get('path');

export default function EliMedia({ target, title }) {
  const client = useSelector(selectClient);
  const orgPath = useSelector(selectPath);
  const path =
    orgPath && !orgPath.startsWith(STATIC_FILE_PREFIX) ? resolveDropboxPath(orgPath, target) : null;
  const kind = mediaKind(target);
  const label = title && title !== target && title !== `file:${target}` ? title : null;
  const name = target.split('/').pop();
  const supported = !!(client && client.getTemporaryLink && path);

  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setError(null);
    if (!supported || (kind !== 'image' && kind !== 'video' && kind !== 'audio')) return;
    const loader = kind === 'image' ? loadPreviewUrl(client, path) : loadTemporaryLink(client, path);
    loader
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setError('No se encontró en Dropbox'));
    return () => {
      alive = false;
    };
  }, [client, path, kind, supported]);

  const open = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!supported) return;
    openInNewTab(client, path).catch(() => setError('No se pudo abrir desde Dropbox'));
  };

  const icon = { image: 'fa-image', video: 'fa-film', audio: 'fa-music', file: 'fa-paperclip' }[kind];

  const chip = (
    <span className="eli-media__chip" onClick={open} title={path || target} role="link">
      <i className={`fas ${icon}`} /> {label || name}
      {error && <span className="eli-media__error"> — {error}</span>}
    </span>
  );

  if (!supported || error) return chip;

  if (kind === 'image') {
    return (
      <span className="eli-media eli-media--image">
        {src ? (
          <img src={src} alt={label || name} className="eli-media__img" onClick={open} />
        ) : (
          <span className="eli-media__placeholder">
            <i className="fas fa-spinner fa-spin" /> {name}
          </span>
        )}
        {label && <span className="eli-media__caption">{label}</span>}
      </span>
    );
  }

  if (kind === 'video' || kind === 'audio') {
    const Tag = kind;
    return (
      <span className={`eli-media eli-media--${kind}`}>
        {src ? (
          <Tag
            src={src}
            controls
            preload="metadata"
            playsInline
            className="eli-media__player"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="eli-media__placeholder">
            <i className="fas fa-spinner fa-spin" /> {name}
          </span>
        )}
        {chip}
      </span>
    );
  }

  return chip;
}
