// ORG Mode para Eli: prioridades de Org ([#A], [#B], [#C]) en el título de un encabezado.

export const PRIORITY_RE = /^\s*\[#([A-Z0-9])\]\s*/;

export const getPriority = (header) => {
  const m = PRIORITY_RE.exec(header.getIn(['titleLine', 'rawTitle']) || '');
  return m ? m[1] : null;
};

// Línea de título completa (palabra clave + título + etiquetas) para updateHeaderTitle
export const rawTitleLine = (header, newRawTitle) => {
  const todo = header.getIn(['titleLine', 'todoKeyword']);
  const tags = (header.getIn(['titleLine', 'tags']) || []).filter((t) => !!t);
  const tagText = tags.size || tags.length ? ` :${tags.join(':')}:` : '';
  return `${todo ? todo + ' ' : ''}${newRawTitle.trim()}${tagText}`;
};

// Pone [#A]; si ya la tenía, la quita (sustituye cualquier otra prioridad)
export const toggledPriorityATitle = (header) => {
  const raw = header.getIn(['titleLine', 'rawTitle']) || '';
  const rest = raw.replace(PRIORITY_RE, '');
  const next = getPriority(header) === 'A' ? rest : `[#A] ${rest}`;
  return rawTitleLine(header, next);
};

// Partes del título sin el prefijo de prioridad (para pintarlo como estrella)
export const titlePartsWithoutPriority = (parts) => {
  if (!parts || !parts.size) return parts;
  const first = parts.first();
  if (first.get('type') !== 'text' || !PRIORITY_RE.test(first.get('contents'))) return parts;
  return parts.update(0, (p) => p.set('contents', p.get('contents').replace(PRIORITY_RE, '')));
};
