// ORG Mode para Eli: fases de la Luna, al estilo de `M-x lunar-phases` de Emacs.
// Algoritmo de Jean Meeus, "Astronomical Algorithms", cap. 49 (precisión ~1 minuto).

const RAD = Math.PI / 180;
const sin = (deg) => Math.sin(deg * RAD);
const cos = (deg) => Math.cos(deg * RAD);

// Diferencia aproximada TT − UTC (segundos) para la década actual
const DELTA_T_SECONDS = 69;

export const PHASES = [
  { id: 'new', name: 'Luna nueva', emoji: '🌑' },
  { id: 'first', name: 'Cuarto creciente', emoji: '🌓' },
  { id: 'full', name: 'Luna llena', emoji: '🌕' },
  { id: 'last', name: 'Cuarto menguante', emoji: '🌗' },
];

const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
const dateToJd = (date) => date.getTime() / 86400000 + 2440587.5;

// Momento (Date, UTC) de la fase `phase` (0 nueva, 1 creciente, 2 llena, 3 menguante) del lunación k
export const phaseDate = (kInt, phase) => {
  const k = kInt + phase / 4;
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  let jde =
    2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;

  let c;
  if (phase === 0 || phase === 2) {
    const n = phase === 0;
    c =
      (n ? -0.4072 : -0.40614) * sin(Mp) +
      (n ? 0.17241 : 0.17302) * E * sin(M) +
      (n ? 0.01608 : 0.01614) * sin(2 * Mp) +
      (n ? 0.01039 : 0.01043) * sin(2 * F) +
      (n ? 0.00739 : 0.00734) * E * sin(Mp - M) -
      (n ? 0.00514 : 0.00515) * E * sin(Mp + M) +
      (n ? 0.00208 : 0.00209) * E * E * sin(2 * M) -
      0.00111 * sin(Mp - 2 * F) -
      0.00057 * sin(Mp + 2 * F) +
      0.00056 * E * sin(2 * Mp + M) -
      0.00042 * sin(3 * Mp) +
      0.00042 * E * sin(M + 2 * F) +
      0.00038 * E * sin(M - 2 * F) -
      0.00024 * E * sin(2 * Mp - M) -
      0.00017 * sin(O) -
      0.00007 * sin(Mp + 2 * M) +
      0.00004 * sin(2 * Mp - 2 * F) +
      0.00004 * sin(3 * M) +
      0.00003 * sin(Mp + M - 2 * F) +
      0.00003 * sin(2 * Mp + 2 * F) -
      0.00003 * sin(Mp + M + 2 * F) +
      0.00003 * sin(Mp - M + 2 * F) -
      0.00002 * sin(Mp - M - 2 * F) -
      0.00002 * sin(3 * Mp + M) +
      0.00002 * sin(4 * Mp);
  } else {
    c =
      -0.62801 * sin(Mp) +
      0.17172 * E * sin(M) -
      0.01183 * E * sin(Mp + M) +
      0.00862 * sin(2 * Mp) +
      0.00804 * sin(2 * F) +
      0.00454 * E * sin(Mp - M) +
      0.00204 * E * E * sin(2 * M) -
      0.0018 * sin(Mp - 2 * F) -
      0.0007 * sin(Mp + 2 * F) -
      0.0004 * sin(3 * Mp) -
      0.00034 * E * sin(2 * Mp - M) +
      0.00032 * E * sin(M + 2 * F) +
      0.00032 * E * sin(M - 2 * F) -
      0.00028 * E * E * sin(Mp + 2 * M) +
      0.00027 * E * sin(2 * Mp + M) -
      0.00017 * sin(O) -
      0.00005 * sin(Mp - M - 2 * F) +
      0.00004 * sin(2 * Mp + 2 * F) -
      0.00004 * sin(Mp + M + 2 * F) +
      0.00004 * sin(Mp - 2 * M) +
      0.00003 * sin(Mp + M - 2 * F) +
      0.00003 * sin(3 * M) +
      0.00002 * sin(2 * Mp - 2 * F) +
      0.00002 * sin(Mp - M + 2 * F) -
      0.00002 * sin(3 * Mp + M);
    const W =
      0.00306 -
      0.00038 * E * cos(M) +
      0.00026 * cos(Mp) -
      0.00002 * cos(Mp - M) +
      0.00002 * cos(Mp + M) +
      0.00002 * cos(2 * F);
    c += phase === 1 ? W : -W;
  }

  const A = [
    [0.000325, 299.77 + 0.107408 * k - 0.009173 * T2],
    [0.000165, 251.88 + 0.016321 * k],
    [0.000164, 251.83 + 26.651886 * k],
    [0.000126, 349.42 + 36.412478 * k],
    [0.00011, 84.66 + 18.206239 * k],
    [0.000062, 141.74 + 53.303771 * k],
    [0.00006, 207.14 + 2.453732 * k],
    [0.000056, 154.84 + 7.30686 * k],
    [0.000047, 34.52 + 27.261239 * k],
    [0.000042, 207.19 + 0.121824 * k],
    [0.00004, 291.34 + 1.844379 * k],
    [0.000037, 161.72 + 24.198154 * k],
    [0.000035, 239.56 + 25.513099 * k],
    [0.000023, 331.55 + 3.592518 * k],
  ].reduce((acc, [coef, arg]) => acc + coef * sin(arg), 0);

  jde += c + A;
  return jdToDate(jde - DELTA_T_SECONDS / 86400);
};

// Todas las fases entre dos fechas (ordenadas)
export const phasesBetween = (start, end) => {
  const kStart = Math.floor((start.getFullYear() + start.getMonth() / 12 - 2000) * 12.3685) - 2;
  const result = [];
  for (let k = kStart; k < kStart + 60; k++) {
    for (let phase = 0; phase < 4; phase++) {
      const date = phaseDate(k, phase);
      if (date >= start && date < end) result.push({ date, ...PHASES[phase] });
      if (date >= end && phase === 3) return result.sort((a, b) => a.date - b.date);
    }
  }
  return result.sort((a, b) => a.date - b.date);
};

// Fases de tres meses (anterior, actual y siguiente), como `lunar-phases` de Emacs
export const phasesForThreeMonths = (year, month) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month + 2, 1);
  return phasesBetween(start, end);
};

const SYNODIC = 29.530588853;

// Estado de la Luna en una fecha: edad (días), iluminación (0–1) y nombre
export const moonState = (date = new Date()) => {
  const around = phasesBetween(new Date(date.getTime() - 40 * 86400000), new Date(date.getTime() + 1));
  const lastNew = around.filter((p) => p.id === 'new').pop();
  const age = lastNew ? (date - lastNew.date) / 86400000 : 0;
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const names = [
    [1.0, 'Luna nueva', '🌑'],
    [6.4, 'Creciente', '🌒'],
    [8.4, 'Cuarto creciente', '🌓'],
    [13.8, 'Gibosa creciente', '🌔'],
    [15.8, 'Luna llena', '🌕'],
    [21.1, 'Gibosa menguante', '🌖'],
    [23.1, 'Cuarto menguante', '🌗'],
    [28.5, 'Menguante', '🌘'],
    [99, 'Luna nueva', '🌑'],
  ];
  const [, name, emoji] = names.find(([limit]) => age < limit);
  return { age, illumination, name, emoji };
};

export { dateToJd };
