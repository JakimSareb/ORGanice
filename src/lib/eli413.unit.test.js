import {
  cleanCfg,
  phaseMillis,
  nextPhaseAfter,
  formatLeft,
  IDLE,
  startPhase,
  pausePhase,
  resumePhase,
  finishPhase,
  stopAll,
  leftMs,
  MIN_LOG_MS,
} from './eli_pomodoro';
import { toolOn, setToolOn, setNotesMode, _resetNotesModeForTests } from './eli_notes_mode';

const CFG = { work: 25, short: 5, long: 15, every: 4 };
const MIN = 60 * 1000;

test('Pomodoro: configuración limpia y tiempos', () => {
  expect(cleanCfg({})).toEqual(CFG);
  expect(cleanCfg({ work: '50', every: 99, short: 'x' })).toEqual({ ...CFG, work: 50, every: 12 });
  expect(phaseMillis('work', CFG)).toBe(25 * MIN);
  expect(phaseMillis('long', { ...CFG, long: 20 })).toBe(20 * MIN);
});

test('Pomodoro: descanso largo cada N pomodoros y tras un descanso, trabajo', () => {
  expect(nextPhaseAfter('work', 1, CFG)).toBe('short');
  expect(nextPhaseAfter('work', 3, CFG)).toBe('short');
  expect(nextPhaseAfter('work', 4, CFG)).toBe('long');
  expect(nextPhaseAfter('work', 8, CFG)).toBe('long');
  expect(nextPhaseAfter('short', 4, CFG)).toBe('work');
  expect(nextPhaseAfter('long', 4, CFG)).toBe('work');
});

test('Pomodoro: formato del tiempo que queda', () => {
  expect(formatLeft(25 * MIN)).toBe('25:00');
  expect(formatLeft(24 * MIN + 59500)).toBe('25:00');
  expect(formatLeft(61 * 1000)).toBe('1:01');
  expect(formatLeft(0)).toBe('0:00');
});

test('Pomodoro: un pomodoro completo apunta un registro y espera al descanso', () => {
  const t0 = 1000000;
  let st = startPhase(IDLE, CFG, t0);
  expect(st.status).toBe('running');
  expect(leftMs(st, t0 + 5 * MIN)).toBe(20 * MIN);
  st = finishPhase(st, CFG, t0 + 25 * MIN);
  expect(st.status).toBe('waiting');
  expect(st.phase).toBe('short');
  expect(st.count).toBe(1);
  expect(st.left).toBe(5 * MIN);
  expect(st.pending).toEqual([{ start: t0, end: t0 + 25 * MIN, ms: 25 * MIN }]);
});

test('Pomodoro: la pausa no cuenta como trabajo', () => {
  const t0 = 1000000;
  let st = startPhase(IDLE, CFG, t0);
  st = pausePhase(st, t0 + 10 * MIN);
  expect(st.status).toBe('paused');
  expect(st.left).toBe(15 * MIN);
  st = resumePhase(st, t0 + 40 * MIN);
  expect(leftMs(st, t0 + 40 * MIN)).toBe(15 * MIN);
  st = finishPhase(st, CFG, t0 + 55 * MIN);
  expect(st.pending[0].ms).toBe(25 * MIN);
});

test('Pomodoro: parar guarda lo trabajado si pasó el mínimo; un descanso no se guarda', () => {
  const t0 = 1000000;
  const worked = stopAll(startPhase(IDLE, CFG, t0), t0 + 7 * MIN);
  expect(worked.status).toBe('idle');
  expect(worked.pending).toHaveLength(1);
  expect(worked.pending[0].ms).toBe(7 * MIN);
  expect(stopAll(startPhase(IDLE, CFG, t0), t0 + MIN_LOG_MS - 1).pending).toHaveLength(0);
  const brk = startPhase({ ...IDLE, phase: 'short' }, CFG, t0);
  expect(stopAll(finishPhase(brk, CFG, t0 + 5 * MIN), t0 + 6 * MIN).pending).toHaveLength(0);
});

test('Pomodoro: la herramienta está apagada de inicio, también en el Modo Notas', () => {
  window.localStorage.clear();
  _resetNotesModeForTests();
  expect(toolOn('pomo')).toBe(false);
  expect(toolOn('calc')).toBe(true);
  setToolOn('pomo', true);
  expect(toolOn('pomo')).toBe(true);
  setNotesMode(true);
  expect(toolOn('pomo')).toBe(false);
});
