// ORG Mode para Eli: nombre de la aplicación y nombre visible de los ficheros.
export const APP_NAME = 'ORGanice';
export const APP_VERSION = '1.2';

// "/GTD/tareas.org.gpg" -> "tareas"; "/notas/diario.org_archive" -> "diario.org_archive"
export const fileDisplayName = (path) => {
  const base = String(path || '')
    .split('/')
    .pop();
  return base.replace(/\.(gpg|asc)$/i, '').replace(/\.org$/i, '') || base;
};

// Título de la ventana: siempre "ORGanice". El nombre del fichero ya se ve en la barra de la
// app; repetirlo en la barra de título de la ventana instalada lo mostraba dos veces.
export const windowTitleFor = () => APP_NAME;
