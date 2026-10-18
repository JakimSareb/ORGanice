import {
  parseFountain,
  inlineSpans,
  fountainStats,
  isFountainPath,
  characterName,
} from './eli_fountain';

const types = (src) => parseFountain(src).elements.map((e) => e.type);

test('reconoce los ficheros Fountain', () => {
  expect(isFountainPath('/guiones/corto.fountain')).toBe(true);
  expect(isFountainPath('/a.org')).toBe(false);
});

test('portada', () => {
  const { title, elements } = parseFountain(
    'Title: Mi corto\nCredit: escrito por\nAuthor: Eli\nContact:\n    Calle 1\n    Madrid\n\nINT. CASA - DÍA\n\nAcción.\n'
  );
  expect(title.map((t) => t.key)).toEqual(['Title', 'Credit', 'Author', 'Contact']);
  expect(title[3].values).toEqual(['Calle 1', 'Madrid']);
  expect(elements[0]).toMatchObject({ type: 'scene_heading', text: 'INT. CASA - DÍA', line: 7 });
});

test('escena, personaje, acotación, diálogo y transición', () => {
  const src = `INT. COCINA - NOCHE #12#

Ana entra.

ANA (V.O.)
(en voz baja)
¿Hay alguien?

CORTE A:

.FLASHBACK

> FUNDIDO A NEGRO.
`;
  const { elements } = parseFountain(src);
  expect(elements.map((e) => e.type)).toEqual([
    'scene_heading',
    'action',
    'character',
    'parenthetical',
    'dialogue',
    'transition',
    'scene_heading',
    'transition',
  ]);
  expect(elements[0].number).toBe('12');
  expect(elements[0].text).toBe('INT. COCINA - NOCHE');
  expect(characterName(elements[2].text)).toBe('ANA');
  expect(elements[6].text).toBe('FLASHBACK');
});

test('forzados, centrado, notas, secciones y saltos', () => {
  expect(types('@McCLANE\nHola.\n')).toEqual(['character', 'dialogue']);
  expect(types('!SANTA CLAUS\nNo es un personaje.\n')).toEqual(['action']);
  expect(types('>EL FIN<\n')).toEqual(['centered']);
  expect(types('[[una nota]]\n\n# Acto 1\n\n= Sinopsis\n\n===\n')).toEqual([
    'note',
    'section',
    'synopsis',
    'page_break',
  ]);
  expect(types('/* oculto\n\nEXT. NADA - DÍA\n*/\nTexto.\n')).toEqual(['action']);
});

test('diálogo doble', () => {
  const { elements } = parseFountain('ANA\nSí.\n\nLUIS ^\nNo.\n');
  expect(elements[0].dualFirst).toBe(true);
  expect(elements[2]).toMatchObject({ type: 'character', text: 'LUIS', dual: true });
});

test('énfasis en línea', () => {
  expect(inlineSpans('Un *gran* día **muy** _largo_')).toEqual([
    { text: 'Un ', b: false, i: false, u: false },
    { text: 'gran', b: false, i: true, u: false },
    { text: ' día ', b: false, i: false, u: false },
    { text: 'muy', b: true, i: false, u: false },
    { text: ' ', b: false, i: false, u: false },
    { text: 'largo', b: false, i: false, u: true },
  ]);
  expect(inlineSpans('2 \\* 3 * 4')).toEqual([{ text: '2 * 3 * 4', b: false, i: false, u: false }]);
});

test('estadísticas', () => {
  const { elements } = parseFountain(
    'INT. A - DÍA\n\nANA\nHola.\n\nEXT. B - NOCHE\n\nANA\nAdiós.\n'
  );
  const s = fountainStats(elements);
  expect(s.scenes).toHaveLength(2);
  expect(s.characters).toEqual(['ANA']);
  expect(s.pages).toBe(1);
});
