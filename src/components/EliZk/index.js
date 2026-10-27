// ORG Mode para Eli (4.46): Zettelkasten. Componente sin pintura: escucha `eli:zk` (ver
// lib/eli_zk_actions.js) y lanza la acción con el store y el historial.
import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';

import {
  zkNewNote,
  zkFugazPrompt,
  zkAppendFugaz,
  zkAddPoint,
  zkEditAliases,
} from '../../lib/eli_zk_actions';

export default function EliZk() {
  const store = useStore();
  const history = useHistory();
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
      }
    };
    window.addEventListener('eli:zk', onZk);
    return () => window.removeEventListener('eli:zk', onZk);
  }, [store, history]);
  return null;
}
