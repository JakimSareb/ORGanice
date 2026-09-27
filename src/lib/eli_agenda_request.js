// ORG Mode para Eli (2.14): abrir la agenda en un día concreto (desde el calendario).
// La agenda se abre en su vista «Día» en esa fecha; al cerrarla se recupera la vista que
// tenía (Semana, Mes…).
let pending = null;

export const requestAgendaDate = (date) => {
  pending = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
  // Si la agenda ya está abierta, cambia de día
  window.dispatchEvent(new CustomEvent('eli:agenda-date', { detail: pending }));
};

export const takeAgendaDate = () => {
  const d = pending;
  pending = null;
  return d;
};
