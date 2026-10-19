// ORG Mode para Eli (3.14): guion Fountain → PDF en A4 con el formato estándar de guion
// (Courier 12, 6 líneas por pulgada). Sin librerías: se escribe el PDF a mano con las
// fuentes Courier que todo lector de PDF trae de serie (no hace falta incrustarlas).
// Las notas, secciones y sinopsis no se imprimen (como en cualquier programa de guion).
import { parseFountain, inlineSpans, characterName } from './eli_fountain';

// --- Medidas (puntos; 72 pt = 1 pulgada) ---
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LH = 12; // altura de línea
const CW = 7.2; // ancho de un carácter de Courier 12
const TOP = 72;
export const LINES_PER_PAGE = 58; // (alto − 2 × 1″) / 12 pt
const IN = 72;

const COL = {
  action: { x: 1.5 * IN, w: 57 },
  scene_heading: { x: 1.5 * IN, w: 57 },
  character: { x: 3.7 * IN, w: 33 },
  parenthetical: { x: 3.1 * IN, w: 24 },
  dialogue: { x: 2.5 * IN, w: 35 },
  lyrics: { x: 2.5 * IN, w: 35 },
};
const RIGHT = COL.action.x + COL.action.w * CW; // borde derecho del texto
// Diálogo doble: dos columnas estrechas
const DUAL = [
  { character: 1.9 * IN, parenthetical: 1.7 * IN, dialogue: 1.5 * IN, w: 26, pw: 22 },
  { character: 4.9 * IN, parenthetical: 4.7 * IN, dialogue: 4.5 * IN, w: 26, pw: 22 },
];

export const MORE = '(MÁS)';
export const CONTD = '(CONT.)';

// --- Texto con estilos → líneas ajustadas al ancho ---
const plainStyle = { b: false, i: false, u: false };

const toChars = (text, extra = {}) => {
  const chars = [];
  inlineSpans(String(text || '').normalize('NFC')).forEach((s) => {
    if (s.note) return; // [[notas]] dentro del texto: no se imprimen
    const st = { b: !!(s.b || extra.b), i: !!(s.i || extra.i), u: !!(s.u || extra.u) };
    s.text
      .replace(/\t/g, '    ')
      .split('')
      .forEach((ch) => chars.push({ ch, ...st }));
  });
  return chars;
};

const sameStyle = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u;

const toRuns = (chars) => {
  const runs = [];
  chars.forEach((c) => {
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, c)) last.text += c.ch;
    else runs.push({ text: c.ch, b: c.b, i: c.i, u: c.u });
  });
  return runs;
};

// Ajusta a «width» caracteres partiendo por espacios (o a lo bruto si la palabra no cabe).
export const wrapChars = (chars, width) => {
  const paragraphs = [[]];
  chars.forEach((c) => {
    if (c.ch === '\n') paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(c);
  });
  const out = [];
  paragraphs.forEach((p) => {
    let rest = p;
    if (!rest.length) {
      out.push([]);
      return;
    }
    while (rest.length > width) {
      let cut = -1;
      for (let k = width; k > 0; k--) {
        if (rest[k].ch === ' ') {
          cut = k;
          break;
        }
      }
      if (cut <= 0) {
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      } else {
        let end = cut;
        while (end > 0 && rest[end - 1].ch === ' ') end--;
        out.push(rest.slice(0, end));
        rest = rest.slice(cut + 1);
      }
    }
    out.push(rest);
  });
  return out;
};

const textWidth = (runs) => runs.reduce((n, r) => n + r.text.length, 0);

// Línea de salida: { x, runs } (runs vacío = línea en blanco)
const lineAt = (x, chars) => ({ x, runs: toRuns(chars) });
const wrapped = (text, x, width, extra) =>
  wrapChars(toChars(text, extra), width).map((cs) => lineAt(x, cs));
const upper = (s) => String(s || '').toLocaleUpperCase('es');

// --- Bloques de un guion ---
// Cada bloque: { before (líneas en blanco antes), lines, kind, keep (líneas mínimas tras él) }
const dialogueLines = (group, col) => {
  // group: [character, ...parenthetical/dialogue/lyrics]
  const [ch, ...rest] = group;
  const name = upper(ch.text.replace(/^@/, ''));
  const lines = wrapped(name, col.character, col.cw || 38).map((l) => ({
    ...l,
    role: 'character',
  }));
  rest.forEach((e) => {
    if (e.type === 'parenthetical') {
      wrapped(e.text, col.parenthetical, col.pw).forEach((l) =>
        lines.push({ ...l, role: 'parenthetical' })
      );
    } else {
      const extra = e.type === 'lyrics' ? { i: true } : undefined;
      wrapped(e.text, col.dialogue, col.w, extra).forEach((l) =>
        lines.push({ ...l, role: 'dialogue' })
      );
    }
  });
  return { name: characterName(ch.text.replace(/^@/, '')), lines };
};

