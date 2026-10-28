// ORG Mode para Eli (4.46): Zettelkasten. Escucha `eli:zk` (ver lib/eli_zk_actions.js) y lanza la
// acción con el store y el historial. (4.47) También abre la ventana de los Procesos ZK:
//   { action: 'fugaces' | 'review' | 'library' }               → Procesar fugaces / Revisión / Biblioteca
//   { action: 'permanent', path, cells }                       → «→ Permanente» de una fila de la ficha
//   { action: 'permanent', title, idea, origin }               → «Convertir en permanente» (⋯)
import React, { useEffect, useState } from 'react';
import { useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';

import {
  zkNewNote,
  zkFugazPrompt,
  zkAppendFugaz,
  zkAddPoint,
  zkEditAliases,
  zkCardPoint,
} from '../../lib/eli_zk_actions';
import EliZkProcess from './EliZkProcess';

export default function EliZk() {
  const store = useStore();
  const history = useHistory();
  const [proc, setProc] = useState(null); // { mode, init }
  useEffect(() => {
    const onZk = async (e) => {
      const d = (e && e.detail) || {};
      const run = (thunk) => store.dispatch(thunk);
      if (d.action === 'note') {
        const made = await run(zkNewNote(d.kind || null));
        if (made && made.path) history.push(`/file${made.path}`);
      } else if (d.action === 'fugaz') {
        if (d.text) await run(zkAppendFugaz(d.text, { origin: d.origin || '' }));
        else await run(zkFugazPrompt());
      } else if (d.action === 'point') {
        await run(zkAddPoint(d.path));
      } else if (d.action === 'aliases') {
        await run(zkEditAliases(d.path, d.headerId));
      } else if (['fugaces', 'review', 'library'].includes(d.action)) {
        setProc({ mode: d.action, n: Date.now() });
      } else if (d.action === 'permanent') {
        let init = { title: d.title || '', idea: d.idea || '', origin: d.origin || '' };
        if (d.path && d.cells) {
          init = await run(zkCardPoint(d.path, d.cells));
          if (!init) return;
        }
        setProc({ mode: 'permanent', init, n: Date.now() });
      }
    };
    window.addEventListener('eli:zk', onZk);
    return () => window.removeEventListener('eli:zk', onZk);
  }, [store, history]);
  if (!proc) return null;
  return <EliZkProcess key={proc.n} start={proc} onClose={() => setProc(null)} />;
}
