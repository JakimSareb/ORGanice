import { Map, List, Set, fromJS } from 'immutable';
import _ from 'lodash';

import { getOpenHeaderPaths } from '../lib/org_utils';

import { restoreBaseSettings, setEliSetting } from '../actions/base';
import { restoreCaptureSettings } from '../actions/capture';
import { restoreFileSettings, eliRefreshAllOrgFiles } from '../actions/org';

import generateId from '../lib/id_generator';
import { loadFilesFromLocalStorage } from './file_persister';
import {
  readStamps,
  writeStamps,
  collectLocalPrefs,
  mergeSettings,
  installPrefsWatcher,
  applyRemotePrefs,
  withRemoteApply,
  setPrefsReady,
  isApplyingRemote,
  canonical,
} from '../lib/eli_synced_prefs';
import { logSyncEvent } from '../lib/eli_sync_log';
import { BASE_DEFAULTS, ORG_DEFAULTS } from '../lib/eli_defaults';

export const localStorageAvailable = (() => {
  try {
    localStorage.setItem('test', 'test');
    const localStorageRes = localStorage.getItem('test') === 'test';
    localStorage.removeItem('test');
    return localStorageRes && localStorage;
  } catch (e) {
    return false;
  }
})();

/**
 * GitLab doesn't allow updating a file that doesn't exist or creating one that already exists, so
 * need to figure out which to do.
 */
const updateConfigForGitLab = async (client, contents) => {
  const filename = '/.organice-config.json';
  let exists = false;
  try {
    const existingContents = await client.getFileContents(filename);
    exists = true;
    // INFO: Not calling syncBackendClient.createFile is a
    // workaround for
    // https://github.com/200ok-ch/organice/issues/736
    if (existingContents === contents) {
      return;
    }
  } catch {
    // Error is (presumably) because file doesn't exist. Unfortunately this isn't perfect because it
    // could have failed due to e.g. a network issue.
  }
  if (exists) {
    await client.updateFile(filename, contents);
  } else {
    await client.createFile(filename, contents);
  }
};

// ORG Mode para Eli (2.15): si no se pudieron leer los ajustes del servidor (fallo pasajero), no
// se suben los de aquí encima (se perderían los guardados allí)
let eliConfigLoadFailed = false;
// (4.33) Hasta haber leído el fichero no se sube nada (antes, un cambio al arrancar podía subir los
// ajustes viejos de este dispositivo encima de los del fichero)
let eliConfigReady = false;
let eliStore = null;
const CONFIG_PATH = '/.organice-config.json';

const parseConfig = (contents) => (typeof contents === 'string' ? JSON.parse(contents) : contents);

const writeConfig = (client, contents) => {
  switch (client.type) {
    case 'Dropbox':
    case 'WebDAV':
    case 'LocalFolder':
      return client.createFile(CONFIG_PATH, contents);
    case 'GitLab':
      return updateConfigForGitLab(client, contents);
    default:
      return Promise.resolve();
  }
};

// (4.33) Subir = leer el fichero, fusionar por clave (gana lo más reciente de cada ajuste) y
// escribir el resultado. Así un dispositivo que lleva horas abierto no pisa lo que se cambió en otro.
const eliPushMergedConfig = async () => {
  const store = eliStore;
  if (!store || eliConfigLoadFailed || !eliConfigReady) return;
  const client = store.getState().syncBackend.get('client');
  if (!client || !store.getState().base.get('shouldStoreSettingsInSyncBackend')) return;
  let remote = null;
  try {
    remote = parseConfig(await client.getFileContents(CONFIG_PATH));
  } catch (error) {
    // sin motivo = no existe todavía (se crea); con motivo = no se sube nada ahora
    if (error) {
      logSyncEvent({ file: CONFIG_PATH, op: 'ajustes (leer)', error });
      return;
    }
  }
  if (remote && typeof remote === 'object')
    applyRemoteConfig(store.dispatch, store.getState, remote);
  const contents = getConfigFileContents(getFieldsToPersist(store.getState(), persistableFields));
  window.previousSettingsFileContents = contents;
  if (remote && canonical(remote) === canonical(JSON.parse(contents))) return;
  try {
    await writeConfig(client, contents);
  } catch (error) {
    logSyncEvent({ file: CONFIG_PATH, op: 'ajustes (subir)', error });
    alert(`There was an error trying to push settings to your sync backend: ${error}`);
  }
};