const SINGLE_COL = {
  character: COL.character.x,
  cw: COL.character.w,
  parenthetical: COL.parenthetical.x,
  pw: COL.parenthetical.w,
  dialogue: COL.dialogue.x,
  w: COL.dialogue.w,
};

export const buildBlocks = (elements) => {
  const blocks = [];
  let k = 0;
  const takeGroup = () => {
    const group = [elements[k]];
    k++;
    while (
      k < elements.length &&
      ['dialogue', 'parenthetical', 'lyrics'].includes(elements[k].type)
    ) {
      // las letras sueltas tras un diálogo forman parte de él solo si van seguidas (misma estrofa)
      if (elements[k].type === 'lyrics' && elements[k].line !== elements[k - 1].line + 1) break;
      group.push(elements[k]);
      k++;
    }
    return group;
  };
  while (k < elements.length) {
    const e = elements[k];
    switch (e.type) {
      case 'note':
      case 'section':
      case 'synopsis':
        k++;
        break;
      case 'page_break':
        blocks.push({ kind: 'page_break', before: 0, lines: [] });
        k++;
        break;
      case 'scene_heading': {
        const lines = wrapped(upper(e.text), COL.scene_heading.x, COL.scene_heading.w);
        if (e.number && lines.length) {
          lines[0].number = e.number;
        }
        blocks.push({ kind: 'scene_heading', before: 2, lines, keep: 2 });
        k++;
        break;
      }
      case 'transition': {
        const t = upper(e.text);
        const chars = toChars(t);
        const w = Math.min(chars.length, COL.action.w);
        const lines = wrapChars(chars, COL.action.w).map((cs) =>
          lineAt(RIGHT - Math.min(cs.length, w) * CW, cs)
        );
        blocks.push({ kind: 'transition', before: 1, lines });
        k++;
        break;
      }
      case 'centered': {
        const mid = (COL.action.x + RIGHT) / 2;
        const lines = wrapChars(toChars(e.text), COL.action.w).map((cs) =>
          lineAt(mid - (cs.length * CW) / 2, cs)
        );
        blocks.push({ kind: 'centered', before: 1, lines });
        k++;
        break;
      }
      case 'character': {
        if (e.dualFirst) {
          const left = takeGroup();
          if (k < elements.length && elements[k].type === 'character' && elements[k].dual) {
            const right = takeGroup();
            const a = dialogueLines(left, { ...DUAL[0], cw: 22 });
            const b = dialogueLines(right, { ...DUAL[1], cw: 22 });
            const n = Math.max(a.lines.length, b.lines.length);
            const lines = [];
            for (let r = 0; r < n; r++) {
              const la = a.lines[r];
              const lb = b.lines[r];
              lines.push({ pair: [la, lb].filter(Boolean), runs: [] });
            }
            blocks.push({ kind: 'dual', before: 1, lines });
          } else {
            const d = dialogueLines(left, SINGLE_COL);
            blocks.push({ kind: 'dialogue', before: 1, lines: d.lines, name: d.name });
          }
          break;
        }
        const d = dialogueLines(takeGroup(), SINGLE_COL);
        blocks.push({ kind: 'dialogue', before: 1, lines: d.lines, name: d.name });
        break;
      }
      case 'dialogue':
      case 'parenthetical': {
        // diálogo sin personaje delante (no debería pasar): como diálogo suelto
        const col = COL[e.type];
        blocks.push({ kind: 'action', before: 1, lines: wrapped(e.text, col.x, col.w) });
        k++;
        break;
      }
      case 'lyrics': {
        blocks.push({
          kind: 'lyrics',
          before: 1,
          lines: wrapped(e.text, COL.lyrics.x, COL.lyrics.w, { i: true }),
        });
        k++;
        break;
      }
      default: {
        // acción
        blocks.push({
          kind: 'action',
          before: 1,
          lines: wrapped(e.text, COL.action.x, COL.action.w),
        });
        k++;
      }
    }
  }
  return blocks;
};

