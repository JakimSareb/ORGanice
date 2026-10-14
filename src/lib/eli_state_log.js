// ORG Mode para Eli (3.05): «Ordenar historial» (Herramientas). Las líneas de cambio de estado
// sueltas en las notas de un encabezado (- State "DONE" from "TODO" [fecha]) pasan a su cajón
// :LOGBOOK: (que se crea si no existe, tras la planificación y :PROPERTIES:), como hace Emacs con
// org-log-into-drawer. Se mantiene el orden (las más nuevas arriba) y las notas de varias líneas
// (que acaban en «\\») se mueven con su línea.
//
// Trabaja sobre el texto del cuerpo del encabezado (sin el título).

const STATE_RE = /^(\s*)- State\s+"[^"]*"/;
const DRAWER_START_RE = /^\s*:([A-Za-z][A-Za-z0-9_-]*):\s*$/;
const DRAWER_END_RE = /^\s*:END:\s*$/i;
const PLANNING_RE = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;
const STAMP_RE = /\[(\d{4})-(\d{2})-(\d{2})(?:\s+\S+)?(?:\s+(\d{1,2}):(\d{2}))?[^\]]*\]/;

const indentOf = (line) => (/^(\s*)/.exec(line) || ['', ''])[1].length;

// Momento de una línea de estado (para ordenar); sin fecha: null
export const stateLineTime = (line) => {
  const m = STAMP_RE.exec(line || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
};

// ¿Hay líneas de estado sueltas (fuera de los cajones)?
export const hasLooseStateLines = (body) => tidyStateLog(body).moved > 0;

export const tidyStateLog = (body) => {
  const lines = (body || '').split('\n');
  const rest = [];
  const entries = []; // [[línea, ...continuación]]
  let drawer = null;
  let logbookStart = -1; // índice en `rest`
  let logbookEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (drawer) {
      rest.push(line);
      if (DRAWER_END_RE.test(line)) {
        if (drawer === 'LOGBOOK' && logbookEnd < 0) logbookEnd = rest.length - 1;
        drawer = null;
      }
      continue;
    }
    const d = DRAWER_START_RE.exec(line);
    if (d && !DRAWER_END_RE.test(line)) {
      drawer = d[1].toUpperCase();
      if (drawer === 'LOGBOOK' && logbookStart < 0) logbookStart = rest.length;
      rest.push(line);
      continue;
    }
    const m = STATE_RE.exec(line);
    if (m) {
      const base = m[1].length;
      const entry = [line];
      // Nota de varias líneas: las de después, con más sangría que el guion
      if (/\\\\\s*$/.test(line)) {
        while (i + 1 < lines.length && lines[i + 1].trim() && indentOf(lines[i + 1]) > base) {
          entry.push(lines[++i]);
        }
      }
      entries.push(entry);
      continue;
    }
    rest.push(line);
  }
  if (!entries.length) return { text: body || '', moved: 0 };

  // Sangría relativa: la línea «- State» sin sangría; la continuación, con la que tenía de más
  const normalized = entries.map((entry) => {
    const base = indentOf(entry[0]);
    return entry.map((l, k) =>
      k === 0 ? l.trim() : ' '.repeat(Math.max(2, indentOf(l) - base)) + l.trim()
    );
  });

  if (logbookStart >= 0 && logbookEnd > logbookStart) {
    // Se meten en el cajón que ya hay: cada una delante de la primera línea de estado más antigua
    const ind = (rest[logbookStart].match(/^\s*/) || [''])[0];
    const inside = rest.slice(logbookStart + 1, logbookEnd);
    const blocks = [];
    inside.forEach((l) => {
      if (STATE_RE.test(l) || /^\s*CLOCK:/.test(l) || !blocks.length) blocks.push([l]);
      else blocks[blocks.length - 1].push(l);
    });
    normalized.forEach((entry) => {
      const t = stateLineTime(entry[0]);
      let at = blocks.length;
      if (t !== null) {
        const idx = blocks.findIndex((b) => {
          if (!STATE_RE.test(b[0])) return false;
          const bt = stateLineTime(b[0]);
          return bt !== null && bt < t;
        });
        if (idx >= 0) at = idx;
      }
      blocks.splice(
        at,
        0,
        entry.map((l) => ind + l)
      );
    });
    const merged = [].concat(...blocks);
    rest.splice(logbookStart + 1, logbookEnd - logbookStart - 1, ...merged);
    return { text: rest.join('\n'), moved: entries.length };
  }

  // Sin cajón: se crea tras la planificación y el cajón :PROPERTIES: (si los hay)
  let at = 0;
  while (at < rest.length && PLANNING_RE.test(rest[at])) at++;
  if (at < rest.length && /^\s*:PROPERTIES:\s*$/i.test(rest[at])) {
    let j = at + 1;
    while (j < rest.length && !DRAWER_END_RE.test(rest[j])) j++;
    if (j < rest.length) at = j + 1;
  }
  const ind = at > 0 ? (rest[at - 1].match(/^\s*/) || [''])[0] : '';
  const drawerLines = [
    `${ind}:LOGBOOK:`,
    ...[].concat(...normalized).map((l) => ind + l),
    `${ind}:END:`,
  ];
  rest.splice(at, 0, ...drawerLines);
  // Sin líneas en blanco sobrantes donde estaban las de estado (solo al final)
  while (rest.length && !rest[rest.length - 1].trim() && rest.length > at + drawerLines.length)
    rest.pop();
  return { text: rest.join('\n'), moved: entries.length };
};
