// ORG Mode para Eli (4.13): chip del Pomodoro en la barra de arriba (tiempo que queda del tramo de
// trabajo o descanso) con su menú, y guardado de cada pomodoro como CLOCK en la tarea «Pomodoro».
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import EliMoreMenu from '../EliMoreMenu';
import { setDisappearingLoadingMessage } from '../../actions/base';
import { pomodoroLog } from '../../lib/gtd/gtd_actions';
import {
  usePomodoro,
  leftMs,
  formatLeft,
  pendingLogs,
  ackLogs,
  onPomodoroFinished,
  pomodoroToggle,
  pomodoroSkip,
  pomodoroStop,
  PHASE_LABELS,
  phaseMillis,
} from '../../lib/eli_pomodoro';

const beep = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
};

export default function EliPomodoro() {
  const dispatch = useDispatch();
  const { state, cfg } = usePomodoro();
  const files = useSelector((s) => s.org.present.get('files'));
  const pending = pendingLogs().length;

  // al acabar un tramo: aviso (mensaje, sonido y, si hay permiso, notificación)
  useEffect(
    () =>
      onPomodoroFinished((phase, st) => {
        const next = PHASE_LABELS[st.phase].toLowerCase();
        const min = Math.round(phaseMillis(st.phase, cfg) / 60000);
        const text =
          (phase === 'work' ? 'Pomodoro terminado' : 'Descanso terminado') +
          ` · toca: ${next} (${min} min)`;
        dispatch(setDisappearingLoadingMessage(text, 6000));
        beep();
        try {
          if (window.Notification && window.Notification.permission === 'granted')
            new window.Notification(text);
        } catch (e) {}
      }),
    [dispatch, cfg]
  );

  // los pomodoros terminados se guardan en el fichero de tareas (si aún no está cargado, se
  // reintenta cuando cambien los ficheros)
  useEffect(() => {
    const logs = pendingLogs();
    if (!logs.length || !files || !files.size) return;
    let done = 0;
    for (const l of logs) {
      let ok = false;
      try {
        ok = dispatch(pomodoroLog(new Date(l.start), new Date(l.end)));
      } catch (e) {
        ok = false;
      }
      if (!ok) break;
      done += 1;
    }
    if (done) ackLogs(done);
  }, [dispatch, pending, files]);

  if (state.status === 'idle') return null;
  const now = Date.now();
  const left = leftMs(state, now);
  const running = state.status === 'running';
  const paused = state.status === 'paused';
  const waiting = state.status === 'waiting';
  const items = [
    {
      icon: running ? 'fas fa-pause' : 'fas fa-play',
      label: running
        ? 'Pausar'
        : paused
        ? 'Seguir'
        : `Empezar: ${PHASE_LABELS[state.phase].toLowerCase()}`,
      onClick: pomodoroToggle,
      testId: 'eli-pomodoro-toggle',
    },
    !waiting && {
      icon: 'fas fa-forward',
      label: 'Saltar al siguiente tramo',
      onClick: pomodoroSkip,
      testId: 'eli-pomodoro-skip',
    },
    {
      icon: 'fas fa-stop',
      label: 'Parar el pomodoro',
      onClick: pomodoroStop,
      testId: 'eli-pomodoro-stop',
    },
  ].filter(Boolean);
  const title = `${PHASE_LABELS[state.phase]}${paused ? ' (en pausa)' : ''}${
    waiting ? ' (esperando)' : ''
  } · pomodoros hechos: ${state.count || 0}`;
  return (
    <EliMoreMenu
      items={items}
      icon={state.phase === 'work' ? 'fas fa-hourglass-half' : 'fas fa-coffee'}
      label={formatLeft(left)}
      title={title}
      buttonClassName={
        'header-bar__actions__item eli-pomodoro' +
        (state.phase === 'work' ? ' is-work' : ' is-break') +
        (running ? '' : ' is-paused')
      }
      testId="eli-pomodoro"
    />
  );
}