const debouncedPushConfigToSyncBackend = _.debounce(
  () => {
    eliPushMergedConfig();
  },
  1000,
  { maxWait: 3000 }
);

export const persistableFields = [
  {
    category: 'base',
    name: 'fontSize',
    type: 'nullable',
    // (4.54) el tamaño de letra es de cada dispositivo: se guarda aquí pero NO viaja en el fichero
    local: true,
  },
  {
    category: 'base',
    name: 'bulletStyle',
    type: 'nullable',
    default: 'Fancy',
  },
  {
    category: 'base',
    name: 'shouldTapTodoToAdvance',
    type: 'boolean',
  },

  {
    category: 'base',
    name: 'agendaDefaultDeadlineDelayUnit',
    type: 'nullable',
  },
  {
    category: 'base',
    name: 'agendaDefaultDeadlineDelayValue',
    type: 'nullable',
  },
  {
    category: 'base',
    name: 'editorDescriptionHeightValue',
    type: 'nullable',
    default: '8',
  },
  {
    category: 'base',
    name: 'agendaStartOnWeekday',
    type: 'nullable',
    default: 1,
  },

  {
    category: 'base',
    name: 'shouldStoreSettingsInSyncBackend',
    type: 'boolean',
    default: true,
  },
  {
    category: 'base',
    name: 'lastSeenChangelogHash',
    type: 'nullable',
  },
  {
    category: 'base',
    name: 'customKeybindings',
    type: 'json',
  },
  {
    category: 'base',
    name: 'shouldLiveSync',
    type: 'boolean',
    default: true,
  },
  {
    category: 'base',
    name: 'showDeadlineDisplay',
    type: 'boolean',
    default: false,
  },
  {
    category: 'base',
    name: 'shouldSyncOnBecomingVisibile',
    type: 'boolean',
    default: true,
  },
  {
    category: 'base',
    name: 'shouldShowTitleInOrgFile',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'shouldLogIntoDrawer',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'closeSubheadersRecursively',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'shouldNotIndentOnExport',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliIndentOnExport',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliTodoKeywordsLine',
    type: 'string',
  },
  {
    category: 'base',
    name: 'eliAllOrgFiles',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliExcludedFolders',
    type: 'string',
  },
  {
    category: 'base',
    name: 'eliDefaultTagsLine',
    type: 'string',
  },
  {
    category: 'base',
    name: 'eliArchiveInSubfolder',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliPagesFile',
    type: 'string',
  },
  // (4.46) carpeta del Zettelkasten (por defecto ZK/ junto al fichero de entrada)
  {
    category: 'base',
    name: 'eliZkFolder',
    type: 'string',
  },
  // (4.51) carpeta de la Wiki Divio (por defecto wiki/ junto al fichero de entrada)
  {
    category: 'base',
    name: 'eliWikiDir',
    type: 'string',
  },
  // (4.47) Revisión ZK como último paso de la Revisión semanal (apagado por defecto)
  {
    category: 'base',
    name: 'eliZkWeeklyReview',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliNoHashTagTitle',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliSlashMenu',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliNoSwipeDocs',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliNoSwipeGtd',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'eliGtdSections',
    type: 'json',
  },
  {
    category: 'org',
    name: 'showClockDisplay',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'colorScheme',
    type: 'string',
    default: 'OS',
  },
  {
    category: 'base',
    name: 'theme',
    type: 'string',
    default: 'Solarized',
  },
  {
    category: 'capture',
    name: 'captureTemplates',
    type: 'json',
    default: List(),
  },
  {
    category: 'org',
    name: 'fileSettings',
    type: 'json',
    default: List(),
  },
  {
    category: 'base',
    name: 'agendaTimeframe',
    type: 'string',
    default: 'Week',
  },
  {
    category: 'base',
    name: 'preferEditRawValues',
    type: 'boolean',
  },
  {
    category: 'base',
    name: 'orgHabitShowAllToday',
    type: 'boolean',
    default: false,
  },
  {
    category: 'base',
    name: 'orgHabitPrecedingDays',
    type: 'number',
    default: 21,
  },
  {
    category: 'base',
    name: 'orgHabitFollowingDays',
    type: 'number',
    default: 7,
  },
  {
    category: 'org',
    name: 'bookmarks',
    type: 'json',
    default: Map({
      search: List(),
      'task-list': List(),
      refile: List(),
    }),
  },
];

