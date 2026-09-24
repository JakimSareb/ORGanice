// ORG Mode para Eli: cuándo NO deben actuar los atajos de teclado de organice.
//
// organice registra sus atajos para toda la página (react-hotkeys con ignoreTags: []) y solo
// los desactiva con sus propias ventanas. Las ventanas de ORG Mode para Eli (editor de texto
// plano, diálogo de adjuntos, frases de paso, favoritos, vista de impresión…) viven fuera, así
// que sin esta comprobación teclas como Retroceso borraban el encabezado seleccionado.

const ELI_OVERLAYS = '.eli-raw, .eli-print, .eli-prompt__overlay, [role="dialog"]';

const isEditable = (el) =>
  !!el &&
  (el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' &&
      !/^(checkbox|radio|button|submit|reset|range|color|file)$/i.test(el.type || '')));

export const shouldIgnoreOrganiceHotkey = (event, orgFileContainer) => {
  if (typeof document === 'undefined') return false;
  const target = (event && event.target) || document.activeElement;
  // Con una ventana propia abierta, ningún atajo de organice
  if (document.querySelector(ELI_OVERLAYS)) return true;
  if (target && target.closest && target.closest(ELI_OVERLAYS)) return true;
  // Campos de texto fuera del fichero Org (y de las ventanas de organice, que están dentro)
  if (isEditable(target)) {
    const insideOrganice =
      (orgFileContainer && orgFileContainer.contains && orgFileContainer.contains(target)) ||
      (target.closest && target.closest('.drawer, .drawer-modal, .org-file-container'));
    if (!insideOrganice) return true;
  }
  return false;
};
