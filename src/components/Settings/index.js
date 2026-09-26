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

  // This looks like hardcoding where it would be possible to dispatch
  // on the `location.origin`, but here we assure that every instance
  // of organice has a valid link to documentation. Self-building does
  // not insure that, because building and hosting docs is not part of
  // the application itself.
  const documentationHost = window.location.origin.match(/staging.organice.200ok.ch/)
    ? 'https://staging.organice.200ok.ch'
    : 'https://organice.200ok.ch';

  const handleSignOutClick = () => {
    if (window.confirm('Are you sure you want to sign out?')) {
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
        <div className="setting-label">Font size</div>
        <TabButtons
          buttons={['Regular', 'Large']}
          selectedButton={fontSize}
          onSelect={handleFontSizeChange}
        />
      </div>

      <div className="setting-container">
        <div className="setting-label">Color scheme</div>
        <TabButtons
          buttons={['OS', 'Light', 'Dark']}
          selectedButton={colorScheme}
          onSelect={handleColorSchemeClick}
        />
      </div>

      <div className="setting-container">
        <div className="setting-label">Theme</div>
        <TabButtons
          buttons={['Solarized', 'One', 'Gruvbox', 'Smyck', 'Code']}
          selectedButton={theme}
          onSelect={handleThemeClick}
        />
      </div>

      <div className="setting-container">
        <div className="setting-label">Bullet style</div>
        <TabButtons
          buttons={['Classic', 'Fancy']}
          selectedButton={bulletStyle}
          onSelect={handleBulletStyleChange}
        />
      </div>

      <div className="setting-container">
        <div className="setting-label">Tap TODO to advance state</div>
        <Switch isEnabled={shouldTapTodoToAdvance} onToggle={handleShouldTapTodoToAdvanceChange} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Live sync
          <div className="setting-label__description">
            If enabled, changes are automatically pushed to the sync backend as you make them.
          </div>
        </div>
        <Switch isEnabled={shouldLiveSync} onToggle={handleShouldLiveSyncChange} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Sync on application becoming visible
          <div className="setting-label__description">
            If enabled, the current org file is pulled from the sync backend when the browser tab
            becomes visible. This prevents you from having a stale file before starting to make
            changes to it.
          </div>
        </div>
        <Switch
          isEnabled={shouldSyncOnBecomingVisibile}
          onToggle={handleShouldSyncOnBecomingVisibleChange}
        />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Show Org filename as Title
          <div className="setting-label__description">
            When in an Org file view, it shows the filename in the HeaderBar.
          </div>
        </div>
        <Switch isEnabled={shouldShowTitleInOrgFile} onToggle={handleShouldShowTitleInOrgFile} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Log into LOGBOOK drawer when item repeats
          <div className="setting-label__description">
            Log TODO state changes (currently only for repeating items) into the LOGBOOK drawer
            instead of into the body of the heading (default). See the Orgmode documentation on{' '}
            <ExternalLink href="https://www.gnu.org/software/emacs/manual/html_node/org/Tracking-TODO-state-changes.html">
              <code>org-log-into-drawer</code>
            </ExternalLink>{' '}
            for more information.
          </div>
        </div>
        <Switch isEnabled={shouldLogIntoDrawer} onToggle={handleShouldLogIntoDrawer} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          When folding a header, fold all subheaders too
          <div className="setting-label__description">
            When folding a header, fold recursively all its subheaders, so that when the header is
            reopened all subheaders are folded, regardless of their state prior to folding. This is
            the default in Emacs Org mode. If this turned off, the fold-state of the subheaders is
            preserved when the header is unfolded.
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
            <code>org-adapt-indentation t</code>: entonces se sangran según el nivel del encabezado.
            El texto de las notas no se toca.
          </div>
        </div>
        <Switch isEnabled={eliIndentOnExport} onToggle={handleEliIndentOnExport} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Store settings in sync backend
          <div className="setting-label__description">
            Store settings and keyboard shortcuts in a .organice-config.json file in your sync
            backend to sync between multiple devices.
          </div>
        </div>
        <Switch
          isEnabled={shouldStoreSettingsInSyncBackend}
          onToggle={handleShouldStoreSettingsInSyncBackendChange}
        />
      </div>

      <div className="setting-container setting-container--vertical">
        <div className="setting-label">Default DEADLINE warning period</div>

        <div className="default-deadline-warning-container">
          <input
            type="number"
            min="0"
            className="textfield default-deadline-value-textfield"
            value={agendaDefaultDeadlineDelayValue}
            onChange={handleAgendaDefaultDeadlineDelayValueChange}
          />

          <TabButtons
            buttons={'hdwmy'.split('')}
            selectedButton={agendaDefaultDeadlineDelayUnit}
            onSelect={handleAgendaDefaultDeadlineDelayUnitChange}
          />
        </div>
      </div>

      <div className="setting-container setting-container--vertical">
        <div className="setting-label">Description editor height</div>
        <div className="setting-label__description">
          This setting controls the height of the description editor on computers only. The height
          will be limited to ensure that all buttons are always visible. On mobile devices this
          setting is ignored and the editor will always be 8 rows high.
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
          Start of week for weekly agenda
          <div className="setting-label__description">
            Akin to{' '}
            <ExternalLink href="https://orgmode.org/manual/Weekly_002fdaily-agenda.html">
              <code>org-agenda-start-on-weekday</code>
            </ExternalLink>
          </div>
        </div>
        <TabButtons
          buttons={['S', 'M', 'T', 'W', 'T', 'F', 'S', 'Today']}
          values={[0, 1, 2, 3, 4, 5, 6, -1]}
          titles={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']}
          selectedButton={agendaStartOnWeekday}
          onSelect={handleAgendaStartOnWeekdayChange}
        />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Show all habits today
          <div className="setting-label__description">
            When enabled, all habits are shown in today's agenda view, even if not scheduled or
            already marked as DONE today. Only applies to today's date in the agenda.
          </div>
        </div>
        <Switch isEnabled={orgHabitShowAllToday} onToggle={handleOrgHabitShowAllToday} />
      </div>

      <div className="setting-container setting-container--vertical">
        <div className="setting-label">Habit consistency graph preceding days</div>
        <div className="setting-label__description">
          The number of days before today that will be shown in the habit consistency graph.
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
        <div className="setting-label">Habit consistency graph following days</div>
        <div className="setting-label__description">
          The number of days after today that will be shown in the habit consistency graph.
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
          Display time summaries
          <div className="setting-label__description">
            This puts overlays at the end of each headline, showing the total time recorded under
            that heading, including the time of any subheadings.
          </div>
        </div>
        <Switch isEnabled={showClockDisplay} onToggle={handleShowClockDisplayClick} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Show Deadline Display
          <div className="setting-label__description">
            If enabled, the deadline will displayed on each header line.
          </div>
        </div>
        <Switch isEnabled={showDeadlineDisplay} onToggle={handleShowDeadlineDisplayChange} />
      </div>

      <div className="setting-container">
        <div className="setting-label">
          Prefer raw values
          <div className="setting-label__description">
            When editing title or description of a header, you can switch between editing the text
            part or the full content (including text representation of todo keywords, tags, schedule
            items, properties etc.) by clicking the "edit title" or "edit description" icon in the
            popup. This option allows you to view the full content first instead of on a second
            click.
          </div>
        </div>
        <Switch isEnabled={preferEditRawValues} onToggle={handlePreferEditRawValues} />
      </div>

      <div className="settings-buttons-container">
        <button className="btn settings-btn" onClick={handleCaptureTemplatesClick}>
          Capture templates
        </button>
        <button className="btn settings-btn" onClick={handleKeyboardShortcutsClick}>
          Keyboard shortcuts
        </button>
        <button className="btn settings-btn" onClick={handleFileSettingsClick}>
          File settings
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
          Changelog
          {hasUnseenChangelog && (
            <div className="changelog-badge-container">
              <i className="fas fa-gift" />
              &nbsp; What's New?
            </div>
          )}
        </Link>

        <Link to="/sample" className="btn settings-btn">
          Help
        </Link>

        <button className="btn settings-btn">
          <ExternalLink href={`${documentationHost}/documentation.html`}>
            Documentation
            <i className="fas fa-external-link-alt fa-sm" />
          </ExternalLink>{' '}
        </button>

        <button className="btn settings-btn">
          <ExternalLink href="https://github.com/200ok-ch/organice">
            Github repo
            <i className="fas fa-external-link-alt fa-sm" />
          </ExternalLink>{' '}
        </button>

        <hr className="settings-button-separator" />

        <button className="btn settings-btn" onClick={handleSignOutClick}>
          Sign out
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
