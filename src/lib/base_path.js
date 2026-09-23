/* global process */
// ORG Mode para Eli: la app vive en una subruta (p. ej. https://usuario.github.io/ORGanice/).
// Se fija al compilar con ELI_BASE_PATH (por defecto "/ORGanice"); servir.py usa la misma ruta
// en localhost para que una única compilación sirva en ambos sitios.
const raw = process.env.ELI_BASE_PATH === undefined ? '/ORGanice' : process.env.ELI_BASE_PATH;
export const BASE_PATH = raw.replace(/\/+$/, '');
// URL absoluta de la raíz de la app, con barra final (se usa como Redirect URI de Dropbox)
export const appRootUrl = () => `${window.location.origin}${BASE_PATH}/`;
