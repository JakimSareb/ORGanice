// ORG Mode para Eli (4.36): títulos y notas de los resultados (backlinks, vista por etiqueta…)
// RENDERIZADOS como en Documentos, en solo lectura: enlaces [[id:…]], [[url][texto]], URLs,
// imágenes, negrita/cursiva/código/tachado, listas con casillas y tablas. Reutiliza el MISMO
// componente que Documentos (AttributedString) con el análisis de parse_org.
import React, { useEffect, useMemo, useRef } from 'react';
import { fromJS } from 'immutable';

import AttributedString from '../OrgFile/components/AttributedString';
import { parseRawText, parseMarkupAndCookies } from '../../lib/parse_org';
import { cleanHeadingText } from '../../lib/eli_org_links';

const noop = () => {};
// Solo lectura: sin edición, sin selección de ítems, sin cambiar casillas
export const READ_ONLY_HANDLERS = {
  shouldDisableActions: true,
  eliLocked: true,
  onTableSelect: undefined,
  onTableCellEdit: undefined,
  onEliTableChange: undefined,
  onCheckboxClick: noop,
  onListItemSelect: noop,
  onEnterListTitleEditMode: noop,
  onExitListTitleEditMode: noop,
  onListTitleValueUpdate: noop,
  onEnterListContentsEditMode: noop,
  onExitListContentsEditMode: noop,
  onListContentsValueUpdate: noop,
  onAddNewListItem: noop,
  onRemoveListItem: noop,
  selectedListItemId: null,
  inListTitleEditMode: false,
  inListContentsEditMode: false,
  onTimestampClick: noop,
};

// Marca (clase `eli-hv__link-mark`) los enlaces al ID `markId` dentro del bloque pintado
const useMarkLinks = (ref, markId, deps) => {
  useEffect(() => {
    const root = ref.current;
    if (!root || !markId) return;
    const want = `id:${String(markId).trim()}`.toLowerCase();
    root.querySelectorAll('.eli-org-link').forEach((el) => {
      const uri = (el.getAttribute('data-eli-uri') || '').replace(/\s+/g, '').toLowerCase();
      el.classList.toggle('eli-hv__link-mark', uri === want);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

// Texto org de varias líneas (notas, párrafo, ítem de lista, tabla…) → bloque pintado
export const OrgText = ({ text, markId = null, className = '' }) => {
  const ref = useRef(null);
  const parts = useMemo(() => fromJS(parseRawText(String(text || ''))), [text]);
  useMarkLinks(ref, markId, [parts, markId]);
  return (
    <div className={`eli-hv__org ${className}`.trim()} ref={ref}>
      <AttributedString parts={parts} subPartDataAndHandlers={READ_ONLY_HANDLERS} />
    </div>
  );
};

// Título de una cabecera (con sus enlaces y marcas), sin prioridad ni contadores de más
export const OrgTitle = ({ rawTitle, fallback = '(sin título)', markId = null }) => {
  const ref = useRef(null);
  const parts = useMemo(() => {
    const clean = cleanHeadingText(rawTitle || '').trim();
    return clean ? fromJS(parseMarkupAndCookies(clean, { excludeCookies: true })) : null;
  }, [rawTitle]);
  useMarkLinks(ref, markId, [parts, markId]);
  if (!parts) return <span>{fallback}</span>;
  return (
    <span ref={ref}>
      <AttributedString parts={parts} subPartDataAndHandlers={READ_ONLY_HANDLERS} />
    </span>
  );
};
