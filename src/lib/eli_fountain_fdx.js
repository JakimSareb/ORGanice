// ORG Mode para Eli (3.15): exportar un guion Fountain a Final Draft (.fdx).
// Se parte de los elementos de parseFountain; como en el PDF, las notas, las
// secciones y las sinopsis no se exportan. El énfasis (*, **, _) pasa a Style.

import { parseFountain, inlineSpans } from './eli_fountain';
import { titleFields } from './eli_fountain_pdf';

// Caracteres que XML 1.0 no admite (controles salvo tab y salto de línea)
// eslint-disable-next-line no-control-regex
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const escapeXml = (s) =>
  String(s || '')
    .normalize('NFC')
    .replace(BAD_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attrs = (obj) =>
  Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .map((k) => ` ${k}="${escapeXml(obj[k])}"`)
    .join('');

// Texto con énfasis → <Text Style="Bold+Italic+Underline">…</Text>
export const textRuns = (text, { upper = false } = {}) => {
  const runs = inlineSpans(text)
    .filter((s) => !s.note && s.text)
    .map((s) => {
      const style = [s.b && 'Bold', s.i && 'Italic', s.u && 'Underline'].filter(Boolean).join('+');
      const t = upper ? s.text.toUpperCase() : s.text;
      return `<Text${attrs({ Style: style })}>${escapeXml(t)}</Text>`;
    });
  return runs.length ? runs.join('') : '<Text></Text>';
};

const para = (type, text, extra = {}, opts) =>
  `    <Paragraph${attrs({ Type: type, ...extra })}>${textRuns(text, opts)}</Paragraph>`;

// Tipo de párrafo de Final Draft para cada elemento (null = no se exporta)
const PARA_TYPE = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  lyrics: 'Dialogue',
  transition: 'Transition',
  centered: 'Action',
};

const DIALOGUE_PART = ['dialogue', 'parenthetical', 'lyrics'];

const elementPara = (el, newPage) => {
  const type = PARA_TYPE[el.type];
  if (!type) return null;
  const extra = {};
  if (el.type === 'scene_heading' && el.number) extra.Number = el.number;
  if (el.type === 'centered') extra.Alignment = 'Center';
  if (newPage) extra.StartsNewPage = 'Yes';
  // Letras de canción: diálogo en cursiva (Final Draft no tiene un tipo propio)
  const text = el.type === 'lyrics' ? `*${el.text.replace(/\*/g, '\\*')}*` : el.text;
  return para(type, text, extra);
};

const contentXml = (elements) => {
  const out = [];
  let newPage = false;
  const emit = (el) => {
    const p = elementPara(el, newPage);
    if (p) {
      out.push(p);
      newPage = false;
    }
  };
  for (let k = 0; k < elements.length; k++) {
    const el = elements[k];
    if (el.type === 'page_break') {
      newPage = out.length > 0;
      continue;
    }
    if (el.type === 'character' && el.dualFirst) {
      // Diálogo doble: los dos bloques van dentro de <DualDialogue>
      const group = [el];
      let j = k + 1;
      while (j < elements.length && DIALOGUE_PART.includes(elements[j].type))
        group.push(elements[j++]);
      if (j < elements.length && elements[j].type === 'character' && elements[j].dual) {
        group.push(elements[j++]);
        while (j < elements.length && DIALOGUE_PART.includes(elements[j].type))
          group.push(elements[j++]);
        const inner = group.map((g) => '  ' + elementPara(g, false)).join('\n');
        out.push(
          `    <Paragraph${attrs({ StartsNewPage: newPage ? 'Yes' : '' })}>\n` +
            `      <DualDialogue>\n${inner}\n      </DualDialogue>\n    </Paragraph>`
        );
        newPage = false;
        k = j - 1;
        continue;
      }
    }
    emit(el);
  }
  return out.join('\n');
};

// Portada: título, crédito, autor y fuente centrados; contacto, fecha, etc. abajo a la izquierda
const titlePageXml = (title) => {
  const f = titleFields(title);
  if (!Object.keys(f).length) return '';
  const lines = [];
  const blank = () => lines.push('      <Paragraph Type="Text"><Text></Text></Paragraph>');
  const centered = (vals, opts) =>
    vals.forEach((v) =>
      lines.push(`      <Paragraph Alignment="Center" Type="Text">${textRuns(v, opts)}</Paragraph>`)
    );
  for (let n = 0; n < 16; n++) blank();
  if (f.title) centered(f.title, { upper: true });
  ['credit', 'author', 'source'].forEach((key) => {
    if (!f[key]) return;
    blank();
    centered(f[key]);
  });
  const bottom = [].concat(
    f.contact || [],
    f['draft date'] || [],
    f.copyright || [],
    f.notes || []
  );
  if (bottom.length) {
    for (let n = 0; n < 16; n++) blank();
    bottom.forEach((v) =>
      lines.push(`      <Paragraph Alignment="Left" Type="Text">${textRuns(v)}</Paragraph>`)
    );
  }
  return `  <TitlePage>\n    <Content>\n${lines.join('\n')}\n    </Content>\n  </TitlePage>\n`;
};

// Devuelve el XML del .fdx (texto UTF-8)
export const fountainToFdx = (source) => {
  const parsed = typeof source === 'string' ? parseFountain(source) : source;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
    '<FinalDraft DocumentType="Script" Template="No" Version="5">\n' +
    '  <Content>\n' +
    contentXml(parsed.elements || []) +
    '\n  </Content>\n' +
    titlePageXml(parsed.title) +
    '</FinalDraft>\n'
  );
};