// --- Paginación ---
export const paginate = (blocks, perPage = LINES_PER_PAGE) => {
  const pages = [[]];
  const cur = () => pages[pages.length - 1];
  const newPage = () => pages.push([]);
  const room = () => perPage - cur().length;
  const blank = () => cur().push({ runs: [] });

  blocks.forEach((b, idx) => {
    if (b.kind === 'page_break') {
      if (cur().length) newPage();
      return;
    }
    const gap = cur().length ? b.before : 0;
    const need = gap + b.lines.length;
    const next = blocks[idx + 1];
    const keep =
      b.keep && next && next.lines.length ? next.before + Math.min(2, next.lines.length) : 0;

    if (need + keep <= room()) {
      for (let g = 0; g < gap; g++) blank();
      b.lines.forEach((l) => cur().push(l));
      return;
    }
    // No cabe entero
    const avail = room() - gap;
    if (b.kind === 'dialogue' && avail >= 4 && b.lines.length - (avail - 1) >= 1) {
      // Partir el diálogo: (MÁS) abajo y «NOMBRE (CONT.)» arriba en la página siguiente
      let take = avail - 1;
      // no dejar el personaje solo ni empezar la página con una sola línea suelta
      if (b.lines.length - take < 1) take = b.lines.length - 1;
      // no cortar justo detrás de un paréntesis (acotación)
      while (take > 2 && b.lines[take - 1].role === 'parenthetical') take--;
      if (take >= 2) {
        for (let g = 0; g < gap; g++) blank();
        b.lines.slice(0, take).forEach((l) => cur().push(l));
        cur().push(lineAt(SINGLE_COL.character, toChars(MORE)));
        newPage();
        cur().push(lineAt(SINGLE_COL.character, toChars(upper(b.name) + ' ' + CONTD)));
        b.lines.slice(take).forEach((l) => cur().push(l));
        return;
      }
    }
    if ((b.kind === 'action' || b.kind === 'lyrics') && avail >= 2 && b.lines.length - avail >= 2) {
      // Partir un párrafo largo de acción (al menos 2 líneas a cada lado)
      for (let g = 0; g < gap; g++) blank();
      b.lines.slice(0, avail).forEach((l) => cur().push(l));
      let rest = b.lines.slice(avail);
      while (rest.length) {
        newPage();
        rest.slice(0, perPage).forEach((l) => cur().push(l));
        rest = rest.slice(perPage);
      }
      return;
    }
    if (cur().length) newPage();
    // Bloques más largos que una página entera: se cortan a lo bruto
    let rest = b.lines;
    while (rest.length) {
      if (room() <= 0) newPage();
      const n = room();
      rest.slice(0, n).forEach((l) => cur().push(l));
      rest = rest.slice(n);
    }
  });
  // Quitar líneas en blanco al final de cada página y páginas vacías
  const clean = pages.map((p) => {
    const q = p.slice();
    while (q.length && !q[q.length - 1].runs.length && !q[q.length - 1].pair) q.pop();
    return q;
  });
  return clean.filter((p, i) => p.length || (i === 0 && clean.length === 1));
};

// --- Portada ---
const TITLE_ALIASES = {
  title: 'title',
  título: 'title',
  titulo: 'title',
  credit: 'credit',
  crédito: 'credit',
  credito: 'credit',
  author: 'author',
  authors: 'author',
  autor: 'author',
  autora: 'author',
  autores: 'author',
  source: 'source',
  fuente: 'source',
  'basado en': 'source',
  'draft date': 'draft date',
  date: 'draft date',
  fecha: 'draft date',
  contact: 'contact',
  contacto: 'contact',
  copyright: 'copyright',
  notes: 'notes',
  notas: 'notes',
};

export const titleFields = (title) => {
  const f = {};
  (title || []).forEach((t) => {
    const key =
      TITLE_ALIASES[
        String(t.key || '')
          .trim()
          .toLowerCase()
      ];
    if (key && t.values.some((v) => v.trim())) f[key] = (f[key] || []).concat(t.values);
  });
  return f;
};

const titlePage = (title) => {
  const f = titleFields(title);
  if (!f.title) return null;
  const mid = (COL.action.x + RIGHT) / 2;
  const centered = (text, extra) =>
    wrapChars(toChars(text, extra), COL.action.w).map((cs) =>
      lineAt(mid - (cs.length * CW) / 2, cs)
    );
  const lines = [];
  const at = (row, ls) => ls.forEach((l, n) => (lines[row + n] = l));
  let row = 18;
  const block = (vals, extra) => {
    vals.forEach((v) => {
      const ls = centered(v, extra);
      at(row, ls);
      row += ls.length;
    });
    row += 1;
  };
  block(f.title.map(upper));
  if (f.credit) block(f.credit);
  if (f.author) block(f.author);
  if (f.source) block(f.source);
  // Abajo a la izquierda: contacto, fecha, copyright, notas
  const bottom = []
    .concat(f.contact || [], f['draft date'] || [], f.copyright || [], f.notes || [])
    .reduce((acc, v) => acc.concat(wrapped(v, COL.action.x, 40)), []);
  at(Math.max(row + 1, LINES_PER_PAGE - bottom.length), bottom);
  const out = [];
  for (let r = 0; r < lines.length; r++) out.push(lines[r] || { runs: [] });
  return out;
};

