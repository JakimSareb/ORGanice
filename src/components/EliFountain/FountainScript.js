// ORG Mode para Eli (3.13): pinta un guion Fountain con el formato estándar de guion.
import React from 'react';

import { inlineSpans } from '../../lib/eli_fountain';

export const Inline = ({ text }) =>
  inlineSpans(text).map((s, k) => {
    if (s.note) {
      return (
        <span key={k} className="eli-ftn__inline-note">
          {s.text}
        </span>
      );
    }
    const cls = [s.b && 'is-b', s.i && 'is-i', s.u && 'is-u'].filter(Boolean).join(' ');
    return cls ? (
      <span key={k} className={cls}>
        {s.text}
      </span>
    ) : (
      <React.Fragment key={k}>{s.text}</React.Fragment>
    );
  });

const Lines = ({ text }) =>
  String(text || '')
    .split('\n')
    .map((l, k, all) => (
      <React.Fragment key={k}>
        <Inline text={l} />
        {k < all.length - 1 && <br />}
      </React.Fragment>
    ));

const TITLE_ORDER = ['title', 'credit', 'author', 'authors', 'source'];

const TitlePage = ({ entries, onPick }) => {
  const get = (key) => entries.filter((e) => e.key.toLowerCase() === key);
  const center = TITLE_ORDER.flatMap(get);
  const rest = entries.filter((e) => !TITLE_ORDER.includes(e.key.toLowerCase()));
  return (
    <div className="eli-ftn__title-page" onClick={() => onPick && onPick(0)}>
      <div className="eli-ftn__title-center">
        {center.map((e, k) => (
          <div
            key={k}
            className={'eli-ftn__tp eli-ftn__tp--' + e.key.toLowerCase().replace(/\s+/g, '-')}
          >
            <Lines text={e.values.join('\n')} />
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="eli-ftn__title-rest">
          {rest.map((e, k) => (
            <div key={k} className="eli-ftn__tp">
              <Lines text={e.values.join('\n')} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Element = ({ el, onPick, showNotes }) => {
  const pick = onPick ? () => onPick(el.line) : undefined;
  const cls = `eli-ftn__el eli-ftn__${el.type}`;
  switch (el.type) {
    case 'scene_heading':
      return (
        <div className={cls} onClick={pick} data-line={el.line}>
          {el.number && <span className="eli-ftn__scene-num">{el.number}</span>}
          <Inline text={el.text} />
          {el.number && (
            <span className="eli-ftn__scene-num eli-ftn__scene-num--right">{el.number}</span>
          )}
        </div>
      );
    case 'page_break':
      return <hr className={cls} onClick={pick} data-line={el.line} />;
    case 'section':
      return showNotes ? (
        <div className={`${cls} eli-ftn__section--${el.depth}`} onClick={pick} data-line={el.line}>
          {'#'.repeat(el.depth)} {el.text}
        </div>
      ) : null;
    case 'synopsis':
    case 'note':
      return showNotes ? (
        <div className={cls} onClick={pick} data-line={el.line}>
          <Lines text={el.text} />
        </div>
      ) : null;
    default:
      return (
        <div className={cls} onClick={pick} data-line={el.line}>
          <Lines text={el.text} />
        </div>
      );
  }
};

// Agrupa personaje + su diálogo, para el diálogo doble (dos columnas)
const groupBlocks = (elements) => {
  const blocks = [];
  let k = 0;
  while (k < elements.length) {
    const el = elements[k];
    if (el.type === 'character') {
      const group = [el];
      k++;
      while (
        k < elements.length &&
        ['dialogue', 'parenthetical', 'lyrics'].includes(elements[k].type)
      ) {
        if (elements[k].type === 'lyrics' && elements[k].line !== group[group.length - 1].line + 1)
          break;
        group.push(elements[k]);
        k++;
      }
      blocks.push({ kind: 'dialogue', items: group, dualFirst: !!el.dualFirst, dual: !!el.dual });
    } else {
      blocks.push({ kind: 'single', items: [el] });
      k++;
    }
  }
  return blocks;
};

const FountainScript = ({ parsed, onPick, showNotes = true, compact = false }) => {
  const blocks = groupBlocks(parsed.elements);
  const out = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    const render = (bl, key) =>
      bl.kind === 'dialogue' ? (
        <div key={key} className="eli-ftn__dialogue-block">
          {bl.items.map((el) => (
            <Element key={el.line + el.type} el={el} onPick={onPick} showNotes={showNotes} />
          ))}
        </div>
      ) : (
        <Element key={key} el={bl.items[0]} onPick={onPick} showNotes={showNotes} />
      );
    if (b.kind === 'dialogue' && b.dualFirst && blocks[k + 1] && blocks[k + 1].dual) {
      out.push(
        <div key={'dual' + k} className="eli-ftn__dual">
          {render(b, 'a')}
          {render(blocks[k + 1], 'b')}
        </div>
      );
      k++;
    } else {
      out.push(render(b, 'b' + k));
    }
  }
  return (
    <div className={'eli-ftn__script' + (compact ? ' eli-ftn__script--compact' : '')}>
      {parsed.title && parsed.title.length > 0 && (
        <TitlePage entries={parsed.title} onPick={onPick} />
      )}
      {out}
    </div>
  );
};

export default FountainScript;