// (4.37) Valores por defecto = los de lib/eli_defaults.js (única fuente de verdad)
persistableFields.forEach((field) => {
  const d = (field.category === 'org' ? ORG_DEFAULTS : BASE_DEFAULTS)[field.name];
  if (d !== undefined) field.default = d;
});

export const readOpennessState = () => {
  const opennessStateJSONString = localStorage.getItem('headerOpenness');
  return !!opennessStateJSONString ? JSON.parse(opennessStateJSONString) : null;
};

const getFieldsToPersist = (state, fields) => {
  return fields
    .filter((field) => !field.depreacted)
    .filter((field) => field.category === 'org')
    .map((field) =>
      field.type === 'json'
        ? [field.name, JSON.stringify(state.org.present.get(field.name) || field.default || {})]
        : [field.name, state.org.present.get(field.name)]
    )
    .concat(
      persistableFields
        .filter((field) => field.category !== 'org')
        .map((field) => {
          return field.type === 'json'
            ? [
                field.name,
                JSON.stringify(state[field.category].get(field.name) || field.default || {}),
              ]
            : field.type === 'boolean'
            ? // ORG Mode para Eli: «false» también se guarda (4.37: con defecto encendido, un
              // «false» guardado NO vuelve a «true»)
              [
                field.name,
                state[field.category].get(field.name) === undefined
                  ? !!field.default
                  : !!state[field.category].get(field.name),
              ]
            : [field.name, state[field.category].get(field.name) || field.default];
        })
    );
};

const persistableNames = () => persistableFields.map((f) => f.name);
// (4.54) ajustes que NO viajan en el fichero de ajustes (propios de cada dispositivo)
const isLocalField = (name) => persistableFields.some((f) => f.name === name && f.local);
const syncedNames = () => persistableNames().filter((n) => !isLocalField(n));

// (4.33) Además de los ajustes de organice: sus marcas de tiempo (`eliStamps`) y los ajustes de la
// app con la suya (`eliPrefs`)
const getConfigFileContents = (allFieldsToPersist) => {
  const fieldsToPersist = allFieldsToPersist.filter(([name]) => !isLocalField(name));
  const names = syncedNames();
  const stamps = localStorageAvailable ? readStamps() : {};
  const eliStamps = _.pick(stamps, names);
  const eliPrefs = localStorageAvailable ? collectLocalPrefs(names, stamps) : {};
  return JSON.stringify({ ..._.fromPairs(fieldsToPersist), eliStamps, eliPrefs }, null, 2);
};

// Valores actuales de los ajustes de organice (texto), para ver cuáles cambian
let eliPrevValues = null;
const fieldValues = (fieldsToPersist) =>
  _.fromPairs(fieldsToPersist.map(([name, value]) => [name, String(value)]));

// (4.33) Aplica el fichero de ajustes fusionando por clave
const applyRemoteConfig = (dispatch, getState, config) => {
  const names = syncedNames();
  const stamps = readStamps();
  const merged = mergeSettings({
    remote: config,
    localStamps: stamps,
    localPrefs: collectLocalPrefs(names, stamps),
    fieldNames: names,
  });
  const cfg = _.pick(config, merged.fieldsFromRemote);
  withRemoteApply(() => {
    try {
      if (Object.keys(cfg).length) {
        dispatch(restoreBaseSettings(cfg));
        if (cfg.captureTemplates !== undefined) dispatch(restoreCaptureSettings(cfg));
        if (cfg.fileSettings !== undefined) dispatch(restoreFileSettings(cfg));
      }
    } catch (_error) {
      // Algo del fichero no se ha podido leer: se queda lo de aquí (y se subirá)
    }
  });
  writeStamps(merged.stamps);
  eliPrevValues = fieldValues(getFieldsToPersist(getState(), persistableFields));
  if (applyRemotePrefs(merged.prefsFromRemote)) dispatch(setEliSetting('eliPrefsRev', Date.now()));
};

export const applyCategorySettingsFromConfig = (state, config, category) => {
  persistableFields
    .filter((field) => field.category === category)
    .forEach((field) => {
      // Only set value if it exists in config to avoid overwriting localStorage values with undefined
      if (config[field.name] !== undefined) {
        field.type === 'json'
          ? (state = state.set(field.name, fromJS(JSON.parse(config[field.name]))))
          : (state = state.set(field.name, config[field.name]));
      }
    });

  return state;
};

