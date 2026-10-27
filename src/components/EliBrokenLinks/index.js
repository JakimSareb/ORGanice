// ORG Mode para Eli (4.41): pantalla «Enlaces rotos» (Menú › Herramientas). Lista agrupada por
// destino roto (nº de apariciones y dónde), con acciones por grupo y en lote (con confirmación):
// Reparar (sugerencias), Crear nota, Dejar solo el texto, Borrar e Ignorar.
import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useStore } from 'react-redux';

import './stylesheet.css';

import {
  loadForScan,
  computeBrokenLinks,
  unlinkGroups,
  repairGroup,
  createNoteForGroup,
  ignoreGroups,
  clearIgnored,
  ignoredCount,
} from '../../lib/eli_broken_links';
import { repairSuggestions, groupTitle } from '../../lib/eli_roam';
import { plainHeadingTitle, fileNameOf } from '../../lib/eli_heading_index';
import { askConfirm, askText } from '../../lib/eli_prompt';
import { selectHeaderAndOpenParents } from '../../actions/org';

const KIND_LABEL = {
  id: 'ID sin destino',
  file: 'Fichero que no existe',
  heading: 'Cabecera que no existe',
};

const whereLabel = (w) =>
  w === 'title' ? 'título' : w === 'notes' ? 'notas' : `propiedad ${w.replace(/^prop:/, '')}`;

