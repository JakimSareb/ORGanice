// ORG Mode para Eli (4.25): comparación de props de las filas de GTD para React.memo.
export const ROW_FN_PROPS = [
  'onRowClick',
  'onTitleClick',
  'onRowDoubleClick',
  'onPointerDown',
  'onContextMenu',
  'onMenuButton',
  'onDotsDown',
  'onToggleDone',
  'onToggleStar',
  'onToggleCheck',
  'onToggleFold',
  'onGoParent',
  'onCycleNotes',
  'onGoProject',
  'onOpenLink',
];
export const rowPropsEqual = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'function' || typeof y === 'function') {
      if (!!x !== !!y) return false;
    } else if (x !== y) return false;
  }
  return true;
};
