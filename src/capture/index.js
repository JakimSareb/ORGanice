// ORG Mode para Eli: página de captura rápida (capture.html).
// Recibe un enlace (desde un Atajo de iOS o un marcador), se conecta al Dropbox indicado por la
// App key del enlace y añade una entrada con la plantilla de captura de organice.
// Cada App key es un "entorno" independiente: su propio permiso de Dropbox en este navegador.
import { Dropbox, DropboxAuth } from 'dropbox';
import './capture.css';
import {
  parseCaptureParams,
  findTemplate,
  templatesFromConfig,
  defaultHeadline,
  buildEntry,
  insertEntry,
} from './capture_core';
import {
  isEncryptedPath,
  isBinaryEncryptedPath,
  decryptFile,
  encryptFile,
} from '../lib/eli_crypto';

const PENDING = 'eliCapturePending';
const tokenKey = (appKey) => `eliCapture.${appKey}.refresh`;
const verifierKey = (appKey) => `eliCapture.${appKey}.verifier`;
const REDIRECT = window.location.origin + window.location.pathname;

const ls = {
  get: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch (e) {}
  },
  del: (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch (e) {}
  },
};

const $ = (sel) => document.querySelector(sel);
const root = () => $('#capture');
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  });
  children.flat().forEach((c) => c != null && e.append(c.nodeType ? c : String(c)));
  return e;
};
const show = (...nodes) => {
  root().replaceChildren(...nodes);
};
const shortKey = (k) => (k.length > 6 ? `${k.slice(0, 3)}…${k.slice(-3)}` : k);

const header = (subtitle) =>
  el(
    'div',
    { class: 'cap__head' },
    el('div', { class: 'cap__brand' }, 'ORGanice · Captura'),
    subtitle ? el('div', { class: 'cap__sub' }, subtitle) : null
  );

const errorView = (message, extra) =>
  show(header(), el('div', { class: 'cap__error' }, message), extra || null);

// ---------------------------------------------------------------------------
// Dropbox (PKCE) por App key

const startAuth = async (appKey, capture) => {
  const auth = new DropboxAuth({ clientId: appKey, fetch: fetch.bind(window) });
  const url = await auth.getAuthenticationUrl(
    REDIRECT,
    undefined,
    'code',
    'offline',
    undefined,
    undefined,
    true
  );
  ls.set(verifierKey(appKey), auth.codeVerifier);
  // La captura pendiente viaja en sessionStorage durante el viaje a Dropbox
  try {
    window.sessionStorage.setItem(PENDING, JSON.stringify(capture));
  } catch (e) {}
  window.location.href = url;
};

const finishAuth = async (appKey, code) => {
  const auth = new DropboxAuth({ clientId: appKey, fetch: fetch.bind(window) });
  auth.setCodeVerifier(ls.get(verifierKey(appKey)));
  const res = await auth.getAccessTokenFromCode(REDIRECT, code);
  ls.set(tokenKey(appKey), res.result.refresh_token);
  ls.del(verifierKey(appKey));
};

const clientFor = (appKey) => {
  const refreshToken = ls.get(tokenKey(appKey));
  if (!refreshToken) return null;
  const dbx = new Dropbox({ clientId: appKey, fetch: fetch.bind(window) });
  dbx.auth.setRefreshToken(refreshToken);
  return dbx;
};

const isNotFound = (e) => {
  const s = JSON.stringify((e && e.error) || e || '');
  return /not_found/.test(s);
};

const readFile = async (dbx, path) => {
  try {
    const res = await dbx.filesDownload({ path });
    const blob = res.result.fileBlob;
    const data = isBinaryEncryptedPath(path)
      ? new Uint8Array(await blob.arrayBuffer())
      : await blob.text();
    const text = isEncryptedPath(path) ? await decryptFile(path, data) : data;
    return { text, rev: res.result.rev };
  } catch (e) {
    if (isNotFound(e)) return { text: null, rev: null };
    throw e;
  }
};

const writeFile = async (dbx, path, text, rev) => {
  const contents = isEncryptedPath(path) ? await encryptFile(path, text) : text;
  await dbx.filesUpload({
    path,
    contents,
    mode: rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' },
    autorename: false,
  });
};

const loadTemplates = async (dbx) => {
  const { text } = await readFile(dbx, '/.organice-config.json');
  return text ? templatesFromConfig(text) : [];
};

