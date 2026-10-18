// ORG Mode para Eli (3.13): guiones en Fountain (https://fountain.io/syntax).
// Convierte el texto de un .fountain en una lista de elementos de guion
// ({ type, text, line, … }) que la vista pinta con el formato estándar.

export const FOUNTAIN_FILE = /\.(fountain|spmd)$/i;
export const isFountainPath = (path) => FOUNTAIN_FILE.test(String(path || ''));

const UPPER_LETTER = /[A-ZÁÉÍÓÚÑÜÇÀÈÌÒÙÏÂÊÎÔÛ]/;
const LOWER_LETTER = /[a-záéíóúñüçàèìòùïâêîôû]/;
const SCENE_RE = /^(?:INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)[. ]/i;
const TITLE_KEY_RE = /^([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ ]*):(.*)$/;

const isBlank = (s) => s === undefined || s.trim() === '';
const isAllUpper = (s) => UPPER_LETTER.test(s) && !LOWER_LETTER.test(s);

// Quita el «boneyard» (/* … */) dejando las líneas en blanco (para no mover los números de línea)
const stripBoneyard = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));

// Nombre de un personaje sin la extensión: «ANA (V.O.)» → «ANA»
export const characterName = (text) =>
  String(text || '')
    .replace(/\^\s*$/, '')
    .replace(/\(.*\)/g, '')
    .trim();

const parseTitlePage = (lines) => {
  if (!lines.length || !TITLE_KEY_RE.test(lines[0])) return { title: null, start: 0 };
  const entries = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) break;
    const m = TITLE_KEY_RE.exec(line);
    if (m && !/^\s/.test(line)) {
      entries.push({ key: m[1].trim(), values: m[2].trim() ? [m[2].trim()] : [] });
    } else if (entries.length) {
      entries[entries.length - 1].values.push(line.trim());
    } else {
      return { title: null, start: 0 };
    }
  }
  return { title: entries, start: i };
};

