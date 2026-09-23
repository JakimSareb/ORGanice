// ORG Mode para Eli: configuración pública de la app.
//
// App key de la app de Dropbox "ORG Mode para Eli". Es PÚBLICA por diseño: con el flujo
// OAuth PKCE no existe ningún secreto, y Dropbox solo devuelve la autorización a las
// direcciones registradas en la app (Redirect URIs). Si se deja vacía, la pantalla de acceso
// pide la App key y muestra las instrucciones para crear una app propia.
export const ELI_DROPBOX_APP_KEY = '';