// ---------------------------------------------------------------------------
// Vistas

const connectView = (capture) =>
  show(
    header(`Entorno ${shortKey(capture.appKey)}`),
    el(
      'p',
      {},
      'Esta captura necesita permiso para escribir en el Dropbox de este entorno. Se hace una vez en cada navegador.'
    ),
    el(
      'button',
      { class: 'cap__btn cap__btn--primary', onclick: () => startAuth(capture.appKey, capture) },
      'Conectar con Dropbox'
    ),
    el(
      'p',
      { class: 'cap__hint' },
      'Si Dropbox dice que la dirección de retorno no es válida, añade esta en la app de Dropbox ',
      '(Settings → OAuth 2 → Redirect URIs): ',
      el('code', {}, REDIRECT)
    )
  );

const doSave = async ({ dbx, capture, template, target, headline, note, button, status }) => {
  if (button) button.disabled = true;
  if (status) status.textContent = 'Guardando…';
  try {
    const entry = buildEntry({ template, headline, note });
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, rev } = await readFile(dbx, target);
      const updated = insertEntry(text || '', entry, template || {});
      try {
        await writeFile(dbx, target, updated, rev);
        break;
      } catch (e) {
        // Si el fichero cambió entre medias, se vuelve a leer y se reintenta una vez
        if (attempt === 0 && /conflict/.test(JSON.stringify((e && e.error) || ''))) continue;
        throw e;
      }
    }
    show(
      header(),
      el(
        'div',
        { class: 'cap__ok', 'data-testid': 'cap-ok' },
        '✓ Guardado en ',
        el('code', {}, target)
      ),
      el('div', { class: 'cap__preview' }, `* ${entry.title}`),
      el(
        'p',
        { class: 'cap__hint' },
        'Ya puedes cerrar esta pestaña. Se verá en ORGanice al sincronizar.'
      ),
      el(
        'div',
        { class: 'cap__buttons' },
        el('a', { class: 'cap__btn', href: `./file${target}` }, 'Abrir en ORGanice'),
        document.referrer || capture.url
          ? el(
              'button',
              { class: 'cap__btn', onclick: () => window.history.back() },
              'Volver a la página'
            )
          : null
      )
    );
    try {
      window.sessionStorage.removeItem(PENDING);
    } catch (e) {}
  } catch (e) {
    if (button) button.disabled = false;
    const msg = (e && (e.message || e.error_summary)) || String(e);
    if (status) status.textContent = `No se pudo guardar: ${msg}`;
    else errorView(`No se pudo guardar: ${msg}`);
  }
};

const formView = ({ dbx, capture, template, target, templates }) => {
  const headlineInput = el('input', {
    class: 'cap__input',
    type: 'text',
    'data-testid': 'cap-title',
  });
  headlineInput.value = defaultHeadline(capture);
  const noteInput = el('textarea', {
    class: 'cap__input cap__note',
    rows: '3',
    placeholder: 'Nota (opcional)',
    'data-testid': 'cap-note',
  });
  noteInput.value = capture.url || capture.title ? capture.text || '' : '';
  const status = el('div', { class: 'cap__status' });
  const save = el(
    'button',
    {
      class: 'cap__btn cap__btn--primary',
      'data-testid': 'cap-save',
      onclick: () =>
        doSave({
          dbx,
          capture,
          template,
          target,
          headline: headlineInput.value,
          note: noteInput.value,
          button: save,
          status,
        }),
    },
    'Guardar'
  );
  show(
    header(
      `${
        template ? `Plantilla «${template.description}»` : 'Sin plantilla'
      } → ${target} · entorno ${shortKey(capture.appKey)}`
    ),
    el('label', { class: 'cap__label' }, 'Encabezado', headlineInput),
    el('label', { class: 'cap__label' }, 'Nota', noteInput),
    el('div', { class: 'cap__buttons' }, save),
    status,
    templates && templates.length > 1
      ? el(
          'p',
          { class: 'cap__hint' },
          'Plantillas de este entorno: ',
          templates.map((t) => t.description).join(', ')
        )
      : null
  );
  setTimeout(() => headlineInput.focus(), 50);
};

