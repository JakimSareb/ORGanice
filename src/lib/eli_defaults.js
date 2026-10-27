// ORG Mode para Eli (4.37): VALORES POR DEFECTO de la app = los de la configuración del usuario
// (`.organice-config.json`, 26-oct). Fuente de verdad única: la usan el estado inicial
// (util/settings_persister.js), los ajustes `eli…` que se leen de localStorage y las secciones de
// GTD. Un defecto SOLO se aplica cuando la clave no está guardada (instalación nueva o dispositivo
// sin la configuración sincronizada): NUNCA pisa un valor ya guardado.
//
// SIN defecto (dependen de cada instancia): ficheros y su configuración (`fileSettings`), favoritos,
// marcadores, carpetas excluidas, plantillas de captura, contextos propios (@3dp, @teclats,
// @congregacion), ficheros de GTD, contadores del diario, región del calendario, marcas de tiempo
// de la sincronización (`eliStamps`).
//
// NO adoptados (a confirmar): `customKeybindings` del usuario (cambiaría las teclas de todos:
// «Editar título» = Intro, «Sincronizar» = r…), y las claves viejas `eliContentPx`/`eliContentWidth`
// (restos de la 4.36: se ignoran).

// --- Ajustes de organice (persistableFields) ---
export const BASE_DEFAULTS = {
  fontSize: 'Regular',
  bulletStyle: 'Triangles',
  shouldTapTodoToAdvance: false,
  editorDescriptionHeightValue: '20',
  agendaStartOnWeekday: 1,
  shouldStoreSettingsInSyncBackend: true,
  shouldLiveSync: true,
  showDeadlineDisplay: false,
  shouldSyncOnBecomingVisibile: true,
  shouldShowTitleInOrgFile: true,
  shouldLogIntoDrawer: true,
  closeSubheadersRecursively: true,
  shouldNotIndentOnExport: false,
  eliIndentOnExport: false,
  eliAllOrgFiles: true,
  eliArchiveInSubfolder: true,
  eliNoHashTagTitle: false,
  eliSlashMenu: true,
  eliNoSwipeDocs: true,
  eliNoSwipeGtd: true,
  colorScheme: 'Light',
  theme: 'Nirvana',
  agendaTimeframe: 'Week',
  preferEditRawValues: true,
  orgHabitShowAllToday: false,
  orgHabitPrecedingDays: 21,
  orgHabitFollowingDays: 3,
};
// del reducer de `org` (no de `base`)
export const ORG_DEFAULTS = { showClockDisplay: true };

// Líneas por defecto de estados y etiquetas (también en lib/eli_todo_defaults.js)
export const TODO_KEYWORDS_LINE =
  '#+TODO: NEXT(n) TODO(t) MAYBE(m) WAITING(w) PROJECT(p) | DONE(d) CANCELLED(c)';
export const TAGS_LINE =
  '#+TAGS: @ordenador @casa @llamadas @inbox @videos @leer @recados @anywhere';

// --- Ajustes `eli…` guardados en localStorage (se leen con su propio valor por defecto) ---
export const PREF_DEFAULTS = {
  eliAgendaLog: false,
  eliGtdProjNotes: false,
  eliGtdShowCloseDay: false,
  eliGtdShowPlanDay: false,
  eliShowArchived: false,
  eliCalWeeks: false,
  eliCalMoon: false,
  eliCalHolidays: true,
  eliFountainMode: 'both',
  eliGtdSortDue: false,
  eliGtdSubtasks: false,
  eliSearchOnlyCurrent: false,
  eliNotesMode: false,
  eliGtdTagInherit: 'all',
  eliGtdGroup: 'sequential',
  eliGtdRapid: false,
  eliGtdNotes: 'none',
  eliGtdAutoCollect: true,
  eliGapHeaders: true, // (null guardado = encendido)
};
export const POMODORO_DEFAULT = { work: 25, short: 5, long: 15, every: 4 };
// Herramientas del Menú ☰ encendidas de serie (el resto, como siempre)
export const TOOLS_DEFAULT = { pomo: true };
// Orden del Menú ☰ (las entradas nuevas se insertan en su sitio por defecto)
export const MENU_ORDER = [
  'find',
  'agenda',
  'capture',
  'search',
  'clocks',
  'scratch',
  'diary',
  'zk',
  'fugaz',
  'zkprocs',
  'split',
  'processes',
  'files',
  'view',
  'tools',
  'help',
];

// Diario
export const DIARY_DEFAULTS = {
  dir: 'journal/',
  templateOn: true,
  inSystem: true,
  monthlyOn: true,
  startView: 'last',
  // (4.38) formato org-journal: un fichero por año `journal/AAAA.org` (cabecera `* día` con
  // `:CREATED: AAAAMMDD` y apuntes `** HH:MM …`)
  journal: {
    type: 'yearly',
    fileFormat: '%Y',
    header: '#+TITLE: Diari %Y\n#+STARTUP: folded',
    dateFormat: '%A, %d %B %Y',
    weekStart: 1,
  },
  // (4.38) franja «Hábitos de hoy» en el diario
  habitsOn: true,
};

// --- Vista GTD: secciones predefinidas, en su orden (solo cuando no hay nada guardado) ---
// Contextos por defecto = las etiquetas de la línea de etiquetas salvo @inbox, en el orden del usuario
export const CONTEXT_TAGS = [
  '@ordenador',
  '@llamadas',
  '@casa',
  '@leer',
  '@videos',
  '@recados',
  '@anywhere',
];
const ctxId = (tag) => `c_ctx_${tag.replace(/^@/, '')}`;
export const GTD_SECTIONS_DEFAULT_RAW = {
  order: [
    'agenda',
    'focus',
    'inbox',
    'next',
    'later',
    'waiting',
    'deadline',
    'someday',
    's_defaults_1',
    'scheduled',
    'tickler',
    's_defaults_ctx',
    ...CONTEXT_TAGS.map(ctxId),
    'reference',
    'projects',
    'horizons',
    'logbook',
    'process',
    'review',
    'trash',
  ],
  custom: CONTEXT_TAGS.map((t) => ({ id: ctxId(t), label: t, icon: 'fas fa-bookmark' })),
  separators: [
    { id: 's_defaults_1', label: '' },
    { id: 's_defaults_ctx', label: 'Contexts' },
  ],
  sections: {
    deadline: { show: false },
    reference: { show: false },
    process: { show: false },
    review: { show: false },
    horizons: { show: true },
    scheduled: { tags: ['Scheduled'] },
    tickler: { tags: ['Tickler'] },
    ...Object.fromEntries(
      CONTEXT_TAGS.map((t) => [ctxId(t), { show: true, states: ['NEXT'], tags: [t] }])
    ),
  },
};

// ¿No hay nada guardado en la configuración de secciones? (nada, {} o un Map vacío)
export const isEmptyStored = (stored) => {
  if (!stored) return true;
  const raw = stored.toJS ? stored.toJS() : stored;
  return typeof raw !== 'object' || Object.keys(raw).length === 0;
};