export const parseFountain = (source) => {
  const text = stripBoneyard(String(source || '').replace(/\r\n?/g, '\n'));
  const lines = text.split('\n');
  const { title, start } = parseTitlePage(lines);
  const elements = [];
  const push = (el) => elements.push(el);

  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    const prevBlank = i === 0 || isBlank(lines[i - 1]) || i === start;
    const nextBlank = isBlank(lines[i + 1]);

    if (!trimmed) {
      i++;
      continue;
    }

    // Salto de página
    if (/^={3,}$/.test(trimmed)) {
      push({ type: 'page_break', text: '', line: i });
      i++;
      continue;
    }
    // Notas de una línea entera: [[ … ]] (pueden ocupar varias líneas)
    if (trimmed.startsWith('[[')) {
      let j = i;
      let buf = trimmed;
      while (!buf.includes(']]') && j + 1 < lines.length && !isBlank(lines[j + 1])) {
        j++;
        buf += '\n' + lines[j].trim();
      }
      if (buf.endsWith(']]')) {
        push({ type: 'note', text: buf.slice(2, -2).trim(), line: i });
        i = j + 1;
        continue;
      }
    }
    // Secciones (#) y sinopsis (=)
    const sec = /^(#{1,6})\s*(.*)$/.exec(trimmed);
    if (sec) {
      push({ type: 'section', depth: sec[1].length, text: sec[2], line: i });
      i++;
      continue;
    }
    if (/^=(?!=)/.test(trimmed)) {
      push({ type: 'synopsis', text: trimmed.slice(1).trim(), line: i });
      i++;
      continue;
    }
    // Centrado: >texto<
    if (/^>.*<$/.test(trimmed)) {
      push({ type: 'centered', text: trimmed.slice(1, -1).trim(), line: i });
      i++;
      continue;
    }
    // Letras de canción: ~
    if (trimmed.startsWith('~')) {
      push({ type: 'lyrics', text: trimmed.slice(1).trim(), line: i });
      i++;
      continue;
    }
    // Encabezado de escena: forzado con «.» o INT./EXT. con línea en blanco antes y después
    if (
      prevBlank &&
      ((/^\.[^.]/.test(trimmed) && nextBlank) || (SCENE_RE.test(trimmed) && nextBlank))
    ) {
      let heading = trimmed.startsWith('.') ? trimmed.slice(1).trim() : trimmed;
      let number = null;
      const num = /\s*#([^#]+)#\s*$/.exec(heading);
      if (num) {
        number = num[1].trim();
        heading = heading.slice(0, num.index).trim();
      }
      push({ type: 'scene_heading', text: heading, number, line: i });
      i++;
      continue;
    }
    // Transición: forzada con «>» o EN MAYÚSCULAS terminada en «TO:» / « A:»
    if (prevBlank && nextBlank && trimmed.startsWith('>')) {
      push({ type: 'transition', text: trimmed.slice(1).trim(), line: i });
      i++;
      continue;
    }
    if (prevBlank && nextBlank && isAllUpper(trimmed) && /(TO:|\sA:|^FUNDIDO.*:)$/.test(trimmed)) {
      push({ type: 'transition', text: trimmed, line: i });
      i++;
      continue;
    }
    // Personaje + diálogo: forzado con «@» o EN MAYÚSCULAS con algo debajo
    const forcedChar = trimmed.startsWith('@');
    const charText = forcedChar ? trimmed.slice(1).trim() : trimmed;
    if (
      prevBlank &&
      !nextBlank &&
      !trimmed.startsWith('!') &&
      (forcedChar || isAllUpper(charText.replace(/\(.*\)/g, '')))
    ) {
      const dual = /\^\s*$/.test(charText);
      const name = charText.replace(/\^\s*$/, '').trim();
      const block = { type: 'character', text: name, dual, line: i };
      push(block);
      let j = i + 1;
      while (j < lines.length && !isBlank(lines[j])) {
        const t = lines[j].trim();
        if (/^\(.*\)$/.test(t)) push({ type: 'parenthetical', text: t, line: j });
        else if (t.startsWith('~')) push({ type: 'lyrics', text: t.slice(1).trim(), line: j });
        else push({ type: 'dialogue', text: lines[j].replace(/^\s+/, ''), line: j });
        j++;
      }
      i = j;
      continue;
    }
    // Acción (forzada con «!»): las líneas seguidas forman un solo párrafo
    let j = i;
    const parts = [];
    while (j < lines.length && !isBlank(lines[j])) {
      let t = lines[j].replace(/\s+$/, '');
      if (j === i && t.trim().startsWith('!')) t = t.replace(/^\s*!/, '');
      parts.push(t);
      j++;
      // un encabezado forzado o una sección cortan el párrafo
      if (j < lines.length && /^(#|={3,}$)/.test((lines[j] || '').trim())) break;
    }
    push({ type: 'action', text: parts.join('\n'), line: i });
    i = j;
  }

  // Diálogo doble: el personaje con «^» va al lado del bloque anterior
  for (let k = 0; k < elements.length; k++) {
    if (elements[k].type === 'character' && elements[k].dual) {
      let p = k - 1;
      while (p >= 0 && ['dialogue', 'parenthetical', 'lyrics'].includes(elements[p].type)) p--;
      if (p >= 0 && elements[p].type === 'character') elements[p].dualFirst = true;
    }
  }

  return { title, elements };
};

// Énfasis en línea: ***negrita cursiva***, **negrita**, *cursiva*, _subrayado_ (\* escapa)
// Devuelve trozos { text, b, i, u, note } para pintarlos sin HTML.
export const inlineSpans = (text) => {
  const src = String(text || '');
  const out = [];
  const state = { b: false, i: false, u: false };
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, ...state });
    buf = '';
  };
  const closes = (from, marker) => src.indexOf(marker, from) !== -1;
  let k = 0;
  while (k < src.length) {
    const ch = src[k];
    if (ch === '\\' && k + 1 < src.length) {
      buf += src[k + 1];
      k += 2;
      continue;
    }
    if (src.startsWith('[[', k)) {
      const end = src.indexOf(']]', k + 2);
      if (end !== -1) {
        flush();
        out.push({ text: src.slice(k + 2, end).trim(), note: true });
        k = end + 2;
        continue;
      }
    }
    if (src.startsWith('***', k) && (state.b && state.i ? true : closes(k + 3, '***'))) {
      flush();
      const on = !(state.b && state.i);
      state.b = on;
      state.i = on;
      k += 3;
      continue;
    }
    if (src.startsWith('**', k) && (state.b || closes(k + 2, '**'))) {
      flush();
      state.b = !state.b;
      k += 2;
      continue;
    }
    if (ch === '*' && (state.i || closes(k + 1, '*'))) {
      flush();
      state.i = !state.i;
      k += 1;
      continue;
    }
    if (ch === '_' && (state.u || closes(k + 1, '_'))) {
      flush();
      state.u = !state.u;
      k += 1;
      continue;
    }
    buf += ch;
    k++;
  }
  flush();
  return out;
};

// Datos para la cabecera: escenas, personajes y páginas aproximadas (≈55 líneas por página)
export const fountainStats = (elements) => {
  const scenes = elements.filter((e) => e.type === 'scene_heading');
  const characters = Array.from(
    new Set(elements.filter((e) => e.type === 'character').map((e) => characterName(e.text)))
  ).filter(Boolean);
  const widths = { action: 60, dialogue: 35, parenthetical: 25, lyrics: 35, centered: 60 };
  let lines = 0;
  elements.forEach((e) => {
    if (e.type === 'page_break') {
      lines = Math.ceil(lines / 55) * 55;
      return;
    }
    if (['note', 'section', 'synopsis'].includes(e.type)) return;
    const w = widths[e.type] || 60;
    const body = String(e.text || '')
      .split('\n')
      .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / w)), 0);
    const gap = ['dialogue', 'parenthetical'].includes(e.type) ? 0 : 1;
    lines += body + gap;
  });
  return { scenes, characters, pages: Math.max(1, Math.ceil(lines / 55)) };
};

export const newFountainTemplate = (title) =>
  `Title: ${title}
Credit: escrito por
Author:
Draft date: ${new Date().toLocaleDateString('es-ES')}

INT. LUGAR - DÍA

Descripción de lo que se ve.

PERSONAJE
Lo que dice.

CORTE A:
`;