// Sin parámetros: generador del enlace para el Atajo / marcador
const setupView = () => {
  const key = el('input', {
    class: 'cap__input',
    placeholder: 'App key de Dropbox',
    'data-testid': 'cap-setup-key',
  });
  const tpl = el('input', {
    class: 'cap__input',
    placeholder: 'Plantilla (p. ej. INBOX)',
    value: 'INBOX',
  });
  const out = el('div', { class: 'cap__setup-out' });
  const base = REDIRECT;
  const render = () => {
    const k = encodeURIComponent(key.value.trim());
    const t = encodeURIComponent(tpl.value.trim());
    if (!k) {
      out.replaceChildren();
      return;
    }
    const link = `${base}?k=${k}&t=${t}&url=`;
    out.replaceChildren(
      el(
        'div',
        { class: 'cap__label' },
        'Dirección para el Atajo (se le añade la URL y el título):'
      ),
      el('code', { class: 'cap__code' }, `${link}[URL]&title=[Título]`),
      el(
        'p',
        { class: 'cap__hint' },
        'Marcador para Safari/Edge en el ordenador: crea un marcador y pega esto como dirección:'
      ),
      el(
        'code',
        { class: 'cap__code' },
        `javascript:location.href='${link}'+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)`
      )
    );
  };
  key.addEventListener('input', render);
  tpl.addEventListener('input', render);
  const connected = Object.keys(window.localStorage || {})
    .map((k) => /^eliCapture\.(.+)\.refresh$/.exec(k))
    .filter(Boolean)
    .map((m) => m[1]);
  show(
    header('Configurar la captura rápida'),
    el('label', { class: 'cap__label' }, 'App key del entorno', key),
    el('label', { class: 'cap__label' }, 'Plantilla de captura', tpl),
    out,
    connected.length
      ? el(
          'div',
          { class: 'cap__hint' },
          'Entornos conectados en este navegador: ',
          ...connected.map((k) =>
            el(
              'span',
              { class: 'cap__chip' },
              shortKey(k),
              ' ',
              el(
                'button',
                {
                  class: 'cap__link',
                  onclick: () => {
                    ls.del(tokenKey(k));
                    setupView();
                  },
                },
                'desconectar'
              )
            )
          )
        )
      : null
  );
};

// ---------------------------------------------------------------------------

const run = async () => {
  const params = new URLSearchParams(window.location.search);
  let capture = parseCaptureParams(window.location.search);

  // Vuelta de Dropbox con el código de autorización
  if (params.get('code')) {
    let pending = null;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(PENDING) || 'null');
    } catch (e) {}
    if (!pending || !pending.appKey) {
      errorView('Se perdió la captura durante la autorización. Vuelve a compartir la página.');
      return;
    }
    try {
      await finishAuth(pending.appKey, params.get('code'));
    } catch (e) {
      errorView(`Dropbox no autorizó la conexión: ${(e && e.message) || e}`);
      return;
    }
    capture = pending;
    window.history.replaceState(null, '', REDIRECT);
  }

  if (!capture.appKey) {
    setupView();
    return;
  }
  if (!capture.url && !capture.title && !capture.text) {
    errorView('No hay nada que capturar (falta url, title o text en la dirección).');
    return;
  }

  const dbx = clientFor(capture.appKey);
  if (!dbx) {
    connectView(capture);
    return;
  }

  show(header(), el('div', { class: 'cap__status' }, 'Leyendo la configuración…'));
  let templates = [];
  try {
    templates = await loadTemplates(dbx);
  } catch (e) {
    const s = JSON.stringify((e && e.error) || e || '');
    if (/invalid_access_token|expired|401|invalid_grant/.test(s + (e && e.status))) {
      ls.del(tokenKey(capture.appKey));
      connectView(capture);
      return;
    }
    // Sin configuración legible: se sigue con el fichero indicado
  }
  const template = findTemplate(templates, capture.template);
  if (capture.template && !template && !capture.file) {
    errorView(
      `No existe la plantilla «${capture.template}» en este entorno.` +
        (templates.length ? ` Hay: ${templates.map((t) => t.description).join(', ')}.` : '')
    );
    return;
  }
  const target = capture.file || (template && template.file) || '/inbox.org';
  const ctx = { dbx, capture, template, target, templates };
  if (capture.auto) {
    const entry = {
      headline: defaultHeadline(capture),
      note: capture.url || capture.title ? capture.text : '',
    };
    await doSave({ ...ctx, ...entry });
    return;
  }
  formView(ctx);
};

run().catch((e) => errorView(`Error: ${(e && e.message) || e}`));
