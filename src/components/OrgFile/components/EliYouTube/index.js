import React from 'react';

import './stylesheet.css';

import ExternalLink from '../../../UI/ExternalLink';

// ORG Mode para Eli: previsualización de vídeos de YouTube (300 px de ancho).
// Se usa youtube-nocookie.com (modo de privacidad mejorada de YouTube: no deja cookies
// hasta que se reproduce el vídeo).
const PATTERNS = [
  /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/i,
  /^https?:\/\/youtu\.be\/([\w-]{11})/i,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|embed|live|v)\/([\w-]{11})/i,
  /^https?:\/\/(?:www\.)?youtube-nocookie\.com\/embed\/([\w-]{11})/i,
];

export const youTubeId = (url) => {
  if (!url) return null;
  for (const re of PATTERNS) {
    const m = re.exec(url.trim());
    if (m) return m[1];
  }
  return null;
};

// Segundo de inicio: t=90, t=1m30s, start=90
export const youTubeStart = (url) => {
  const m = /[?&#](?:t|start)=([\dhms]+)/i.exec(url || '');
  if (!m) return 0;
  const v = m[1];
  if (/^\d+$/.test(v)) return +v;
  const h = /(\d+)h/.exec(v);
  const mi = /(\d+)m/.exec(v);
  const s = /(\d+)s/.exec(v);
  return (h ? +h[1] * 3600 : 0) + (mi ? +mi[1] * 60 : 0) + (s ? +s[1] : 0);
};

export default function EliYouTube({ url, title }) {
  const id = youTubeId(url);
  const start = youTubeStart(url);
  const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}`;
  return (
    <span className="eli-youtube">
      <iframe
        className="eli-youtube__frame"
        src={src}
        title={title || 'Vídeo de YouTube'}
        width="300"
        height="169"
        loading="lazy"
        frameBorder="0"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
      <span className="eli-youtube__link">
        <ExternalLink href={url}>{title || url}</ExternalLink>
      </span>
    </span>
  );
}
