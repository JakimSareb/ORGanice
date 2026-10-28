// ORG Mode para Eli (4.52): barra «← Volver a Procesar Inbox» mientras se edita en su fichero una
// referencia abierta desde Procesar Inbox (Referencia › «Abrir y terminar de editar»). Al volver,
// GTD recoge el estado guardado y sigue en la MISMA pregunta. Si el usuario se va a otra pantalla
// que no sea el fichero ni GTD, el estado se descarta.
import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { getProcReturn, setProcReturn, subscribeProcReturn } from '../../lib/eli_proc_return';

export default function ProcReturnBar() {
  const history = useHistory();
  const { pathname } = useLocation();
  const [, tick] = useState(0);
  useEffect(() => subscribeProcReturn(() => tick((n) => n + 1)), []);
  const saved = getProcReturn();
  const inFile = pathname.startsWith('/file/');
  useEffect(() => {
    if (saved && !inFile && pathname !== '/gtd') setProcReturn(null);
  }, [saved, inFile, pathname]);
  if (!saved || !inFile) return null;
  return (
    <div className="gtd-proc-return" data-testid="gtd-proc-return">
      <button
        type="button"
        className="gtd-proc-return__btn"
        onClick={() => history.push('/gtd')}
        data-testid="gtd-proc-return-btn"
      >
        <i className="fas fa-chevron-left" /> Volver a Procesar Inbox
      </button>
      <button
        type="button"
        className="gtd-proc-return__cancel"
        onClick={() => setProcReturn(null)}
        aria-label="Descartar"
        title="No volver a Procesar Inbox"
        data-testid="gtd-proc-return-cancel"
      >
        <i className="fas fa-times" />
      </button>
    </div>
  );
}