const Group = ({ group, nodes, allPaths, checked, onCheck, onAction, onGo }) => {
  const [open, setOpen] = useState(false);
  const suggs = open ? repairSuggestions(group, { nodes, allPaths: allPaths || [] }) : [];
  return (
    <li className="eli-bl__group" data-testid="eli-broken-group">
      <div className="eli-bl__row">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label="Elegir"
          data-testid="eli-broken-check"
        />
        <button
          type="button"
          className="eli-bl__target"
          onClick={() => setOpen(!open)}
          data-testid="eli-broken-open"
        >
          {open ? '▾' : '▸'} <code>{group.label}</code>
          <small>
            {' '}
            · {KIND_LABEL[group.kind]} · {group.occurrences.length}{' '}
            {group.occurrences.length === 1 ? 'vez' : 'veces'}
          </small>
        </button>
      </div>
      {open && (
        <div className="eli-bl__body">
          <ul className="eli-bl__occ">
            {group.occurrences.map((o, i) => (
              <li key={i}>
                <button type="button" className="eli-bl__go" onClick={() => onGo(o)}>
                  {plainHeadingTitle(o.title) || '(sin título)'}
                </button>
                <small>
                  {' '}
                  · {fileNameOf(o.path)} · {whereLabel(o.where)}
                </small>
              </li>
            ))}
          </ul>
          {suggs.length > 0 && (
            <div className="eli-bl__suggs">
              <span className="eli-bl__label">Reparar con:</span>
              {suggs.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn eli-bl__sugg"
                  onClick={() => onAction('repair', s)}
                  data-testid="eli-broken-repair"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="eli-bl__actions">
            <button
              type="button"
              className="btn"
              onClick={() => onAction('note')}
              data-testid="eli-broken-note"
            >
              Crear nota
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onAction('text')}
              data-testid="eli-broken-text"
            >
              Dejar solo el texto
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onAction('remove')}
              data-testid="eli-broken-remove"
            >
              Borrar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onAction('ignore')}
              data-testid="eli-broken-ignore"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}
    </li>
  );
};

const BrokenLinks = ({ onClose }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const [loading, setLoading] = useState(true);
  const [allPaths, setAllPaths] = useState(null);
  const [result, setResult] = useState({ groups: [], nodes: [] });
  const [sel, setSel] = useState(() => new Set());
  const [ignored, setIgnored] = useState(ignoredCount());

  const rescan = useCallback(
    (paths) => {
      setResult(computeBrokenLinks(store.getState(), paths));
      setIgnored(ignoredCount());
      setSel(new Set());
    },
    [store]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { allPaths: paths } = await dispatch(loadForScan());
      if (!alive) return;
      setAllPaths(paths);
      rescan(paths);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [dispatch, rescan]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.eli-prompt__overlay')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const groups = result.groups;
  const total = groups.reduce((n, g) => n + g.occurrences.length, 0);

  const confirmMany = (list, verb) =>
    askConfirm({
      title: 'Enlaces rotos',
      message: `${verb} ${list.reduce((n, g) => n + g.occurrences.length, 0)} enlace(s) en ${
        list.length
      } grupo(s). Se cambian los ficheros.`,
      okLabel: 'Aceptar',
    });

  const run = async (list, action, sugg) => {
    if (action === 'ignore') {
      ignoreGroups(list);
    } else if (action === 'text') {
      if (list.length > 1 && !(await confirmMany(list, 'Dejar como texto'))) return;
      dispatch(unlinkGroups(list, 'text'));
    } else if (action === 'remove') {
      if (!(await confirmMany(list, 'Borrar'))) return;
      dispatch(unlinkGroups(list, 'remove'));
    } else if (action === 'repair') {
      await dispatch(repairGroup(list[0], sugg));
    } else if (action === 'note') {
      const title = await askText({
        title: 'Crear nota',
        message:
          list[0].kind === 'id'
            ? `Nota nueva (fichero en pages/) con el ID ${list[0].target.id}.`
            : 'Nota nueva (fichero en pages/); los enlaces pasarán a apuntarla por ID.',
        value: groupTitle(list[0]),
      });
      if (!title || !title.trim()) return;
      await dispatch(createNoteForGroup(list[0], title));
    }
    rescan(allPaths);
  };

  const chosen = groups.filter((g) => sel.has(g.key));
  const go = (o) => {
    window.dispatchEvent(new CustomEvent('eli:navigate', { detail: `/file${o.path}` }));
    dispatch(selectHeaderAndOpenParents(o.path, o.headerId, { widen: true }));
    onClose();
  };

  return (
    <div className="eli-hv__overlay" onClick={onClose}>
      <div
        className="eli-hv__box eli-bl"
        data-testid="eli-broken-links"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eli-hv__head">
          <div className="eli-hv__heading">
            <i className="fas fa-unlink" /> Enlaces rotos
          </div>
          <span className="eli-hv__total" data-testid="eli-broken-total">
            {loading ? '…' : total}
          </span>
          <button type="button" className="eli-hv__close" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="eli-hv__scroll">
          {loading ? (
            <div className="eli-hv__empty">Leyendo todos los ficheros…</div>
          ) : (
            <>
              {groups.length > 0 && (
                <div className="eli-bl__bulk" data-testid="eli-broken-bulk">
                  <label>
                    <input
                      type="checkbox"
                      checked={chosen.length === groups.length}
                      onChange={(e) =>
                        setSel(e.target.checked ? new Set(groups.map((g) => g.key)) : new Set())
                      }
                    />{' '}
                    Todos
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={!chosen.length}
                    onClick={() => run(chosen, 'text')}
                  >
                    Dejar solo el texto
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!chosen.length}
                    onClick={() => run(chosen, 'remove')}
                  >
                    Borrar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!chosen.length}
                    onClick={() => run(chosen, 'ignore')}
                  >
                    Ignorar
                  </button>
                </div>
              )}
              {groups.length ? (
                <ul className="eli-bl__list">
                  {groups.map((g) => (
                    <Group
                      key={g.key}
                      group={g}
                      nodes={result.nodes}
                      allPaths={allPaths}
                      checked={sel.has(g.key)}
                      onCheck={(v) =>
                        setSel((cur) => {
                          const next = new Set(cur);
                          if (v) next.add(g.key);
                          else next.delete(g.key);
                          return next;
                        })
                      }
                      onAction={(action, sugg) => run([g], action, sugg)}
                      onGo={go}
                    />
                  ))}
                </ul>
              ) : (
                <div className="eli-hv__empty" data-testid="eli-broken-none">
                  No hay enlaces rotos.
                </div>
              )}
              {ignored > 0 && (
                <div className="eli-bl__ignored">
                  {ignored} destino(s) ignorado(s).{' '}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      clearIgnored();
                      rescan(allPaths);
                    }}
                  >
                    Volver a mostrarlos
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default function EliBrokenLinks() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('eli:broken-links', on);
    return () => window.removeEventListener('eli:broken-links', on);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return open ? <BrokenLinks onClose={close} /> : null;
}
