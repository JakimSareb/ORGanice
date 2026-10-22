import React from 'react';
import { getProcessMode, setProcessMode } from '../../lib/gtd/gtd_process';
import { strictOn, setStrictOn } from '../../lib/gtd/gtd_strict';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { withRouter, Link, useHistory } from 'react-router-dom';

import * as syncBackendActions from '../../actions/sync_backend';
import * as baseActions from '../../actions/base';
import * as orgActions from '../../actions/org';

import GtdSectionsSettings from './GtdSectionsSettings';
import OfflineSettings from './OfflineSettings';
import './stylesheet.css';

import TabButtons from '../UI/TabButtons';
import { READABILITY, getReadability, setReadability } from '../../lib/eli_readability';
import { FONTS, getFont, setFont } from '../../lib/eli_font';
import Switch from '../UI/Switch';
import ExternalLink from '../UI/ExternalLink';
import { APP_NAME, APP_VERSION } from '../../lib/eli_app_name';
import {
  DEFAULT_TODO_LINE,
  DEFAULT_TAGS_LINE,
  parseTodoLine,
  parseTagsLine,
} from '../../lib/eli_todo_defaults';
import { TAP_MODES, getTapMode, setTapMode } from '../../lib/eli_tap_mode';
import {
  MENU_ENTRIES,
  getMenuLayout,
  setMenuLayout,
  moveEntry,
  toggleHidden,
  getDocMargin,
  setDocMargin,
  DOC_MARGIN_MAX,
} from '../../lib/eli_menu_layout';
import { getPomodoroCfg, setPomodoroCfg } from '../../lib/eli_pomodoro';
import {
  TOOLS,
  useNotesMode,
  setNotesMode,
  toolOn,
  setToolOn,
  notesAgendaOn,
  setNotesAgendaOn,
} from '../../lib/eli_notes_mode';
import {
  getReminderSettings,
  setReminderSettings,
  notificationPermission,
  requestReminderPermission,
} from '../../lib/eli_reminders';

// (4.0) Temas: tres a la vista y el resto tras «⋯ Más temas»
const MAIN_THEMES = ['Unicornio', 'Cuki', 'Nirvana'];
const MORE_THEMES = ['Solarized', 'One', 'Gruvbox', 'Smyck', 'Code'];
const EliThemeSetting = ({ theme, onSelect }) => {
  const [more, setMore] = React.useState(MORE_THEMES.includes(theme));
  return (
    <div
      className="setting-container setting-container--vertical eli-theme-setting"
      data-testid="eli-setting-theme"
    >
      <div className="setting-label">Tema</div>
      <TabButtons buttons={MAIN_THEMES} selectedButton={theme} onSelect={onSelect} />
      {more ? (
        <div data-testid="eli-theme-more-list">
          <TabButtons buttons={MORE_THEMES} selectedButton={theme} onSelect={onSelect} />
        </div>
      ) : (
        <button
          type="button"
          className="btn-passive eli-theme-more"
          onClick={() => setMore(true)}
          data-testid="eli-theme-more"
        >
          <i className="fas fa-ellipsis-h" /> Más temas
        </button>
      )}
    </div>
  );
};

// (4.0) Modo Notas: arriba de los Ajustes
const EliNotesModeSetting = ({ notes }) => (
  <div className="setting-container eli-notes-mode-setting" data-testid="eli-setting-notes-mode">
    <div className="setting-label">
      Modo Notas
      <div className="setting-label__description">
        Solo notas: oculta GTD y lo de tareas (estados, fechas, reloj…). Tus ficheros no cambian;
        puedes volver al modo completo cuando quieras.
      </div>
    </div>
    <Switch isEnabled={notes} onToggle={() => setNotesMode(!notes)} />
  </div>
);

// (4.09) Modo Notas: la Agenda en el Menú ☰ (o no)
const EliNotesAgendaSetting = () => (
  <div className="setting-container" data-testid="eli-setting-notes-agenda">
    <div className="setting-label">
      Agenda en el Menú
      <div className="setting-label__description">
        En el Modo Notas, la Agenda sale en el Menú ☰.
      </div>
    </div>
    <Switch isEnabled={notesAgendaOn()} onToggle={() => setNotesAgendaOn(!notesAgendaOn())} />
  </div>
);

