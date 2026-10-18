// ORG Mode para Eli (3.13): manual de referencia de Fountain dentro de la app.
// Cada apartado enseña lo que se escribe y cómo queda en el guion.
import React from 'react';

import FountainScript from './FountainScript';
import { parseFountain } from '../../lib/eli_fountain';

export const MANUAL = [
  {
    title: 'Lo básico',
    text:
      'Un guion Fountain es texto normal. Cada elemento va separado del siguiente por una línea en blanco; la app reconoce solo qué es cada cosa y le da el formato de guion. No hace falta tocar márgenes ni tipos de letra.',
  },
  {
    title: 'Portada',
    text:
      'Al principio del fichero, líneas «Clave: valor». Termina en la primera línea en blanco. Claves habituales: Title, Credit, Author, Source, Draft date, Contact. Para varias líneas, sangra las de debajo.',
    example:
      'Title: El último tren\nCredit: escrito por\nAuthor: Eli\nDraft date: 18/10/2026\nContact:\n    eli@ejemplo.com',
  },
  {
    title: 'Encabezado de escena',
    text:
      'Una línea que empieza por INT. , EXT. , INT./EXT. o I/E , con una línea en blanco antes y después. Para cualquier otro encabezado, empieza la línea con un punto. Un número de escena va al final entre almohadillas.',
    example: 'INT. ESTACIÓN - NOCHE #1#\n\n.EN EL SUEÑO DE ANA',
  },
  {
    title: 'Acción',
    text:
      'Cualquier párrafo que no sea otra cosa. Las líneas seguidas forman un solo párrafo (se respetan los saltos). Si un párrafo en MAYÚSCULAS se confunde con un personaje, empiézalo con «!».',
    example: 'El andén está vacío. Un reloj marca las doce.\n\n!PUM. Se apagan las luces.',
  },
  {
    title: 'Personaje y diálogo',
    text:
      "El nombre en MAYÚSCULAS, en su propia línea, con una línea en blanco antes y el diálogo justo debajo (sin línea en blanco). Extensiones entre paréntesis: (V.O.) voz en off, (O.S.) fuera de campo, (CONT'D). Si el nombre lleva minúsculas, empiézalo con «@».",
    example: 'ANA (V.O.)\nNunca pensé que volvería.\n\n@McGREGOR\nPues aquí estás.',
  },
  {
    title: 'Acotación (paréntesis)',
    text: 'Una línea entre paréntesis dentro del diálogo, debajo del personaje o entre frases.',
    example: 'LUIS\n(en voz baja)\n¿Lo has oído?\n(mira atrás)\nYa viene.',
  },
  {
    title: 'Diálogo doble',
    text:
      'Dos personajes que hablan a la vez: pon «^» detrás del nombre del segundo y salen en dos columnas.',
    example: 'ANA\n¡Corre!\n\nLUIS ^\n¡No puedo!',
  },
  {
    title: 'Transición',
    text:
      'Una línea en MAYÚSCULAS que acaba en «A:» o «TO:» (CORTE A:, CUT TO:), con línea en blanco antes y después. Cualquier otra transición: empiézala con «>».',
    example: 'CORTE A:\n\n> FUNDIDO A NEGRO.',
  },
  {
    title: 'Texto centrado',
    text: 'Entre «>» y «<».',
    example: '>FIN<',
  },
  {
    title: 'Letras de canciones',
    text: 'Cada línea empieza con «~».',
    example: '~Canta el tren al pasar\n~por la vía del mar',
  },
  {
    title: 'Énfasis',
    text:
      '*cursiva*, **negrita**, ***negrita y cursiva*** y _subrayado_. Para escribir un asterisco o un guion bajo tal cual, pon «\\» delante.',
    example: 'Abre la puerta *muy* despacio. **Nadie.** Solo una _nota_.',
  },
  {
    title: 'Salto de página',
    text: 'Una línea con tres o más signos «=».',
    example: 'Acaba el primer acto.\n\n===\n\nEmpieza el segundo.',
  },
  {
    title: 'Notas, secciones y sinopsis (no se imprimen)',
    text:
      '[[nota]] para apuntes; «#», «##», «###» para actos y secuencias; una línea que empieza por «=» es una sinopsis. Se ven en la app (se pueden ocultar con el botón del ojo) pero no forman parte del guion.',
    example:
      '# Acto 1\n\n= Ana llega tarde y pierde el tren.\n\n[[Revisar el nombre de la estación]]',
  },
  {
    title: 'Texto oculto (boneyard)',
    text: 'Todo lo que esté entre /* y */ se ignora: útil para guardar escenas descartadas.',
    example: '/*\nINT. CAFÉ - DÍA\n\nEscena descartada.\n*/\nEsto sí se ve.',
  },
];

const FountainManual = () => (
  <div className="eli-ftn-manual" data-testid="eli-fountain-manual">
    <h2 className="eli-ftn-manual__h">Manual de Fountain</h2>
    <p className="eli-ftn-manual__intro">
      Fountain es un formato abierto para escribir guiones como texto normal (fountain.io). El
      fichero .fountain se puede abrir también con Highland, Slugline, Beat, Final Draft y otros.
    </p>
    {MANUAL.map((s) => (
      <section key={s.title} className="eli-ftn-manual__sec">
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        {s.example && (
          <div className="eli-ftn-manual__ex">
            <div className="eli-ftn-manual__src">
              <div className="eli-ftn-manual__lbl">Se escribe</div>
              <pre>{s.example}</pre>
            </div>
            <div className="eli-ftn-manual__out">
              <div className="eli-ftn-manual__lbl">Queda</div>
              <div className="eli-ftn__paper eli-ftn__paper--mini">
                <FountainScript parsed={parseFountain(s.example)} compact />
              </div>
            </div>
          </div>
        )}
      </section>
    ))}
  </div>
);

export default FountainManual;
