// ORG Mode para Eli (3.25): vigila las fechas de las tareas cargadas y lanza los avisos.
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { buildTasks } from '../../lib/gtd/gtd_model';
import { dueTimedReminders, dailySummary } from '../../lib/gtd/gtd_reminders';
import {
  getReminderSettings,
  notificationPermission,
  showReminder,
  wasFired,
  markFired,
} from '../../lib/eli_reminders';
import { useNotesMode } from '../../lib/eli_notes_mode';

const selectFiles = (s) => s.org.present.get('files');
const TICK_MS = 30 * 1000;

export default function EliReminders() {
  const files = useSelector(selectFiles);
  // (4.25) las tareas se calculan solo al comprobar (cada 30 s), no en cada cambio de un fichero
  const filesRef = useRef(files);
  filesRef.current = files;
  const [settings, setSettings] = useState(getReminderSettings());
  // (4.0) en el Modo Notas no hay avisos de fechas
  const notes = useNotesMode();

  useEffect(() => {
    const onChange = () => setSettings(getReminderSettings());
    window.addEventListener('eli-reminders-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('eli-reminders-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    if (!settings.on || notes) return undefined;
    const tick = () => {
      if (notificationPermission() !== 'granted') return;
      const tasks = filesRef.current ? buildTasks(filesRef.current, []) : [];
      const now = new Date();
      const list = dueTimedReminders(tasks, now);
      const summary = dailySummary(tasks, now, settings.hour);
      if (summary) list.push(summary);
      list
        .filter((r) => !wasFired(r.key))
        .forEach((r) => {
          markFired(r.key);
          showReminder(r);
        });
    };
    // espera un poco al arrancar para que se carguen los ficheros
    const first = setTimeout(tick, 5000);
    const id = setInterval(tick, TICK_MS);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [settings.on, settings.hour, notes]);

  return null;
}