// (4.13) Tiempos del Pomodoro (minutos): trabajo, descanso corto, largo y cada cuántos el largo
const EliPomodoroSettings = () => {
  const [cfg, setCfg] = React.useState(getPomodoroCfg());
  const fields = [
    ['work', 'Pomodoro (min)'],
    ['short', 'Descanso corto (min)'],
    ['long', 'Descanso largo (min)'],
    ['every', 'Descanso largo cada (pomodoros)'],
  ];
  return (
    <div
      className="setting-container setting-container--vertical"
      data-testid="eli-setting-pomodoro"
    >
      <div className="setting-label">
        Pomodoro
        <div className="setting-label__description">
          Cada pomodoro de trabajo se guarda como un CLOCK en la tarea «Pomodoro» del fichero de
          tareas.
        </div>
      </div>
      {fields.map(([id, label]) => (
        <label key={id} className="eli-pomodoro-field">
          <span>{label}</span>
          <input
            type="number"
            inputMode="numeric"
            min={id === 'every' ? 2 : 1}
            max={id === 'every' ? 12 : 180}
            value={cfg[id]}
            onChange={(e) => {
              const v = e.target.value;
              setCfg({ ...cfg, [id]: v });
              if (v !== '') {
                setPomodoroCfg({ [id]: v });
              }
            }}
            onBlur={() => setCfg(getPomodoroCfg())}
            data-testid={`eli-pomodoro-${id}`}
          />
        </label>
      ))}
    </div>
  );
};

// (4.0) Herramientas opcionales (apagadas de inicio en el Modo Notas)
const EliToolsSettings = () => (
  <details className="eli-settings-section" data-testid="eli-settings-tools">
    <summary>
      <span className="eli-settings-section__title">Herramientas</span>
      <span className="eli-settings-section__hint">Qué herramientas salen en el Menú</span>
    </summary>
    {TOOLS.map((t) => (
      <div key={t.id} className="setting-container" data-testid={`eli-tool-${t.id}`}>
        <div className="setting-label">{t.label}</div>
        <Switch isEnabled={toolOn(t.id)} onToggle={() => setToolOn(t.id, !toolOn(t.id))} />
      </div>
    ))}
    {toolOn('pomo') && <EliPomodoroSettings />}
  </details>
);

// (4.12) Menú ☰: orden y qué entradas salen (en este dispositivo). «Ajustes», siempre la última
const EliMenuLayoutSetting = () => {
  const [layout, setLayout] = React.useState(getMenuLayout());
  const save = (l) => {
    setMenuLayout(l);
    setLayout(getMenuLayout());
  };
  const label = (id) => (MENU_ENTRIES.find((e) => e.id === id) || {}).label || id;
  return (
    <div
      className="setting-container setting-container--vertical eli-theme-setting"
      data-testid="eli-setting-menu-layout"
    >
      <div className="setting-label">
        Menú ☰
        <div className="setting-label__description">
          Ordena las entradas con las flechas y apaga las que no quieras ver. Algunas solo salen
          donde tienen sentido (p. ej. Vista, dentro de un fichero). «Ajustes» sale siempre, al
          final.
        </div>
      </div>
      {layout.order.map((id, i) => (
        <div key={id} className="eli-menu-layout__row" data-testid={`eli-menu-layout-${id}`}>
          <span className="eli-menu-layout__label">{label(id)}</span>
          <button
            type="button"
            className="btn-passive eli-menu-layout__btn"
            disabled={i === 0}
            onClick={() => save(moveEntry(layout, id, -1))}
            title="Subir"
            data-testid={`eli-menu-layout-up-${id}`}
          >
            <i className="fas fa-arrow-up" />
          </button>
          <button
            type="button"
            className="btn-passive eli-menu-layout__btn"
            disabled={i === layout.order.length - 1}
            onClick={() => save(moveEntry(layout, id, 1))}
            title="Bajar"
            data-testid={`eli-menu-layout-down-${id}`}
          >
            <i className="fas fa-arrow-down" />
          </button>
          <Switch
            isEnabled={!layout.hidden.includes(id)}
            onToggle={() => save(toggleHidden(layout, id))}
          />
        </div>
      ))}
    </div>
  );
};

// (4.12) Margen izquierdo de Documentos con el dedo (móvil/tableta); antes fijo, 14 px
const EliDocMarginSetting = () => {
  const [px, setPx] = React.useState(getDocMargin());
  return (
    <div
      className="setting-container setting-container--vertical eli-theme-setting"
      data-testid="eli-setting-doc-margin"
    >
      <div className="setting-label">
        Margen izquierdo de Documentos (móvil): {px} px
        <div className="setting-label__description">
          Espacio libre a la izquierda de la lista de cabeceras cuando se usa con el dedo.
        </div>
      </div>
      <input
        type="range"
        min="0"
        max={DOC_MARGIN_MAX}
        step="1"
        value={px}
        onChange={(e) => {
          const v = Number(e.target.value);
          setPx(v);
          setDocMargin(v);
        }}
        data-testid="eli-doc-margin"
      />
    </div>
  );
};

// ORG Mode para Eli: campo de texto que se guarda al salir de él (o con Intro)