// --- Codificación (WinAnsi) ---
const WIN_ANSI_EXTRA = {
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};
const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16).toUpperCase();
export const winAnsiHex = (s) =>
  Array.from(String(s))
    .map((ch) => {
      const c = ch.codePointAt(0);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) return hex2(c);
      if (WIN_ANSI_EXTRA[ch]) return hex2(WIN_ANSI_EXTRA[ch]);
      return hex2(0x3f); // «?»
    })
    .join('');

const utf16Hex = (s) => {
  let out = 'FEFF';
  for (let k = 0; k < s.length; k++) out += ('000' + s.charCodeAt(k).toString(16)).slice(-4);
  return out.toUpperCase();
};

const num = (n) => (Math.round(n * 100) / 100).toString();
const fontOf = (r) => (r.b && r.i ? 'F4' : r.b ? 'F2' : r.i ? 'F3' : 'F1');

const drawRuns = (x, y, runs) => {
  let ops = '';
  let cx = x;
  runs.forEach((r) => {
    if (r.text) {
      ops += `BT /${fontOf(r)} 12 Tf ${num(cx)} ${num(y)} Td <${winAnsiHex(r.text)}> Tj ET\n`;
      if (r.u) {
        const w = r.text.length * CW;
        ops += `0.6 w ${num(cx)} ${num(y - 1.6)} m ${num(cx + w)} ${num(y - 1.6)} l S\n`;
      }
    }
    cx += r.text.length * CW;
  });
  return ops;
};

const baseline = (row) => PAGE_H - TOP - 9 - row * LH;

const pageContent = (lines, pageNo) => {
  let ops = '';
  if (pageNo) {
    const label = `${pageNo}.`;
    ops += drawRuns(RIGHT - label.length * CW, PAGE_H - 0.5 * IN - 9, [
      { text: label, ...plainStyle },
    ]);
  }
  lines.forEach((l, row) => {
    const y = baseline(row);
    if (l.pair) l.pair.forEach((p) => (ops += drawRuns(p.x, y, p.runs)));
    else if (l.runs.length) ops += drawRuns(l.x, y, l.runs);
    if (l.number) {
      const n = String(l.number);
      ops += drawRuns(COL.action.x - (n.length + 3) * CW, y, [{ text: n, ...plainStyle }]);
      ops += drawRuns(RIGHT + 3 * CW, y, [{ text: n, ...plainStyle }]);
    }
  });
  return ops;
};

// Páginas listas para dibujar: [{ lines, number }] (la portada no lleva número)
export const layoutFountain = (source) => {
  const parsed = typeof source === 'string' ? parseFountain(source) : source;
  const out = [];
  const cover = titlePage(parsed.title);
  if (cover) out.push({ lines: cover, number: null, cover: true });
  paginate(buildBlocks(parsed.elements)).forEach((lines, n) =>
    out.push({ lines, number: n === 0 ? null : n + 1 })
  );
  return out;
};

// Escribe el PDF y devuelve los bytes (Uint8Array)
export const fountainToPdf = (source, { title } = {}) => {
  const pages = layoutFountain(source);
  const objs = []; // texto de cada objeto (índice + 1 = número de objeto)
  const add = (body) => {
    objs.push(body);
    return objs.length;
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const fonts = ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'].map((name) =>
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)
  );
  const fontRes = fonts.map((id, n) => `/F${n + 1} ${id} 0 R`).join(' ');
  const kids = [];
  pages.forEach((p) => {
    const stream = pageContent(p.lines, p.number);
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
          `/Resources << /Font << ${fontRes} >> >> /Contents ${content} 0 R >>`
      )
    );
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${
    kids.length
  } >>`;
  const info = add(
    `<< /Title <${utf16Hex(String(title || 'Guion'))}> /Creator (ORGanice) /Producer (ORGanice) >>`
  );

  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objs.forEach((body, n) => {
    offsets.push(pdf.length);
    pdf += `${n + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, '0')} 00000 n \n`));
  pdf += `trailer\n<< /Size ${
    objs.length + 1
  } /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Todo es ASCII salvo la 2.ª línea (4 bytes ≥ 128 para marcar el fichero como binario)
  const bytes = new Uint8Array(pdf.length);
  for (let k = 0; k < pdf.length; k++) bytes[k] = pdf.charCodeAt(k) & 0xff;
  return bytes;
};
