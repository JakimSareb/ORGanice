// ORG Mode para Eli (4.04): la ventana de atajos (la de GTD) también desde Documentos. Se abre con
// el evento «eli:shortcuts» (Menú ☰ › Ayuda › Atajos de teclado). En la vista GTD la abre la
// propia vista (para que sus teclas se paren mientras está abierta).
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { Map as IMap } from 'immutable';

import GtdShortcutsModal from './GtdShortcutsModal';
import { calculateGtdKeybindings } from '../../lib/keybindings';
import { pushModalPage } from '../../actions/base';

export const openShortcuts = () => window.dispatchEvent(new CustomEvent('eli:shortcuts'));

const selectCustom = (s) => s.base.get('customKeybindings');

export default function GtdShortcutsHost() {
  const [open, setOpen] = useState(false);
  const custom = useSelector(selectCustom);
  const bindings = useMemo(() => calculateGtdKeybindings(custom || IMap()), [custom]);
  const dispatch = useDispatch();
  const history = useHistory();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('eli:shortcuts', onOpen);
    return () => window.removeEventListener('eli:shortcuts', onOpen);
  }, []);

  if (!open) return null;
  return (
    <GtdShortcutsModal
      bindings={bindings}
      onClose={() => setOpen(false)}
      onConfigure={() => {
        setOpen(false);
        history.push('/settings');
        dispatch(pushModalPage('keyboard_shortcuts_editor'));
      }}
    />
  );
}