// (3.06) Legibilidad del texto en Documentos (en este dispositivo)
const EliReadabilitySetting = () => {
  const [value, setValue] = React.useState(getReadability());
  return (
    <div
      className="setting-container setting-container--vertical eli-theme-setting"
      data-testid="eli-setting-readability"
    >
      <div className="setting-label">Legibilidad del texto (Documentos)</div>
      <TabButtons
        buttons={READABILITY.map((r) => r.label)}
        values={READABILITY.map((r) => r.id)}
        selectedButton={value}
        onSelect={(v) => {
          setValue(v);
          setReadability(v);
        }}
      />
    </div>
  );
};

// (4.10) Tipo de letra de toda la app (en este dispositivo; también en el Modo Notas)
const EliFontSetting = () => {
  const [value, setValue] = React.useState(getFont());
  return (
    <div
      className="setting-container setting-container--vertical eli-theme-setting"
      data-testid="eli-setting-font"
    >
      <div className="setting-label">Tipo de letra</div>
      <TabButtons
        buttons={FONTS.map((f) => f.label)}
        values={FONTS.map((f) => f.id)}
        selectedButton={value}
        onSelect={(v) => {
          setValue(v);
          setFont(v);
        }}
      />
    </div>
  );
};

// (3.07) qué hace un toque/clic en tareas y cabeceras, en el móvil y en el ordenador
const EliTapModeSettings = ({ onlyHeader }) => {
  const [, force] = React.useState(0);
  return (
    <>
      {Object.keys(TAP_MODES)
        .filter((k) => !onlyHeader || k === 'header')
        .map((k) => (
          <div
            key={k}
            className="setting-container setting-container--vertical eli-theme-setting"
            data-testid={`eli-setting-tap-${k}`}
          >
            <div className="setting-label">{TAP_MODES[k].label}</div>
            <TabButtons
              buttons={TAP_MODES[k].options.map((o) => o.label)}
              values={TAP_MODES[k].options.map((o) => o.id)}
              selectedButton={getTapMode(k)}
              onSelect={(v) => {
                setTapMode(k, v);
                force((n) => n + 1);
              }}
            />
          </div>
        ))}
    </>
  );
};

// (3.40) «Procesar Inbox»: una a una o todo junto
const EliProcessModeSettings = () => {
  const [mode, setMode] = React.useState(getProcessMode());
  return (
    <div
      className="setting-container setting-container--vertical eli-theme-setting"
      data-testid="eli-setting-process-mode"
    >
      <div className="setting-label">Procesar Inbox (GTD)</div>
      <TabButtons
        buttons={['Una a una', 'Todo junto']}
        values={['step', 'all']}
        selectedButton={mode}
        onSelect={(v) => {
          setProcessMode(v);
          setMode(getProcessMode());
        }}
      />
    </div>
  );
};

// (4.15) «Allen estricto»: los procesos siguen solo lo oficial de David Allen
const EliStrictSetting = () => {
  const [on, setOn] = React.useState(strictOn());
  return (
    <div className="setting-container" data-testid="eli-setting-allen-strict">
      <div className="setting-label">
        Allen estricto
        <div className="setting-label__description">
          Revisión semanal, Procesar Inbox y Volcado mental siguen solo lo oficial de David Allen
          (sin pasos propios ni la lista Todo). No cambia tus listas ni tus ficheros.
        </div>
      </div>
      <Switch
        isEnabled={on}
        onToggle={() => {
          setStrictOn(!on);
          setOn(strictOn());
        }}
      />
    </div>
  );
};

