// ORG Mode para Eli: búsqueda tolerante para la paleta de comandos. «cmppnt» encuentra
// «Comprar pintura»: cada palabra de la búsqueda tiene que aparecer, letra a letra y en orden,
// en el texto (sin distinguir mayúsculas ni tildes). Devuelve una puntuación (más alta = mejor)
// o null si no encaja.

export const normalize = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const scoreWord = (word, text) => {
  if (!word) return 0;
  // Coincidencia exacta de un trozo: la mejor
  const idx = text.indexOf(word);
  if (idx >= 0) {
    const atStart = idx === 0 || /[\s\-_/.:@#[(]/.test(text[idx - 1]);
    return 100 + word.length * 10 + (atStart ? 40 : 0) - Math.min(idx, 30);
  }
  // Letras en orden (subsecuencia)
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (let wi = 0; wi < word.length; wi++) {
    const ch = word[wi];
    const found = text.indexOf(ch, ti);
    if (found < 0) return null;
    if (found === prev + 1) score += 8; // seguidas
    if (found === 0 || /[\s\-_/.:@#[(]/.test(text[found - 1])) score += 10; // inicio de palabra
    score += 1;
    prev = found;
    ti = found + 1;
  }
  return score - Math.min(text.length / 10, 10);
};

export const fuzzyScore = (query, text) => {
  const t = normalize(text);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let total = 0;
  for (const w of words) {
    const s = scoreWord(w, t);
    if (s === null) return null;
    total += s;
  }
  return total;
};
