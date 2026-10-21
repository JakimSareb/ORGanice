// ORG Mode para Eli (4.13): herramienta Pomodoro (Ajustes → Herramientas). Temporizador de trabajo
// y descansos; cada pomodoro de trabajo se guarda como un CLOCK en la tarea «Pomodoro» (sin
// estado) del fichero de tareas. El estado se recuerda en este navegador (localStorage), así que
// sobrevive a recargar la página; el avance solo corre con la app abierta.
import { useEffect, useState } from 'react';

const CFG_KEY = 'eliPomodoroCfg';
const STATE_KEY = 'eliPomodoroState';

export const POMODORO_TITLE = 'Pomodoro';
export const DEFAULT_CFG = { work: 25, short: 5, long: 15, every: 4 };
// Solo se guarda un CLOCK si se trabajó al menos esto (ms)
export const MIN_LOG_MS = 60 * 1000;

export const PHASE_LABELS = { work: 'Trabajo', short: 'Descanso corto', long: 'Descanso largo' };

const num = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Tiempos en minutos (1–180) y «cada cuántos» (2–12); lo raro vuelve al valor por defecto
export const cleanCfg = (cfg) => {
  const c = cfg || {};
  return {
    work: num(c.work, 1, 180, DEFAULT_CFG.work),
    short: num(c.short, 1, 180, DEFAULT_CFG.short),
    long: num(c.long, 1, 180, DEFAULT_CFG.long),
    every: num(c.every, 2, 12, DEFAULT_CFG.every),
  };
};

export const phaseMillis = (phase, cfg) => cleanCfg(cfg)[phase] * 60 * 1000;

// Tras terminar un pomodoro de trabajo (`count` = los hechos ya contando este) toca descanso
// largo cada `every`; tras un descanso, trabajo.
export const nextPhaseAfter = (phase, count, cfg) =>
  phase === 'work' ? (count % cleanCfg(cfg).every === 0 ? 'long' : 'short') : 'work';

