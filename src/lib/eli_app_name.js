// ORG Mode para Eli: nombre de la aplicación y nombre visible de los ficheros.
export const APP_NAME = 'ORGanice';

// "/GTD/tareas.org.gpg" -> "tareas"; "/notas/diario.org_archive" -> "diario.org_archive"
export const fileDisplayName = (path) => {
  const base = String(path || '')
    .split('/')
    .pop();
  return base.replace(/\.(gpg|asc)$/i, '').replace(/\.org$/i, '') || base;
};

// Título de la pestaña / ventana: "tareas · ORGanice"
export const windowTitleFor = (path) =>
  path ? `${fileDisplayName(path)} · ${APP_NAME}` : APP_NAME;