export const applyCaptureSettingsFromConfig = (state, config) => {
  const captureTemplates = fromJS(JSON.parse(config.captureTemplates)).map((template) =>
    template.set('id', generateId())
  );

  return state.set('captureTemplates', captureTemplates);
};
export const applyFileSettingsFromConfig = (state, config) => {
  const fileSettings = fromJS(JSON.parse(config.fileSettings)).map((setting) =>
    setting.set('id', generateId())
  );

  return state.set('fileSettings', fileSettings);
};

const getInitialStateWithDefaultValues = () => {
  let initialState = {
    syncBackend: Map(),
    org: {
      past: [],
      present: Map({
        files: Map(),
        fileSettings: [],
        opennessState: Map(),
        search: Map({
          searchFilter: '',
          searchFilterExpr: [],
        }),
        bookmarks: Map({
          search: List(),
          'task-list': List(),
          refile: List(),
        }),
      }),
      future: [],
    },
    base: Map({ isLoading: Set(), finderTab: 'Search' }),
    capture: Map(),
  };

  persistableFields.forEach((field) => {
    const value = field.default;

    if (field.category === 'org') {
      initialState[field.category].present = initialState[field.category].present.set(
        field.name,
        value
      );
    } else {
      initialState[field.category] = initialState[field.category].set(field.name, value);
    }
  });

  return initialState;
};

const loadContentFromLocalStorage = (initialState) => {
  persistableFields.forEach((field) => {
    let value = localStorage.getItem(field.name);
    // (4.37) clave nunca guardada: se queda el valor por defecto (y un «false» guardado se respeta)
    const neverStored = value === null || value === undefined;

    if (field.type === 'nullable') {
      if (value === 'null') {
        value = null;
      }
    } else if (field.type === 'boolean') {
      value = value === 'true';
    } else if (field.type === 'number') {
      if (value) {
        value = parseInt(value, 10);
      }
    } else if (field.type === 'json') {
      if (!value) {
        value = field.default || Map();
      } else {
        value = fromJS(JSON.parse(value));
      }
    }
    // When nothing has been saved to localStorage before, keep the default.
    if (field.type === 'boolean') {
      if (neverStored && field.default !== undefined) value = field.default;
    } else {
      value = value || field.default;
    }

    if (field.category === 'org') {
      initialState[field.category].present = initialState[field.category].present.set(
        field.name,
        value
      );
    } else {
      initialState[field.category] = initialState[field.category].set(field.name, value);
    }
  });

  // Assign new ids to the capture templates.
  if (initialState.capture.get('captureTemplates')) {
    initialState.capture = initialState.capture.update('captureTemplates', (templates) =>
      templates.map((template) => template.set('id', generateId()))
    );
  }
  // Assign new ids to the file settings.
  if (initialState.org.present.get('fileSettings')) {
    initialState.org.present = initialState.org.present.update('fileSettings', (settings) =>
      settings.map((setting) => setting.set('id', generateId()))
    );
  }

  const opennessState = readOpennessState();
  if (!!opennessState) {
    initialState.org.present = initialState.org.present.set('opennessState', fromJS(opennessState));
  }

  // Cache the config file contents locally so we don't overwrite on
  // initial page load.
  window.previousSettingsFileContents = getConfigFileContents(
    getFieldsToPersist(initialState, persistableFields)
  );

  return loadFilesFromLocalStorage(initialState);
};

export const readInitialState = () => {
  let initialState = getInitialStateWithDefaultValues();

  return localStorageAvailable ? loadContentFromLocalStorage(initialState) : initialState;
};

export const loadSettingsFromConfigFile = (dispatch, getState) => {
  const syncBackendClient = getState().syncBackend.get('client');
  if (!syncBackendClient) {
    return;
  }

  let fileContentsPromise = null;
  switch (syncBackendClient.type) {
    case 'Dropbox':
    case 'GitLab':
    case 'WebDAV':
    case 'LocalFolder':
      fileContentsPromise = syncBackendClient.getFileContents('/.organice-config.json');
      break;
    default:
  }

  fileContentsPromise
    .then((configFileContents) => {
      eliConfigLoadFailed = false;
      let config = null;
      try {
        /* Rationale for the type check:
          When loading the settings file, `configFileContents` is
          sometimes already an object. Therefore, when JSON.parse is
          run, it throws an error which is silently swallowed by the
          catch below. This appears to be the cause of
          https:github.com/200ok-ch/organice/issues/472. Settings will
          never load from file and default config always loads.
          */
        config = parseConfig(configFileContents);
      } catch (_error) {
        // Something went wrong parsing the config file, but we don't care, we'll just
        // overwrite it with a good local copy.
      }
      if (config && typeof config === 'object') applyRemoteConfig(dispatch, getState, config);
      eliSettingsLoaded(getState, config);
    })
    .catch((error) => {
      // Sin motivo = no existe (se creará con los ajustes de aquí). Con motivo (red, Dropbox…):
      // no se sube nada hasta la próxima vez que se lean bien
      if (error) {
        eliConfigLoadFailed = true;
        logSyncEvent({ file: CONFIG_PATH, op: 'ajustes (leer)', error });
      } else eliSettingsLoaded(getState, null);
    })
    // ORG Mode para Eli: con «todos los ficheros .org», buscar los nuevos después de restaurar
    // los ajustes (si no, la restauración pisaría la lista recién actualizada)
    .then(() => dispatch(eliRefreshAllOrgFiles({ force: true })));
};

