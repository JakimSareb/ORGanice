import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { withRouter, Link, useHistory } from 'react-router-dom';

import * as syncBackendActions from '../../actions/sync_backend';
import * as baseActions from '../../actions/base';
import * as orgActions from '../../actions/org';

import './stylesheet.css';

import TabButtons from '../UI/TabButtons';
import Switch from '../UI/Switch';
import ExternalLink from '../UI/ExternalLink';
import { APP_NAME, APP_VERSION } from '../../lib/eli_app_name';
import {
  DEFAULT_TODO_LINE,
  DEFAULT_TAGS_LINE,
  parseTodoLine,
  parseTagsLine,
} from '../../lib/eli_todo_defaults';

// ORG Mode para Eli: campo de texto que se guarda al salir de él (o con Intro)
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
  shouldLogIntoDrawer,
  closeSubheadersRecursively,
  eliIndentOnExport,
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

  const handleShouldLogIntoDrawer = () => base.setShouldLogIntoDrawer(!shouldLogIntoDrawer);

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
    <div className="settings-container">
      <details className="eli-settings-section" open data-testid="eli-settings-appearance">
        <summary>
          <span className="eli-settings-section__title">Apariencia</span>
          <span className="eli-settings-section__hint">Tema, colores, letra y viñetas</span>
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

        <div className="setting-container setting-container--vertical eli-theme-setting">
          <div className="setting-label">Tema</div>
          <TabButtons
            buttons={['Unicornio', 'Cuki', 'Solarized']}
            selectedButton={theme}
            onSelect={handleThemeClick}
          />
        </div>

        <div className="setting-container">
          <div className="setting-label">Estilo de viñetas</div>
          <TabButtons
            buttons={['Clásico', 'Decorado']}
            values={['Classic', 'Fancy']}
            selectedButton={bulletStyle}
            onSelect={handleBulletStyleChange}
          />
        </div>
      </details>

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
      </details>

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
              Si está activado, los cambios se envían automáticamente al servicio de sincronización
              a medida que los haces.
            </div>
          </div>
          <Switch isEnabled={shouldLiveSync} onToggle={handleShouldLiveSyncChange} />
        </div>

        <div className="setting-container">
          <div className="setting-label">
            Sincronizar al volver a la aplicación
            <div className="setting-label__description">
              Si está activado, el fichero org actual se descarga del servicio de sincronización
              cuando la pestaña del navegador vuelve a estar visible. Así evitas trabajar sobre una
              versión desactualizada del fichero.
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
          <Switch isEnabled={shouldShowTitleInOrgFile} onToggle={handleShouldShowTitleInOrgFile} />
        </div>

        <div className="setting-container">
          <div className="setting-label">
            Registrar en el cajón LOGBOOK cuando la tarea se repite
            <div className="setting-label__description">
              Registra los cambios de estado TODO (por ahora solo en tareas repetitivas) en el cajón
              LOGBOOK en lugar de en el cuerpo del encabezado (opción por defecto). Consulta la
              documentación de Org sobre{' '}
              <ExternalLink href="https://www.gnu.org/software/emacs/manual/html_node/org/Tracking-TODO-state-changes.html">
                <code>org-log-into-drawer</code>
              </ExternalLink>{' '}
              para más información.
            </div>
          </div>
          <Switch isEnabled={shouldLogIntoDrawer} onToggle={handleShouldLogIntoDrawer} />
        </div>

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
              «editar descripción» de la ventana. Esta opción muestra primero el contenido completo
              en lugar de hacerlo con un segundo clic.
            </div>
          </div>
          <Switch isEnabled={preferEditRawValues} onToggle={handlePreferEditRawValues} />
        </div>
      </details>

      <div className="settings-buttons-container">
        <button className="btn settings-btn" onClick={handleCaptureTemplatesClick}>
          Plantillas de captura
        </button>
        <button className="btn settings-btn" onClick={handleKeyboardShortcutsClick}>
          Atajos de teclado
        </button>
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

        <a href="capture.html" className="btn settings-btn" data-testid="eli-capture-setup">
          <i className="fas fa-share-square" /> Captura rápida (Atajos / marcador)
        </a>

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
