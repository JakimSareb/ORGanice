// ORG Mode para Eli (2.16): ver también lo archivado (ficheros *.org_archive, junto a cada fichero
// o en su subcarpeta archive/). Un conmutador «Archivadas» (Logbook de la vista GTD, búsqueda y
// paleta) que se recuerda; al encenderlo se leen esos ficheros (solo para verlos y buscarlos).
import { isArchiveFile } from './eli_attachments';

const LS = 'eliShowArchived';

export const getShowArchived = () => {
  try {
    return window.localStorage.getItem(LS) === 'true';
  } catch (e) {
    return false;
  }
};

export const setShowArchived = (value) => {
  try {
    window.localStorage.setItem(LS, value ? 'true' : 'false');
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent('eli:archived', { detail: !!value }));
  } catch (e) {}
};

export const archivedPathsIn = (files) =>
  files ? Array.from(files.keys()).filter((p) => p && isArchiveFile(p)) : [];

export { isArchiveFile };
