// ORG Mode para Eli (4.58): lanza las copias rotativas (1 por hora como máximo, solo si cambió algo).
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { eliBackupTick } from '../../actions/eli_backups';

const TICK_MS = 10 * 60 * 1000;

export default function EliBackups() {
  const dispatch = useDispatch();
  useEffect(() => {
    const tick = () => {
      try {
        dispatch(eliBackupTick());
      } catch (e) {}
    };
    // espera un poco al arrancar para que se conecte y se carguen los ficheros
    const first = setTimeout(tick, 20000);
    const id = setInterval(tick, TICK_MS);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dispatch]);
  return null;
}
