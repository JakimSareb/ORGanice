// ORG Mode para Eli: resolver conflictos de sincronización. Dice qué fichero, deja elegir la
// versión (la mía o la de Dropbox/carpeta) o ver las diferencias y elegir cambio a cambio.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import format from 'date-fns/format';

import './stylesheet.css';

import { subscribeConflicts, removeConflict } from '../../lib/eli_conflicts';
import { diffBlocks, changeCount, mergeBlocks } from '../../lib/eli_diff';
import { parseFile, setDirty, sync } from '../../actions/org';
import { fileDisplayName } from '../../lib/eli_app_name';

const CONTEXT = 2;

const selectClientType = (s) => {
  const c = s.syncBackend.get('client');
  return c ? c.type : null;
};

const when = (d) => {
  try {
    return d ? format(d, "d/MM/yyyy 'a las' HH:mm") : '—';
  } catch (e) {
    return '—';
  }
};

const Lines = ({ lines, className }) => (
  <pre className={'eli-conflict__lines ' + (className || '')}>
    {lines.length ? lines.join('\n') : <span className="eli-conflict__empty">(nada)</span>}
  </pre>
);

function DiffView({ blocks, choices, setChoice, theirsLabel }) {
  let k = -1;
  return (
    <div className="eli-conflict__diff" data-testid="eli-conflict-diff">
      {blocks.map((block, i) => {
        if (block.type === 'same') {
          const first = i === 0;
          const last = i === blocks.length - 1;
          const lines = block.lines;
          const head = first ? [] : lines.slice(0, CONTEXT);
          const tail = last ? [] : lines.slice(Math.max(head.length, lines.length - CONTEXT));
          const hidden = lines.length - head.length - tail.length;
          return (
            <div key={i} className="eli-conflict__same">
              {head.length > 0 && <Lines lines={head} />}
              {hidden > 0 && (
                <div className="eli-conflict__gap">
                  ⋯ {hidden} {hidden === 1 ? 'línea igual' : 'líneas iguales'} ⋯
                </div>
              )}
              {tail.length > 0 && <Lines lines={tail} />}
            </div>
          );
        }
        k += 1;
        const idx = k;
        const choice = choices[idx] || 'mine';
        return (
          <div key={i} className="eli-conflict__change" data-testid="eli-conflict-change">
            <div className="eli-conflict__choice">
              <span>Cambio {idx + 1}:</span>
              {[
                ['mine', 'La mía'],
                ['theirs', theirsLabel],
                ['both', 'Las dos'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={'eli-conflict__opt' + (choice === id ? ' is-on' : '')}
                  onClick={() => setChoice(idx, id)}
                  data-testid={`eli-conflict-opt-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="eli-conflict__sides">
              <div className={'eli-conflict__side' + (choice !== 'theirs' ? ' is-kept' : '')}>
                <div className="eli-conflict__side-title">La mía</div>
                <Lines lines={block.mine} className="is-mine" />
              </div>
              <div className={'eli-conflict__side' + (choice !== 'mine' ? ' is-kept' : '')}>
                <div className="eli-conflict__side-title">{theirsLabel}</div>
                <Lines lines={block.theirs} className="is-theirs" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EliConflicts() {
  const dispatch = useDispatch();
  const clientType = useSelector(selectClientType);
  const [conflicts, setConflicts] = useState([]);
  const [showDiff, setShowDiff] = useState(false);
  const [choices, setChoices] = useState([]);

  useEffect(() => subscribeConflicts(setConflicts), []);

  const conflict = conflicts[0] || null;
  const blocks = useMemo(() => (conflict ? diffBlocks(conflict.mine, conflict.theirs) : []), [
    conflict,
  ]);
  const count = changeCount(blocks);

  // Nuevo conflicto (u otro fichero): empezar desde el resumen
  useEffect(() => {
    setShowDiff(false);
    setChoices([]);
  }, [conflict]);

  if (!conflict) return null;

  const where = clientType === 'LocalFolder' ? 'la carpeta' : 'Dropbox';
  const theirsLabel = clientType === 'LocalFolder' ? 'La de la carpeta' : 'La de Dropbox';
  const { path } = conflict;

  const keepMine = () => {
    removeConflict(path);
    dispatch(setDirty(true, path));
    dispatch(sync({ path, forceAction: 'push' }));
  };
  const keepTheirs = () => {
    removeConflict(path);
    dispatch(sync({ path, forceAction: 'pull' }));
  };
  const keepMerged = () => {
    const merged = mergeBlocks(blocks, choices);
    removeConflict(path);
    dispatch(parseFile(path, merged));
    dispatch(setDirty(true, path));
    dispatch(sync({ path, forceAction: 'push' }));
  };
  const later = () => removeConflict(path);
  const setChoice = (i, v) =>
    setChoices((c) => {
      const next = [...c];
      next[i] = v;
      return next;
    });
  const setAll = (v) => setChoices(Array.from({ length: count }, () => v));

  return (
    <div className="eli-prompt__overlay" data-testid="eli-conflict">
      <div
        className={'eli-prompt__box eli-conflict' + (showDiff ? ' eli-conflict--diff' : '')}
        role="dialog"
      >
        <div className="eli-prompt__title">
          <i className="fas fa-exclamation-triangle eli-conflict__icon" /> Conflicto en «
          {fileDisplayName(path)}»
          {conflicts.length > 1 && (
            <span className="eli-conflict__more"> (1 de {conflicts.length})</span>
          )}
        </div>

        {!showDiff && (
          <>
            <div className="eli-prompt__message">
              <code className="eli-conflict__path">{path}</code>
              <p>
                Este fichero ha cambiado en {where} ({when(conflict.lastServerModifiedAt)}) y
                también aquí sin sincronizar (tu última sincronización: {when(conflict.lastSyncAt)}
                ).
              </p>
              <p>
                {count === 1 ? 'Hay 1 diferencia.' : `Hay ${count} diferencias.`} ¿Con cuál te
                quedas?
              </p>
            </div>
            <div className="eli-conflict__actions">
              <button
                className="btn eli-conflict__btn"
                onClick={() => setShowDiff(true)}
                data-testid="eli-conflict-show-diff"
              >
                <i className="fas fa-columns" /> Ver diferencias y elegir
              </button>
              <button
                className="btn eli-conflict__btn"
                onClick={keepMine}
                data-testid="eli-conflict-mine"
              >
                Quedarme con la mía
              </button>
              <button
                className="btn eli-conflict__btn"
                onClick={keepTheirs}
                data-testid="eli-conflict-theirs"
              >
                {clientType === 'LocalFolder'
                  ? 'Quedarme con la de la carpeta'
                  : 'Quedarme con la de Dropbox'}
              </button>
              <button
                className="btn eli-conflict__btn eli-conflict__btn--quiet"
                onClick={later}
                data-testid="eli-conflict-later"
              >
                Decidir más tarde
              </button>
            </div>
          </>
        )}

        {showDiff && (
          <>
            <div className="eli-conflict__toolbar">
              <span>Elige en cada cambio. Marcado: lo que se guardará.</span>
              <span className="eli-conflict__all">
                Todo:
                <button type="button" className="eli-conflict__opt" onClick={() => setAll('mine')}>
                  La mía
                </button>
                <button
                  type="button"
                  className="eli-conflict__opt"
                  onClick={() => setAll('theirs')}
                >
                  {theirsLabel}
                </button>
              </span>
            </div>
            <DiffView
              blocks={blocks}
              choices={choices}
              setChoice={setChoice}
              theirsLabel={theirsLabel}
            />
            <div className="eli-prompt__buttons">
              <button className="btn eli-prompt__cancel" onClick={() => setShowDiff(false)}>
                Volver
              </button>
              <button
                className="btn eli-prompt__ok"
                onClick={keepMerged}
                data-testid="eli-conflict-save-merge"
              >
                Guardar esta combinación
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