// (3.25) avisos de fechas (vence/programada) con notificaciones, en este dispositivo
const EliRemindersSettings = () => {
  const [s, setS] = React.useState(getReminderSettings());
  const [perm, setPerm] = React.useState(notificationPermission());
  const update = (changes) => {
    setReminderSettings(changes);
    setS(getReminderSettings());
  };
  const toggle = async () => {
    if (s.on) return update({ on: false });
    const p = await requestReminderPermission();
    setPerm(p);
    update({ on: p === 'granted' });
  };
  let note =
    'A la hora exacta las fechas con hora; el resto, en un resumen diario. Solo con la app abierta o en segundo plano reciente.';
  if (perm === 'unsupported')
    note =
      'Este navegador no admite avisos. En el iPhone: añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde allí.';
  else if (perm === 'denied')
    note = 'Los avisos están bloqueados para esta web: permítelos en los ajustes del navegador.';
  return (
    <>
      <div className="setting-container" data-testid="eli-setting-reminders">
        <div className="setting-label">
          Avisos de fechas (vence / programada)
          <div className="setting-label__description">{note}</div>
        </div>
        <Switch isEnabled={s.on && perm === 'granted'} onToggle={toggle} />
      </div>
      {s.on && perm === 'granted' && (
        <div className="setting-container">
          <div className="setting-label">Hora del resumen diario</div>
          <select
            className="textfield"
            value={s.hour}
            onChange={(e) => update({ hour: Number(e.target.value) })}
            data-testid="eli-setting-reminders-hour"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {`${String(h).padStart(2, '0')}:00`}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};

const EliLineSetting = ({ label, description, value, fallback, isValid, onSave, testId }) => {
  const [text, setText] = React.useState(value || fallback);
  const [error, setError] = React.useState('');
  React.useEffect(() => setText(value || fallback), [value, fallback]);
  const save = (v) => {
    const line = (v || '').trim() || fallback;
    if (!isValid(line)) {
      setError('No es válido; se mantiene el anterior.');
      setText(value || fallback);
      return;
    }
    setError('');
    setText(line);
    if (line !== (value || fallback)) onSave(line);
  };
  return (
    <div className="setting-container eli-line-setting">
      <div className="setting-label">
        {label}
        <div className="setting-label__description">{description}</div>
        <input
          className="textfield eli-line-setting__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          spellCheck={false}
          data-testid={testId}
        />
        {error && <div className="eli-line-setting__error">{error}</div>}
        <button className="btn-passive eli-line-setting__reset" onClick={() => save(fallback)}>
          Restablecer
        </button>
      </div>
    </div>
  );
};

const Settings = ({
  fontSize,
  bulletStyle,
  shouldTapTodoToAdvance,
  shouldStoreSettingsInSyncBackend,
  shouldLiveSync,
  showDeadlineDisplay,
  shouldSyncOnBecomingVisibile,
  shouldShowTitleInOrgFile,
  closeSubheadersRecursively,
  eliIndentOnExport,
  eliArchiveInSubfolder,
  eliTodoKeywordsLine,
  eliDefaultTagsLine,
  editorDescriptionHeightValue,
  agendaDefaultDeadlineDelayValue,
  agendaDefaultDeadlineDelayUnit,
  agendaStartOnWeekday,
  hasUnseenChangelog,
  syncBackend,
  preferEditRawValues,
  showClockDisplay,
  orgHabitShowAllToday,
  orgHabitPrecedingDays,
  orgHabitFollowingDays,
  colorScheme,
  theme,
  base,
  org,
}) => {
  const history = useHistory();
  const notes = useNotesMode();

  const handleSignOutClick = () => {
    if (window.confirm('¿Seguro que quieres cerrar sesión?')) {
      syncBackend.signOut();
      history.push('/');
    }
  };

  const handleKeyboardShortcutsClick = () => base.pushModalPage('keyboard_shortcuts_editor');

  const handleCaptureTemplatesClick = () => base.pushModalPage('capture_templates_editor');

  const handleFileSettingsClick = () => base.pushModalPage('file_settings_editor');

  const handleFontSizeChange = (newFontSize) => base.setFontSize(newFontSize);

  const handleColorSchemeClick = (colorScheme) => base.setColorScheme(colorScheme);

  const handleThemeClick = (theme) => base.setTheme(theme);

  const handleBulletStyleChange = (newBulletStyle) => base.setBulletStyle(newBulletStyle);

  const handleShouldTapTodoToAdvanceChange = () =>
    base.setShouldTapTodoToAdvance(!shouldTapTodoToAdvance);

  const handleEditorDescriptionHeightValueChange = (event) =>
    base.setEditorDescriptionHeightValue(event.target.value);

  const handleAgendaDefaultDeadlineDelayValueChange = (event) =>
    base.setAgendaDefaultDeadlineDelayValue(event.target.value);

  const handleAgendaDefaultDeadlineDelayUnitChange = (newDelayUnit) =>
    base.setAgendaDefaultDeadlineDelayUnit(newDelayUnit);

  const handleAgendaStartOnWeekdayChange = (value) => base.setAgendaStartOnWeekday(value);

  const handleShouldLiveSyncChange = () => base.setShouldLiveSync(!shouldLiveSync);

  const handleShowDeadlineDisplayChange = () => base.setShowDeadlineDisplay(!showDeadlineDisplay);

  const handleShouldSyncOnBecomingVisibleChange = () =>
    base.setShouldSyncOnBecomingVisibile(!shouldSyncOnBecomingVisibile);

  const handleShouldShowTitleInOrgFile = () =>
    base.setShouldShowTitleInOrgFile(!shouldShowTitleInOrgFile);

  const handleCloseSubheadersRecursively = () =>
    base.setCloseSubheadersRecursively(!closeSubheadersRecursively);

  const handleEliIndentOnExport = () => base.setEliIndentOnExport(!eliIndentOnExport);

  const handleShouldStoreSettingsInSyncBackendChange = () =>
    base.setShouldStoreSettingsInSyncBackend(!shouldStoreSettingsInSyncBackend);

  const handleShowClockDisplayClick = () => org.setShowClockDisplay(!showClockDisplay);

  const handlePreferEditRawValues = () => base.setPreferEditRawValues(!preferEditRawValues);

  const handleOrgHabitShowAllToday = () => base.setOrgHabitShowAllToday(!orgHabitShowAllToday);

  const handleOrgHabitPrecedingDaysChange = (event) =>
    base.setOrgHabitPrecedingDays(parseInt(event.target.value, 10) || 0);

  const handleOrgHabitFollowingDaysChange = (event) =>
    base.setOrgHabitFollowingDays(parseInt(event.target.value, 10) || 0);

  return (
    <div className={'settings-container' + (notes ? ' is-notes-mode' : '')}>
      <EliNotesModeSetting notes={notes} />
      {notes && <EliNotesAgendaSetting />}
      <details className="eli-settings-section" data-testid="eli-settings-appearance">
        <summary>
          <span className="eli-settings-section__title">Apariencia</span>
          <span className="eli-settings-section__hint">
            {notes ? 'Tema, colores y letra' : 'Tema, colores, letra y viñetas'}
          </span>
        </summary>
        <div className="setting-container">
          <div className="setting-label">Tamaño de letra</div>
          <TabButtons
            buttons={['Normal', 'Grande']}
            values={['Regular', 'Large']}
            selectedButton={fontSize}
            onSelect={handleFontSizeChange}
          />
        </div>

        <div className="setting-container">
          <div className="setting-label">Esquema de color</div>
          <TabButtons
            buttons={['Sistema', 'Claro', 'Oscuro']}
            values={['OS', 'Light', 'Dark']}
            selectedButton={colorScheme}
            onSelect={handleColorSchemeClick}
          />
        </div>

        <EliThemeSetting theme={theme} onSelect={handleThemeClick} />

        <EliFontSetting />

        {notes && <EliTapModeSettings onlyHeader />}

        {!notes && (
          <>
            <EliReadabilitySetting />
            <EliTapModeSettings />
            <EliProcessModeSettings />
            <EliStrictSetting />
            <EliRemindersSettings />
          </>
        )}

        {/* (4.04) más estilos (cambian el icono según el nivel); también en el Modo Notas */}
        <div className="setting-container" data-testid="eli-setting-bullets">
          <div className="setting-label">Estilo de viñetas</div>
          <select
            className="eli-bullet-select"
            value={bulletStyle || 'Fancy'}
            onChange={(e) => handleBulletStyleChange(e.target.value)}
            data-testid="eli-bullet-style"
          >
            {[
              ['Classic', 'Clásico  *'],
              ['Fancy', 'Decorado  ●'],
              ['Org', 'Org  ◉ ○ ✸ ✿'],
              ['Squares', 'Puntos y cuadrados  ● ○ ■ □'],
              ['Stars', 'Estrellas  ★ ✦ ✧ ·'],
              ['Diamonds', 'Rombos  ◆ ◇ ◈ ⬩'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <EliDocMarginSetting />
        <EliMenuLayoutSetting />
      </details>

      <EliToolsSettings />

      {!notes && (
        <details className="eli-settings-section" data-testid="eli-settings-tasks">
          <summary>
            <span className="eli-settings-section__title">Tareas y etiquetas</span>
            <span className="eli-settings-section__hint">Estados y etiquetas por defecto</span>
          </summary>
          <EliLineSetting
            label="Estados de las tareas"
            description="Para los ficheros sin línea #+TODO (como la configuración global de Emacs). Antes de | los activos y después los terminados. Se aplica al volver a abrir los ficheros."
            value={eliTodoKeywordsLine}
            fallback={DEFAULT_TODO_LINE}
            isValid={(l) => /^#\+(SEQ_|TYP_)?TODO:\s*\S/i.test(l) && !!parseTodoLine(l)}
            onSave={(l) => base.setEliSetting('eliTodoKeywordsLine', l)}
            testId="eli-setting-todo"
          />
          <EliLineSetting
            label="Etiquetas por defecto (contextos)"
            description="Se ofrecen al editar etiquetas (además de las #+TAGS de cada fichero) y se escriben en los ficheros nuevos."
            value={eliDefaultTagsLine}
            fallback={DEFAULT_TAGS_LINE}
            isValid={(l) => /^#\+TAGS:\s*\S/i.test(l) && parseTagsLine(l).length > 0}
            onSave={(l) => base.setEliSetting('eliDefaultTagsLine', l)}
            testId="eli-setting-tags"
          />
          <div className="setting-container">
            <div className="setting-label">
              Archivar en
              <div className="setting-label__description">
                Dónde van las tareas archivadas (si el fichero o la tarea no dicen otra cosa con
                #+ARCHIVE:). «Subcarpeta archive»: en la carpeta archive de la carpeta de cada
                fichero, p. ej. proyectos/archive/tareas.org_archive (se crea si no existe).
              </div>
            </div>
            <div data-testid="eli-setting-archive">
              <TabButtons
                buttons={['Junto al fichero', 'Subcarpeta archive']}
                values={['same', 'subfolder']}
                selectedButton={eliArchiveInSubfolder ? 'subfolder' : 'same'}
                onSelect={(v) => base.setEliSetting('eliArchiveInSubfolder', v === 'subfolder')}
              />
            </div>
          </div>
        </details>
      )}

      {!notes && (
        <details className="eli-settings-section" data-testid="eli-settings-gtd">
          <summary>
            <span className="eli-settings-section__title">Vista GTD y gestos</span>
            <span className="eli-settings-section__hint">
              Deslizar, y qué se ve en cada sección de la vista GTD
            </span>
          </summary>
          <GtdSectionsSettings />
        </details>
      )}

      <details className="eli-settings-section" data-testid="eli-settings-offline">
        <summary>
          <span className="eli-settings-section__title">Usar sin conexión</span>
          <span className="eli-settings-section__hint">
            Guardar tus ficheros en este dispositivo para trabajar sin Internet
          </span>
        </summary>
        <OfflineSettings />
      </details>

      {!notes && (
        <details className="eli-settings-section" data-testid="eli-settings-advanced">
          <summary>
            <span className="eli-settings-section__title">Opciones avanzadas</span>
            <span className="eli-settings-section__hint">
              Sincronización, agenda, hábitos, editor…
            </span>
          </summary>
          <div className="setting-container">
            <div className="setting-label">Tocar el estado TODO para avanzarlo</div>
            <Switch
              isEnabled={shouldTapTodoToAdvance}
              onToggle={handleShouldTapTodoToAdvanceChange}
            />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Sincronizar en directo
              <div className="setting-label__description">
                Si está activado, los cambios se envían automáticamente al servicio de
                sincronización a medida que los haces.
              </div>
            </div>
            <Switch isEnabled={shouldLiveSync} onToggle={handleShouldLiveSyncChange} />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Sincronizar al volver a la aplicación
              <div className="setting-label__description">
                Si está activado, el fichero org actual se descarga del servicio de sincronización
                cuando la pestaña del navegador vuelve a estar visible. Así evitas trabajar sobre
                una versión desactualizada del fichero.
              </div>
            </div>
            <Switch
              isEnabled={shouldSyncOnBecomingVisibile}
              onToggle={handleShouldSyncOnBecomingVisibleChange}
            />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Mostrar el nombre del fichero Org como título
              <div className="setting-label__description">
                Al ver un fichero Org, muestra su nombre en la barra superior.
              </div>
            </div>
            <Switch
              isEnabled={shouldShowTitleInOrgFile}
              onToggle={handleShouldShowTitleInOrgFile}
            />
          </div>

          {/* (3.05) los cambios de estado van siempre al cajón LOGBOOK (ya no es opción) */}
          <div className="setting-container">
            <div className="setting-label">
              Al plegar un encabezado, plegar también sus subencabezados
              <div className="setting-label__description">
                Al plegar un encabezado, se pliegan recursivamente todos sus subencabezados, de modo
                que al volver a abrirlo aparecen todos plegados, sea cual sea su estado anterior. Es
                el comportamiento por defecto de Org mode en Emacs. Si está desactivado, se conserva
                el estado de plegado de los subencabezados al desplegar el encabezado.
              </div>
            </div>
            <Switch
              isEnabled={closeSubheadersRecursively}
              onToggle={handleCloseSubheadersRecursively}
            />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Sangrar como el Emacs antiguo
              <div className="setting-label__description">
                Desactivado (recomendado): SCHEDULED, DEADLINE, CLOSED y los cajones (:PROPERTIES:,
                :LOGBOOK:) se escriben pegados al margen, como Emacs con{' '}
                <ExternalLink href="https://orgmode.org/manual/Hard-indentation.html">
                  <code>org-adapt-indentation nil</code>
                </ExternalLink>{' '}
                (lo normal desde Emacs 29). Actívalo solo si tu Emacs usa{' '}
                <code>org-adapt-indentation t</code>: entonces se sangran según el nivel del
                encabezado. El texto de las notas no se toca.
              </div>
            </div>
            <Switch isEnabled={eliIndentOnExport} onToggle={handleEliIndentOnExport} />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Guardar los ajustes en el servicio de sincronización
              <div className="setting-label__description">
                Guarda los ajustes y los atajos de teclado en un fichero .organice-config.json en tu
                servicio de sincronización para compartirlos entre varios dispositivos.
              </div>
            </div>
            <Switch
              isEnabled={shouldStoreSettingsInSyncBackend}
              onToggle={handleShouldStoreSettingsInSyncBackendChange}
            />
          </div>

          <div className="setting-container setting-container--vertical">
            <div className="setting-label">Antelación de aviso por defecto para DEADLINE</div>

            <div className="default-deadline-warning-container">
              <input
                type="number"
                min="0"
                className="textfield default-deadline-value-textfield"
                value={agendaDefaultDeadlineDelayValue}
                onChange={handleAgendaDefaultDeadlineDelayValueChange}
              />

              <TabButtons
                buttons={['h', 'd', 's', 'm', 'a']}
                values={'hdwmy'.split('')}
                titles={['Horas', 'Días', 'Semanas', 'Meses', 'Años']}
                selectedButton={agendaDefaultDeadlineDelayUnit}
                onSelect={handleAgendaDefaultDeadlineDelayUnitChange}
              />
            </div>
          </div>

          <div className="setting-container setting-container--vertical">
            <div className="setting-label">Altura del editor de descripción</div>
            <div className="setting-label__description">
              Controla la altura del editor de descripción solo en ordenadores. La altura se limita
              para que todos los botones queden siempre visibles. En móviles este ajuste se ignora y
              el editor tiene siempre 8 líneas de alto.
            </div>

            <div className="default-deadline-warning-container">
              <input
                type="number"
                min="2"
                className="textfield default-deadline-value-textfield"
                value={editorDescriptionHeightValue}
                onChange={handleEditorDescriptionHeightValueChange}
              />
            </div>
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Primer día de la semana en la agenda semanal
              <div className="setting-label__description">
                Equivale a{' '}
                <ExternalLink href="https://orgmode.org/manual/Weekly_002fdaily-agenda.html">
                  <code>org-agenda-start-on-weekday</code>
                </ExternalLink>
              </div>
            </div>
            <TabButtons
              buttons={['D', 'L', 'M', 'X', 'J', 'V', 'S', 'Hoy']}
              values={[0, 1, 2, 3, 4, 5, 6, -1]}
              titles={[
                'Domingo',
                'Lunes',
                'Martes',
                'Miércoles',
                'Jueves',
                'Viernes',
                'Sábado',
                'Hoy',
              ]}
              selectedButton={agendaStartOnWeekday}
              onSelect={handleAgendaStartOnWeekdayChange}
            />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Mostrar hoy todos los hábitos
              <div className="setting-label__description">
                Si está activado, se muestran todos los hábitos en la agenda de hoy, aunque no estén
                programados o ya estén marcados como DONE hoy. Solo se aplica al día de hoy en la
                agenda.
              </div>
            </div>
            <Switch isEnabled={orgHabitShowAllToday} onToggle={handleOrgHabitShowAllToday} />
          </div>

          <div className="setting-container setting-container--vertical">
            <div className="setting-label">
              Días anteriores en el gráfico de constancia de hábitos
            </div>
            <div className="setting-label__description">
              Número de días antes de hoy que se muestran en el gráfico de constancia de hábitos.
            </div>

            <div className="default-deadline-warning-container">
              <input
                type="number"
                min="0"
                className="textfield default-deadline-value-textfield"
                value={orgHabitPrecedingDays}
                onChange={handleOrgHabitPrecedingDaysChange}
              />
            </div>
          </div>

          <div className="setting-container setting-container--vertical">
            <div className="setting-label">
              Días posteriores en el gráfico de constancia de hábitos
            </div>
            <div className="setting-label__description">
              Número de días después de hoy que se muestran en el gráfico de constancia de hábitos.
            </div>

            <div className="default-deadline-warning-container">
              <input
                type="number"
                min="0"
                className="textfield default-deadline-value-textfield"
                value={orgHabitFollowingDays}
                onChange={handleOrgHabitFollowingDaysChange}
              />
            </div>
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Mostrar resúmenes de tiempo
              <div className="setting-label__description">
                Muestra al final de cada encabezado el tiempo total registrado en él, incluido el de
                sus subencabezados.
              </div>
            </div>
            <Switch isEnabled={showClockDisplay} onToggle={handleShowClockDisplayClick} />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Mostrar la fecha límite
              <div className="setting-label__description">
                Si está activado, la fecha límite (DEADLINE) se muestra en la línea de cada
                encabezado.
              </div>
            </div>
            <Switch isEnabled={showDeadlineDisplay} onToggle={handleShowDeadlineDisplayChange} />
          </div>

          <div className="setting-container">
            <div className="setting-label">
              Preferir el texto sin procesar
              <div className="setting-label__description">
                Al editar el título o la descripción de un encabezado, puedes alternar entre editar
                solo el texto o el contenido completo (con la representación en texto de los estados
                TODO, etiquetas, fechas, propiedades, etc.) pulsando el icono «editar título» o
                «editar descripción» de la ventana. Esta opción muestra primero el contenido
                completo en lugar de hacerlo con un segundo clic.
              </div>
            </div>
            <Switch isEnabled={preferEditRawValues} onToggle={handlePreferEditRawValues} />
          </div>
        </details>
      )}

      <div className="settings-buttons-container">
        {!notes && (
          <button className="btn settings-btn" onClick={handleCaptureTemplatesClick}>
            Plantillas de captura
          </button>
        )}
        {!notes && (
          <button className="btn settings-btn" onClick={handleKeyboardShortcutsClick}>
            Atajos de teclado
          </button>
        )}
        <button className="btn settings-btn" onClick={handleFileSettingsClick}>
          Ajustes de ficheros
        </button>
        <Link
          to="/encryption"
          className="btn settings-btn"
          onClick={() => (window.__eliCameFromSettings = true)}
        >
          <i className="fas fa-lock" /> Seguridad y cifrado
        </Link>

        {!notes && (
          <a href="capture.html" className="btn settings-btn" data-testid="eli-capture-setup">
            <i className="fas fa-share-square" /> Captura rápida (Atajos / marcador)
          </a>
        )}

        <hr className="settings-button-separator" />

        <Link to="/changelog" className="btn settings-btn">
          Novedades
          {hasUnseenChangelog && (
            <div className="changelog-badge-container">
              <i className="fas fa-gift" />
              &nbsp; ¿Qué hay de nuevo?
            </div>
          )}
        </Link>

        <Link to="/sample" className="btn settings-btn" data-testid="eli-manual">
          <i className="fas fa-book" /> Manual de uso
        </Link>

        <button className="btn settings-btn">
          <ExternalLink href="https://github.com/JakimSareb/ORGanice">
            ORGanice en GitHub
            <i className="fas fa-external-link-alt fa-sm" />
          </ExternalLink>{' '}
        </button>

        <hr className="settings-button-separator" />

        <button className="btn settings-btn" onClick={handleSignOutClick}>
          Cerrar sesión
        </button>
        <div className="eli-version" data-testid="eli-version">
          {APP_NAME} {APP_VERSION}
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state) => {
  // The default values here only relate to the settings view. To set
  // defaults which get loaded on an initial run of organice, look at
  // `util/settings_persister.js::persistableFields`.
  const agendaStartOnWeekday = state.base.get('agendaStartOnWeekday');
  return {
    fontSize: state.base.get('fontSize') || 'Regular',
    bulletStyle: state.base.get('bulletStyle'),
    shouldTapTodoToAdvance: state.base.get('shouldTapTodoToAdvance'),
    editorDescriptionHeightValue: state.base.get('editorDescriptionHeightValue') || 8,
    agendaDefaultDeadlineDelayValue: state.base.get('agendaDefaultDeadlineDelayValue') || 5,
    agendaDefaultDeadlineDelayUnit: state.base.get('agendaDefaultDeadlineDelayUnit') || 'd',
    agendaStartOnWeekday: agendaStartOnWeekday == null ? 1 : +agendaStartOnWeekday,
    shouldStoreSettingsInSyncBackend: state.base.get('shouldStoreSettingsInSyncBackend'),
    shouldLiveSync: state.base.get('shouldLiveSync'),
    showDeadlineDisplay: state.base.get('showDeadlineDisplay'),
    shouldSyncOnBecomingVisibile: state.base.get('shouldSyncOnBecomingVisibile'),
    shouldShowTitleInOrgFile: state.base.get('shouldShowTitleInOrgFile'),
    shouldLogIntoDrawer: state.base.get('shouldLogIntoDrawer'),
    closeSubheadersRecursively: state.base.get('closeSubheadersRecursively'),
    eliIndentOnExport: state.base.get('eliIndentOnExport') === true,
    eliTodoKeywordsLine: state.base.get('eliTodoKeywordsLine'),
    eliDefaultTagsLine: state.base.get('eliDefaultTagsLine'),
    eliArchiveInSubfolder: state.base.get('eliArchiveInSubfolder') === true,
    hasUnseenChangelog: state.base.get('hasUnseenChangelog'),
    showClockDisplay: state.org.present.get('showClockDisplay'),
    preferEditRawValues: state.base.get('preferEditRawValues'),
    orgHabitShowAllToday: state.base.get('orgHabitShowAllToday'),
    orgHabitPrecedingDays: state.base.get('orgHabitPrecedingDays') || 21,
    orgHabitFollowingDays: state.base.get('orgHabitFollowingDays') || 7,
    colorScheme: state.base.get('colorScheme'),
    theme: state.base.get('theme'),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    syncBackend: bindActionCreators(syncBackendActions, dispatch),
    base: bindActionCreators(baseActions, dispatch),
    org: bindActionCreators(orgActions, dispatch),
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(Settings));
