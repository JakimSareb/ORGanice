// ORG Mode para Eli: diferencias por líneas entre dos versiones de un fichero (para resolver
// conflictos de sincronización) y combinación según lo que se elija en cada cambio.

const MAX_CELLS = 4000000; // límite de la tabla LCS (memoria); si se supera, un solo bloque

const splitLines = (text) => {
  const t = (text || '').replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * Bloques en orden: { type: 'same', lines } o { type: 'change', mine: [...], theirs: [...] }
 */
export const diffBlocks = (mineText, theirsText) => {
  const a = splitLines(mineText);
  const b = splitLines(theirsText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops = []; // ['=', line] | ['-', line] (solo mía) | ['+', line] (solo la otra)
  const n = midA.length;
  const m = midB.length;
  if (n && m && (n + 1) * (m + 1) <= MAX_CELLS) {
    // LCS clásica por programación dinámica (de atrás hacia delante)
    const w = m + 1;
    const table = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] =
          midA[i] === midB[j]
            ? table[(i + 1) * w + j + 1] + 1
            : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push(['=', midA[i]]);
        i++;
        j++;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        ops.push(['-', midA[i++]]);
      } else {
        ops.push(['+', midB[j++]]);
      }
    }
    while (i < n) ops.push(['-', midA[i++]]);
    while (j < m) ops.push(['+', midB[j++]]);
  } else {
    midA.forEach((l) => ops.push(['-', l]));
    midB.forEach((l) => ops.push(['+', l]));
  }

  const blocks = [];
  const pushSame = (line) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'same') last.lines.push(line);
    else blocks.push({ type: 'same', lines: [line] });
  };
  const pushChange = (side, line) => {
    let last = blocks[blocks.length - 1];
    if (!last || last.type !== 'change') {
      last = { type: 'change', mine: [], theirs: [] };
      blocks.push(last);
    }
    last[side].push(line);
  };
  a.slice(0, start).forEach(pushSame);
  ops.forEach(([op, line]) => {
    if (op === '=') pushSame(line);
    else pushChange(op === '-' ? 'mine' : 'theirs', line);
  });
  a.slice(endA).forEach(pushSame);
  return blocks;
};

export const changeCount = (blocks) => blocks.filter((b) => b.type === 'change').length;

/**
 * Texto combinado. choices[k] para el k-ésimo cambio: 'mine' | 'theirs' | 'both'
 * (por defecto 'mine').
 */
export const mergeBlocks = (blocks, choices = []) => {
  const out = [];
  let k = 0;
  blocks.forEach((block) => {
    if (block.type === 'same') {
      out.push(...block.lines);
      return;
    }
    const choice = choices[k++] || 'mine';
    if (choice === 'mine' || choice === 'both') out.push(...block.mine);
    if (choice === 'theirs' || choice === 'both') out.push(...block.theirs);
  });
  return out.length ? out.join('\n') + '\n' : '';
};
