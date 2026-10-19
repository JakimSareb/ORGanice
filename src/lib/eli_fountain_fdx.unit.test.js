import { fountainToFdx, escapeXml, textRuns } from './eli_fountain_fdx';

const SAMPLE = `Title: _El faro_
Credit: Escrito por
Author: Ana Pérez
Contact: ana@ejemplo.com

INT. FARO - NOCHE #1#

Las olas golpean la roca.
Una luz gira.

[[nota que no se exporta]]

# Acto uno

= Sinopsis que no se exporta

LUIS (V.O.)
(en voz baja)
¿Hay **alguien** & nadie?

ANA
Sí.

LUIS ^
No.

>FIN<

===

CORTE A:

EXT. PLAYA - DÍA
`;

describe('eli_fountain_fdx', () => {
  const xml = fountainToFdx(SAMPLE);

  test('cabecera y estructura de Final Draft', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(true);
    expect(xml).toContain('<FinalDraft DocumentType="Script" Template="No" Version="5">');
    expect(xml.trim().endsWith('</FinalDraft>')).toBe(true);
  });

  test('tipos de párrafo', () => {
    expect(xml).toContain(
      '<Paragraph Type="Scene Heading" Number="1"><Text>INT. FARO - NOCHE</Text></Paragraph>'
    );
    expect(xml).toContain('<Text>Las olas golpean la roca.\nUna luz gira.</Text>');
    expect(xml).toContain('<Paragraph Type="Character"><Text>LUIS (V.O.)</Text></Paragraph>');
    expect(xml).toContain('<Paragraph Type="Parenthetical"><Text>(en voz baja)</Text>');
    expect(xml).toContain(
      '<Text>¿Hay </Text><Text Style="Bold">alguien</Text><Text> &amp; nadie?</Text>'
    );
    expect(xml).toContain('<Paragraph Type="Action" Alignment="Center"><Text>FIN</Text>');
  });

  test('notas, secciones y sinopsis no se exportan', () => {
    expect(xml).not.toContain('nota que no');
    expect(xml).not.toContain('Acto uno');
    expect(xml).not.toContain('Sinopsis');
  });

  test('diálogo doble y salto de página', () => {
    expect(xml).toMatch(
      /<DualDialogue>[\s\S]*ANA[\s\S]*Sí\.[\s\S]*LUIS[\s\S]*No\.[\s\S]*<\/DualDialogue>/
    );
    expect(xml).toContain(
      '<Paragraph Type="Transition" StartsNewPage="Yes"><Text>CORTE A:</Text></Paragraph>'
    );
  });

  test('portada', () => {
    expect(xml).toContain('<TitlePage>');
    expect(xml).toContain('<Text Style="Underline">EL FARO</Text>');
    expect(xml).toContain('<Text>Ana Pérez</Text>');
    expect(xml).toContain('<Paragraph Alignment="Left" Type="Text"><Text>ana@ejemplo.com</Text>');
    expect(fountainToFdx('INT. CASA - DÍA\n\nHola.')).not.toContain('<TitlePage>');
  });

  test('escapa XML y quita controles', () => {
    expect(escapeXml('a<b>"c"&\u0001')).toBe('a&lt;b&gt;&quot;c&quot;&amp;');
    expect(textRuns('')).toBe('<Text></Text>');
  });

  test('guion vacío', () => {
    expect(fountainToFdx('')).toContain('<Content>');
  });
});