// «24:59» (redondeando hacia arriba, como los relojes de cocina)
export const formatLeft = (ms) => {
  const total = Math.max(0, Math.ceil((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Estado: status 'idle' | 'running' | 'paused' | 'waiting' (acabó el tramo anterior y espera a
// que se pulse para empezar `phase`). `startedAt` = inicio del tramo (para el CLOCK), `endsAt` =
// fin previsto (corriendo), `left` = lo que queda (en pausa o esperando), `worked` = ms ya
// trabajados antes de la última pausa (el CLOCK cuenta solo el tiempo corrido).
export const IDLE = { status: 'idle', phase: 'work', count: 0, pending: [] };

// ---- transiciones puras: (estado, cfg, now) → estado nuevo (+ `finished` si acabó un tramo) ----
export const startPhase = (st, cfg, now) => ({
  ...st,
  status: 'running',
  startedAt: now,
  endsAt: now + phaseMillis(st.phase, cfg),
  left: phaseMillis(st.phase, cfg),
  worked: 0,
  lastResume: now,
});

export const pausePhase = (st, now) =>
  st.status !== 'running'
    ? st
    : {
        ...st,
        status: 'paused',
        left: Math.max(0, st.endsAt - now),
        worked: (st.worked || 0) + Math.max(0, now - (st.lastResume || st.startedAt)),
      };

export const resumePhase = (st, now) =>
  st.status !== 'paused'
    ? st
    : { ...st, status: 'running', endsAt: now + st.left, lastResume: now };

// Tiempo corrido de este tramo (sin las pausas)
export const workedMs = (st, now) =>
  (st.worked || 0) +
  (st.status === 'running' ? Math.max(0, now - (st.lastResume || st.startedAt)) : 0);

// Acaba el tramo en curso (porque llegó su hora o con «Saltar»): si era de trabajo y se trabajó lo
// bastante, se apunta un registro para el CLOCK. Pasa a «esperando» el siguiente tramo.
export const finishPhase = (st, cfg, now) => {
  if (st.status !== 'running' && st.status !== 'paused') return st;
  const ms = workedMs(st, now);
  const wasWork = st.phase === 'work';
  const count = wasWork ? (st.count || 0) + 1 : st.count || 0;
  const next = nextPhaseAfter(st.phase, count, cfg);
  const log =
    wasWork && ms >= MIN_LOG_MS ? [{ start: st.startedAt, end: st.startedAt + ms, ms }] : [];
  return {
    ...st,
    status: 'waiting',
    phase: next,
    count,
    left: phaseMillis(next, cfg),
    pending: [...(st.pending || []), ...log],
    finished: st.phase,
  };
};

// Parar del todo: si se estaba trabajando, se guarda lo trabajado
export const stopAll = (st, now) => {
  const ms = st.phase === 'work' && st.status !== 'waiting' ? workedMs(st, now) : 0;
  const log =
    (st.status === 'running' || st.status === 'paused') && ms >= MIN_LOG_MS
      ? [{ start: st.startedAt, end: st.startedAt + ms, ms }]
      : [];
  return { ...IDLE, pending: [...(st.pending || []), ...log] };
};

// Lo que queda del tramo para pintarlo
export const leftMs = (st, now) =>
  st.status === 'running' ? Math.max(0, st.endsAt - now) : st.left || 0;

// ---- almacén (localStorage + avisos) ----
const read = (k) => {
  try {
    return window.localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const write = (k, v) => {
  try {
    window.localStorage.setItem(k, v);
  } catch (e) {}
};

let cfg = (() => {
  try {
    return cleanCfg(JSON.parse(read(CFG_KEY) || '{}'));
  } catch (e) {
    return cleanCfg({});
  }
})();
let state = (() => {
  try {
    return { ...IDLE, ...(JSON.parse(read(STATE_KEY) || 'null') || {}) };
  } catch (e) {
    return { ...IDLE };
  }
})();
const listeners = new Set();
const finishedListeners = new Set();
let timer = null;

const notify = () => listeners.forEach((l) => l(state));

const commit = (next) => {
  const finished = next.finished;
  state = { ...next };
  delete state.finished;
  write(STATE_KEY, JSON.stringify(state));
  syncTimer();
  notify();
  if (finished) finishedListeners.forEach((l) => l(finished, state));
};

const tick = () => {
  if (state.status === 'running' && Date.now() >= state.endsAt) {
    commit(finishPhase(state, cfg, state.endsAt));
  } else notify();
};

function syncTimer() {
  if (state.status === 'running' && !timer) timer = setInterval(tick, 1000);
  else if (state.status !== 'running' && timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const getPomodoroCfg = () => cfg;
export const setPomodoroCfg = (partial) => {
  cfg = cleanCfg({ ...cfg, ...partial });
  write(CFG_KEY, JSON.stringify(cfg));
  // en espera, el tiempo mostrado sigue la configuración nueva
  if (state.status === 'waiting') state = { ...state, left: phaseMillis(state.phase, cfg) };
  notify();
};

export const getPomodoroState = () => state;

// Empezar (desde cero o el tramo que espera) / pausar / seguir / saltar / parar
export const pomodoroStart = () => {
  if (state.status === 'idle' || state.status === 'waiting')
    commit(
      startPhase(
        state.status === 'idle' ? { ...IDLE, ...state, phase: 'work' } : state,
        cfg,
        Date.now()
      )
    );
};
export const pomodoroPause = () => commit(pausePhase(state, Date.now()));
export const pomodoroResume = () => commit(resumePhase(state, Date.now()));
export const pomodoroToggle = () =>
  state.status === 'running'
    ? pomodoroPause()
    : state.status === 'paused'
    ? pomodoroResume()
    : pomodoroStart();
export const pomodoroSkip = () => {
  if (state.status === 'running' || state.status === 'paused')
    commit(finishPhase(state, cfg, Date.now()));
};
export const pomodoroStop = () => commit(stopAll(state, Date.now()));

// Los registros pendientes de guardar en el fichero (el que los guarda avisa con `ackLogs`)
export const pendingLogs = () => state.pending || [];
export const ackLogs = (n) => {
  state = { ...state, pending: (state.pending || []).slice(n) };
  write(STATE_KEY, JSON.stringify(state));
  notify();
};

export const onPomodoroFinished = (fn) => {
  finishedListeners.add(fn);
  return () => finishedListeners.delete(fn);
};

export const subscribePomodoro = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const usePomodoro = () => {
  const [, setN] = useState(0);
  useEffect(() => subscribePomodoro(() => setN((n) => n + 1)), []);
  return { state, cfg };
};

// Al cargar la página: si el tramo ya debía haber acabado (la app estuvo cerrada), se acaba ya
syncTimer();
if (state.status === 'running' && Date.now() >= state.endsAt) {
  state = finishPhase(state, cfg, state.endsAt);
  delete state.finished;
  write(STATE_KEY, JSON.stringify(state));
}