// (4.33) Leído el fichero (o no existe): ya se puede subir. Si lo de aquí (fusionado) no coincide
// con el fichero, se sube una vez (así le llegan a los demás los ajustes y marcas de este).
const eliSettingsLoaded = (getState, config) => {
  eliConfigReady = true;
  setPrefsReady(true);
  if (!localStorageAvailable) return;
  const contents = getConfigFileContents(getFieldsToPersist(getState(), persistableFields));
  // Sin fichero: se crea con el primer cambio (como antes)
  const same = !config || canonical(config) === canonical(JSON.parse(contents));
  window.previousSettingsFileContents = same ? contents : null;
  if (!same && getState().base.get('shouldStoreSettingsInSyncBackend'))
    debouncedPushConfigToSyncBackend();
};

export const subscribeToChanges = (store) => {
  if (!localStorageAvailable) {
    return () => {};
  } else {
    eliStore = store;
    eliPrevValues = fieldValues(getFieldsToPersist(store.getState(), persistableFields));
    const persist = () => {
      const state = store.getState();

      const fieldsToPersist = getFieldsToPersist(state, persistableFields);

      fieldsToPersist.forEach(([name, value]) => {
        if (name && (value || value === false)) localStorage.setItem(name, value);
      });

      // (4.33) hora del cambio de cada ajuste de organice (no al llegar del fichero)
      const values = fieldValues(fieldsToPersist);
      const changed = Object.keys(values).filter(
        (n) => eliPrevValues && eliPrevValues[n] !== undefined && eliPrevValues[n] !== values[n]
      );
      eliPrevValues = values;
      const remoteNow = isApplyingRemote();
      if (changed.length && !remoteNow) {
        const st = readStamps();
        changed.forEach((n) => (st[n] = Date.now()));
        writeStamps(st);
      }

      if (state.base.get('shouldStoreSettingsInSyncBackend')) {
        const settingsFileContents = getConfigFileContents(fieldsToPersist);

        // (4.33) antes de leer el fichero no se sube (ni se da por subido)
        if (
          eliConfigReady &&
          !remoteNow &&
          window.previousSettingsFileContents !== settingsFileContents
        ) {
          debouncedPushConfigToSyncBackend();
          window.previousSettingsFileContents = settingsFileContents;
        }
      }

      const currentFilePath = state.org.present.get('path');
      const headers = state.org.present.getIn(['files', currentFilePath, 'headers']);
      if (!!currentFilePath && headers) {
        const openHeaderPaths = getOpenHeaderPaths(headers);

        let opennessState = {};
        const opennessStateJSONString = localStorage.getItem('headerOpenness');
        if (opennessStateJSONString) {
          opennessState = JSON.parse(opennessStateJSONString);
        }

        opennessState[currentFilePath] = openHeaderPaths;
        localStorage.setItem('headerOpenness', JSON.stringify(opennessState));
      }
    };
    // (4.33) los ajustes de la app (localStorage `eli…`) también se suben al cambiar
    installPrefsWatcher({ redux: persistableNames(), changed: () => persist() });
    return persist;
  }
};

export const persistField = (field, value) => {
  if (!localStorageAvailable) {
    return;
  } else {
    localStorage.setItem(field, value);
  }
};

export const getPersistedField = (field, nullable = false) => {
  if (!localStorageAvailable) {
    return null;
  } else {
    const value = localStorage.getItem(field);
    if (nullable) {
      return value === 'null' ? null : value;
    } else {
      return value;
    }
  }
};
