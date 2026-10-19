import {
  fountainToPdf,
  layoutFountain,
  wrapChars,
  winAnsiHex,
  titleFields,
  LINES_PER_PAGE,
  MORE,
  CONTD,
} from './eli_fountain_pdf';
import { parseFountain } from './eli_fountain';

const lineText = (l) =>
  l.pair
    ? l.pair.map((p) => p.runs.map((r) => r.text).join('')).join(' | ')
    : l.runs.map((r) => r.text).join('');
const pageTexts = (pages) => pages.map((p) => p.lines.map(lineText));

describe('eli_fountain_pdf', () => {
  test('ajusta por palabras', () => {
    const chars = 'uno dos tres cuatro'.split('').map((ch) => ({ ch }));
    const out = wrapChars(chars, 8).map((cs) => cs.map((c) => c.ch).join(''));
    expect(out).toEqual(['uno dos', 'tres', 'cuatro']);
  });

  test('codifica acentos en WinAnsi', () => {
    expect(winAnsiHex('ñÁ’')).toBe('F1C192');
    expect(winAnsiHex('😀')).toBe('3F');
  });

  test('portada, escena, personaje y diálogo', () => {
    const src = `Title: Mi guion
Credit: escrito por
Author: Eli
Draft date: 1-1-2026

INT. CASA - DÍA #3#

Ana entra.

ANA (V.O.)
(bajito)
Hola, *qué* tal.

CORTE A:
`;
    const pages = layoutFountain(src);
    expect(pages[0].cover).toBe(true);
    const cover = pages[0].lines.map(lineText);
    expect(cover).toContain('MI GUION');
    expect(cover).toContain('Eli');
    expect(cover[cover.length - 1]).toContain('1-1-2026');
    const body = pages[1].lines;
    expect(pages[1].number).toBe(null);
    expect(lineText(body[0])).toBe('INT. CASA - DÍA');
    expect(body[0].number).toBe('3');
    const texts = body.map(lineText);
    expect(texts).toContain('ANA (V.O.)');
    expect(texts).toContain('(bajito)');
    expect(texts).toContain('Hola, qué tal.');
    const hola = body.find((l) => lineText(l) === 'Hola, qué tal.');
    expect(hola.runs.find((r) => r.text === 'qué').i).toBe(true);
    const corte = body.find((l) => lineText(l) === 'CORTE A:');
    expect(corte.x + 'CORTE A:'.length * 7.2).toBeCloseTo(108 + 57 * 7.2);
  });

  test('notas, secciones y sinopsis no se imprimen', () => {
    const src = `# Acto 1

= Resumen

[[nota]]

Acción.`;
    expect(pageTexts(layoutFountain(src))).toEqual([['Acción.']]);
  });

  test('salto de página y números de página', () => {
    const pages = layoutFountain('Uno.\n\n===\n\nDos.');
    expect(pageTexts(pages)).toEqual([['Uno.'], ['Dos.']]);
    expect(pages[1].number).toBe(2);
  });

  test('diálogo largo se parte con (MÁS) y (CONT.)', () => {
    const relleno = Array.from({ length: 50 }, (_, i) => `Línea ${i}.`).join('\n\n');
    const dialogo = Array.from({ length: 20 }, (_, i) => `Frase ${i}.`).join('\n');
    const pages = pageTexts(layoutFountain(`${relleno}\n\nANA\n${dialogo}\n`));
    expect(pages.length).toBe(3);
    expect(pages[1].length).toBeLessThanOrEqual(LINES_PER_PAGE);
    expect(pages[1][pages[1].length - 1]).toBe(MORE);
    expect(pages[2][0]).toBe(`ANA ${CONTD}`);
  });

  test('diálogo doble en dos columnas', () => {
    const pages = layoutFountain('ANA\nHola.\n\nLUIS ^\nAdiós.\n');
    expect(pageTexts(pages)[0]).toEqual(['ANA | LUIS', 'Hola. | Adiós.']);
  });

  test('título en español en la portada', () => {
    expect(titleFields(parseFountain('Título: Hola\nAutor: Eli\n\nAcción.').title)).toEqual({
      title: ['Hola'],
      author: ['Eli'],
    });
  });

  test('genera un PDF válido', () => {
    const bytes = fountainToPdf('Title: Prueba\n\nINT. CASA - DÍA\n\nAna entra.\n', {
      title: 'Prueba',
    });
    const s = String.fromCharCode(...bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trim().endsWith('%%EOF')).toBe(true);
    expect((s.match(/\/Type \/Page /g) || []).length).toBe(2);
    // la tabla xref apunta a los objetos
    const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
    expect(s.slice(xref, xref + 4)).toBe('xref');
    const first = /xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(s)[1];
    expect(s.slice(Number(first), Number(first) + 7)).toBe('1 0 obj');
  });
});
