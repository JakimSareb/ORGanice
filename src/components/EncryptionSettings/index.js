import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { BASE_PATH } from '../../lib/base_path';

import './stylesheet.css';

import {
  listKeys,
  importKeys,
  removeKey,
  generateKeyPair,
  exportPublicKey,
  getDefaultMode,
  setDefaultMode,
  forgetSecrets,
} from '../../lib/eli_crypto';
import {
  getIdleLockMinutes,
  setIdleLockMinutes,
  getPersistPlainFiles,
  setPersistPlainFiles,
} from '../../lib/eli_security';

const IDLE_OPTIONS = [0, 2, 5, 10, 15, 30, 60];

// ORG Mode para Eli: gestión de claves OpenPGP y modo de cifrado por defecto.
const download = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/pgp-keys' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
};

// ORG Mode para Eli: volver atrás en el historial (no añadir otra entrada /settings, que
// hacía que «Back» en Ajustes volviera aquí en bucle)
export const backToSettings = (history) => {
  const cameFromSettings = window.__eliCameFromSettings;
  window.__eliCameFromSettings = false;
  if (cameFromSettings) history.goBack();
  else history.replace('/settings');
};

export default function EncryptionSettings() {
  const history = useHistory();
  const [keys, setKeys] = useState([]);
  const [mode, setMode] = useState(getDefaultMode());
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState(null);
  const [gen, setGen] = useState({ name: '', email: '', passphrase: '', passphrase2: '' });
  const [busy, setBusy] = useState(false);
  const [idleMinutes, setIdleMinutesState] = useState(getIdleLockMinutes());
  const [persistPlain, setPersistPlainState] = useState(getPersistPlainFiles());

  const handleIdle = (e) => {
    const v = +e.target.value;
    setIdleLockMinutes(v);
    setIdleMinutesState(v);
  };

  const handlePersistPlain = (e) => {
    const enabled = e.target.checked;
    if (
      enabled &&
      // eslint-disable-next-line no-restricted-globals
      !window.confirm(
        'Los ficheros .org NO cifrados se guardarán en claro en este navegador para poder ' +
          'abrirlos sin conexión. Cualquiera con acceso a este dispositivo o navegador podría leerlos. ¿Activar?'
      )
    ) {
      return;
    }
    setPersistPlainFiles(enabled);
    setPersistPlainState(enabled);
    report(
      enabled
        ? 'Copia local activada: los ficheros sin cifrar se guardarán en este navegador.'
        : 'Copia local desactivada y copias existentes borradas de este navegador.'
    );
  };

  const refresh = () => listKeys().then(setKeys);
  useEffect(() => {
    refresh();
  }, []);

  const report = (text, isError = false) => setMessage({ text, isError });

  const handleMode = (m) => {
    setDefaultMode(m);
    setMode(m);
  };

  const doImport = async (data) => {
    try {
      const imported = await importKeys(data);
      report(
        `Importadas ${imported.length} clave(s): ` +
          imported
            .map((k) => `${k.userIDs[0] || k.keyID} (${k.isPrivate ? 'privada' : 'pública'})`)
            .join(', ')
      );
      setPasted('');
      refresh();
    } catch (e) {
      report(`No se pudo importar: ${e.message}`, true);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      const asText = new TextDecoder().decode(bytes);
      doImport(asText.includes('-----BEGIN PGP') ? asText : bytes);
    });
    event.target.value = '';
  };

  const handleGenerate = async () => {
    if (!gen.name || !gen.email || !gen.passphrase) {
      report('Rellena nombre, email y frase de paso.', true);
      return;
    }
    if (gen.passphrase !== gen.passphrase2) {
      report('Las frases de paso no coinciden.', true);
      return;
    }
    setBusy(true);
    try {
      const { publicKey, privateKey } = await generateKeyPair(gen);
      download(`${gen.email}-publica.asc`, publicKey);
      download(`${gen.email}-PRIVADA.asc`, privateKey);
      report(
        'Clave creada. Se han descargado la pública y la privada: impórtalas en GnuPG ' +
          '(gpg --import) para usarlas también desde Emacs, y guarda la privada en lugar seguro.'
      );
      setGen({ name: '', email: '', passphrase: '', passphrase2: '' });
      refresh();
    } catch (e) {
      report(`Error al generar la clave: ${e.message}`, true);
    }
    setBusy(false);
  };

  const handleRemove = async (k) => {
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(`¿Eliminar la clave ${k.userIDs[0] || k.keyID} de este navegador?`)) return;
    await removeKey(k.fingerprint);
    refresh();
  };

  const handleExport = async (k) => {
    const armored = await exportPublicKey(k.fingerprint);
    if (armored) download(`${k.keyID}-publica.asc`, armored);
  };

  return (
    <div className="eli-encryption">
      <h2>Seguridad y cifrado</h2>
      <h3>Bloqueo por inactividad</h3>
      <label>
        Bloquear tras{' '}
        <select value={idleMinutes} onChange={handleIdle} className="eli-encryption__select">
          {IDLE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'nunca (desactivado)' : `${m} minutos`}
            </option>
          ))}
        </select>{' '}
        sin usar la app
      </label>
      <p className="eli-encryption__help">
        Al bloquearse, la app guarda lo pendiente en Dropbox, olvida frases de paso y claves
        desbloqueadas y se recarga, de modo que el texto descifrado desaparece de la memoria. Solo
        actúa si hay algo cifrado abierto o alguna frase recordada. En el iPhone también se
        comprueba al volver a la app.
      </p>
      <h3>Copia local de ficheros sin cifrar</h3>
      <label className="eli-encryption__radio">
        <input type="checkbox" checked={persistPlain} onChange={handlePersistPlain} /> Guardar en
        este navegador una copia de los ficheros <strong>no cifrados</strong>
      </label>
      <p className="eli-encryption__help">
        Desactivado (recomendado): no queda nada de tus notas en el navegador; la app las descarga
        de Dropbox al abrirlas y necesita conexión. Si cierras la app con cambios sin subir, se
        pierden (la app te avisa antes de cerrar). Activado: puedes abrir y editar sin conexión, a
        cambio de dejar una copia legible en este dispositivo. Los ficheros cifrados y las cabeceras
        :crypt: descifradas nunca se guardan, esté como esté esta opción.
      </p>
      <h2>Cifrado (GPG)</h2>
      <p className="eli-encryption__help">
        Ficheros <code>.org.gpg</code> / <code>.org.asc</code> y cabeceras con la etiqueta{' '}
        <code>:crypt:</code> (org-crypt). Compatible con GnuPG y Emacs. Las frases de paso solo se
        guardan en memoria mientras la app está abierta.
      </p>
      <h3>Modo para cifrar contenido nuevo</h3>
      <label className="eli-encryption__radio">
        <input
          type="radio"
          checked={mode === 'symmetric'}
          onChange={() => handleMode('symmetric')}
        />{' '}
        Simétrico (frase de paso) — equivale a <code>org-crypt-key nil</code>
      </label>
      <label className="eli-encryption__radio">
        <input
          type="radio"
          checked={mode === 'publickey'}
          onChange={() => handleMode('publickey')}
        />{' '}
        Clave pública (a tus claves privadas importadas)
      </label>
      <p className="eli-encryption__help">
        Los ficheros existentes se vuelven a cifrar siempre igual que estaban (misma frase o mismos
        destinatarios). En una cabecera, la propiedad <code>:CRYPTKEY:</code> manda sobre este
        ajuste.
      </p>
      <h3>Claves en este navegador</h3>
      {keys.length === 0 ? (
        <p className="eli-encryption__help">Ninguna clave importada.</p>
      ) : (
        <ul className="eli-encryption__keys">
          {keys.map((k) => (
            <li key={k.fingerprint}>
              <div>
                <i className={`fas ${k.isPrivate ? 'fa-key' : 'fa-user'}`} />{' '}
                <strong>{k.userIDs.join(', ') || '(sin nombre)'}</strong>{' '}
                <span className="eli-encryption__muted">
                  {k.isPrivate ? 'privada + pública' : 'pública'} · {k.algorithm} · {k.keyID}
                </span>
              </div>
              <div className="eli-encryption__fp">{k.fingerprint.replace(/(.{4})/g, '$1 ')}</div>
              <div className="eli-encryption__actions">
                <button className="btn" onClick={() => handleExport(k)}>
                  Exportar pública
                </button>
                <button className="btn" onClick={() => handleRemove(k)}>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3>Importar clave</h3>
      <p className="eli-encryption__help">
        Exporta tu clave desde GnuPG con{' '}
        <code>gpg --armor --export-secret-keys tu@email &gt; privada.asc</code> y selecciona el
        fichero, o pega el bloque. También puedes importar claves públicas de otras personas.
      </p>
      <input type="file" accept=".asc,.gpg,.key,.pgp,.txt" onChange={handleFile} />
      <textarea
        className="textfield eli-encryption__textarea"
        rows={5}
        placeholder="-----BEGIN PGP PRIVATE KEY BLOCK----- …"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      <button className="btn" disabled={!pasted.trim()} onClick={() => doImport(pasted)}>
        Importar texto pegado
      </button>
      <h3>Crear un par de claves nuevo</h3>
      <div className="eli-encryption__gen">
        <input
          className="textfield"
          placeholder="Nombre"
          value={gen.name}
          onChange={(e) => setGen({ ...gen, name: e.target.value })}
        />
        <input
          className="textfield"
          placeholder="Email"
          autoCapitalize="none"
          value={gen.email}
          onChange={(e) => setGen({ ...gen, email: e.target.value })}
        />
        <input
          className="textfield"
          type="password"
          placeholder="Frase de paso"
          value={gen.passphrase}
          onChange={(e) => setGen({ ...gen, passphrase: e.target.value })}
        />
        <input
          className="textfield"
          type="password"
          placeholder="Repite la frase de paso"
          value={gen.passphrase2}
          onChange={(e) => setGen({ ...gen, passphrase2: e.target.value })}
        />
        <button className="btn" disabled={busy} onClick={handleGenerate}>
          {busy ? 'Generando…' : 'Generar (Curve25519)'}
        </button>
      </div>
      <h3>Sesión</h3>
      <button
        className="btn"
        onClick={() => {
          forgetSecrets();
          report('Frases de paso y claves desbloqueadas olvidadas.');
        }}
      >
        Olvidar frases de paso ahora
      </button>{' '}
      <button className="btn" onClick={() => window.location.replace(`${BASE_PATH}/files`)}>
        Bloquear ahora (olvidar y recargar)
      </button>
      {message && (
        <div className={`eli-encryption__message ${message.isError ? 'is-error' : ''}`}>
          {message.text}
        </div>
      )}
      <p>
        <a
          href="#volver"
          onClick={(e) => {
            e.preventDefault();
            backToSettings(history);
          }}
        >
          ← Volver a Ajustes
        </a>
      </p>
    </div>
  );
}
