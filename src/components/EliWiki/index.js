// ORG Mode para Eli (4.51): Wiki Divio. Escucha `eli:wiki` (ver lib/eli_wiki_actions.js):
//   { action: 'structure' }  → Crear estructura de wiki
//   { action: 'new' }        → Nueva entrada wiki
//   { action: 'processes' }  → ventana con la tabla de Procesos (tema, frecuencia, responsable,
//                              última revisión, «Revisado hoy»)
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from 'react-redux';

import '../Gtd/stylesheet.css';
import '../EliZk/stylesheet.css';
import './stylesheet.css';

import {
  wikiCreateStructure,
  wikiNewEntry,
  wikiProcessList,
  wikiMarkReviewed,
  wikiOpenEntry,
} from '../../lib/eli_wiki_actions';
import { sortProcesses, filterProcesses, daysSince, isoDate } from '../../lib/eli_wiki';
import { showMessage } from '../../lib/eli_prompt';

const COLS = [
  { key: 'title', label: 'Proceso' },
  { key: 'tema', label: 'Tema' },
  { key: 'frecuencia', label: 'Frecuencia' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'revision', label: 'Última revisión' },
];

const uniq = (list, key) =>
  Array.from(new Set(list.map((p) => p[key]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );

function Processes({ onClose }) {
  const store = useStore();
  const [data, setData] = useState(null); // { path, exists, list }
  const [sort, setSort] = useState({ key: 'revision', desc: false });
  const [filter, setFilter] = useState({ frecuencia: '', responsable: '', tema: '' });
  const load = useCallback(async () => setData(await wikiProcessList(store.getState())), [store]);
  useEffect(() => {
    load();
  }, [load]);
  const toggleSort = (key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }));
  const open = async (p) => {
    onClose();
    await store.dispatch(wikiOpenEntry(data.path, p.id));
  };
  const reviewed = async (p) => {
    await store.dispatch(wikiMarkReviewed(p.id));
    await load();
  };
  let body;
  if (!data) body = <div className="eli-wiki__empty">Cargando…</div>;
  else if (!data.exists)
    body = (
      <div className="eli-wiki__empty" data-testid="eli-wiki-noprocs">
        Aún no hay procesos: crea la estructura y una entrada de tipo Proceso desde ☰ › Wiki.
      </div>
    );
  else {
    const all = data.list.filter((p) => p.id);
    const shown = sortProcesses(filterProcesses(all, filter), sort.key, sort.desc);
    const today = isoDate();
    const sel = (key, label, options) => (
      <select
        className="gtd-proc__input"
        value={filter[key]}
        onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
        data-testid={`eli-wiki-filter-${key}`}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
    body = (
      <>
        <div className="gtd-proc__row gtd-proc__row--wrap eli-zk-proc__filters">
          {sel('frecuencia', 'Toda frecuencia', uniq(all, 'frecuencia'))}
          {sel('responsable', 'Todo responsable', uniq(all, 'responsable'))}
          {sel(
            'tema',
            'Todo tema',
            uniq(
              all.flatMap((p) => p.tags.map((t) => ({ tema: t }))),
              'tema'
            )
          )}
        </div>
        {shown.length === 0 ? (
          <div className="eli-wiki__empty">Ningún proceso con esos filtros.</div>
        ) : (
          <div className="eli-wiki__scroll">
            <table className="eli-wiki__table" data-testid="eli-wiki-table">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key}>
                      <button
                        type="button"
                        className="eli-wiki__sort"
                        onClick={() => toggleSort(c.key)}
                        data-testid={`eli-wiki-sort-${c.key}`}
                      >
                        {c.label}
                        {sort.key === c.key ? (sort.desc ? ' ▾' : ' ▴') : ''}
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const d = daysSince(p.ultima, today);
                  return (
                    <tr key={p.id} data-testid="eli-wiki-row">
                      <td>
                        <button
                          type="button"
                          className="eli-wiki__title"
                          onClick={() => open(p)}
                          data-testid="eli-wiki-open"
                        >
                          {p.title}
                        </button>
                      </td>
                      <td>{p.tema}</td>
                      <td>{p.frecuencia}</td>
                      <td>{p.responsable}</td>
                      <td data-testid="eli-wiki-last">
                        {p.ultima ? (
                          <>
                            {p.ultima}
                            <span className="eli-wiki__days">
                              {d === 0 ? ' · hoy' : d > 0 ? ` · hace ${d} d` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="eli-wiki__days">nunca</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn eli-wiki__done"
                          onClick={() => reviewed(p)}
                          data-testid="eli-wiki-reviewed"
                        >
                          Revisado hoy
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="eli-zk-overlay" data-testid="eli-wiki-overlay">
      <div className="eli-zk-overlay__box eli-wiki__box">
        <section className="gtd-review eli-zk-proc">
          <div className="gtd-review__head">
            <i className="fas fa-sitemap gtd-review__icon" />
            <div className="gtd-review__titles">
              <div className="gtd-review__kicker">Wiki</div>
              <div className="gtd-review__title" data-testid="eli-wiki-title">
                Procesos
                {data && data.exists && (
                  <span className="gtd-review__count">{data.list.filter((p) => p.id).length}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="gtd-review__close"
              onClick={onClose}
              title="Cerrar"
              aria-label="Cerrar"
              data-testid="eli-wiki-close"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          {body}
        </section>
      </div>
    </div>
  );
}

export default function EliWiki() {
  const store = useStore();
  const [procs, setProcs] = useState(null);
  useEffect(() => {
    const onWiki = async (e) => {
      const d = (e && e.detail) || {};
      try {
        if (d.action === 'structure') await store.dispatch(wikiCreateStructure());
        else if (d.action === 'new') await store.dispatch(wikiNewEntry());
        else if (d.action === 'processes') setProcs(Date.now());
      } catch (err) {
        showMessage('Wiki', String((err && err.message) || err));
      }
    };
    window.addEventListener('eli:wiki', onWiki);
    return () => window.removeEventListener('eli:wiki', onWiki);
  }, [store]);
  if (!procs) return null;
  return <Processes key={procs} onClose={() => setProcs(null)} />;
}
