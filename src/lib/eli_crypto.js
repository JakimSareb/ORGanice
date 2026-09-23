// ORG Mode para Eli: cifrado OpenPGP compatible con GnuPG / Emacs (EPA y org-crypt).
//
// - Ficheros completos cifrados:  *.org.gpg (binario, como EPA por defecto) y *.org.asc (ASCII armor)
// - Cabeceras cifradas (org-crypt): cabeceras con la etiqueta :crypt:
// - Cifrado simétrico (frase de paso) y de clave pública (claves propias guardadas en el navegador).
//
// Las claves privadas se guardan en localStorage tal cual se importan (protegidas por su
// propia frase de paso). Las frases de paso solo viven en memoria durante la sesión.

import * as openpgp from 'openpgp';
import { askPassphrase } from './eli_prompt';

const LS_PRIVATE = 'eliGpgPrivateKeys';
const LS_PUBLIC = 'eliGpgPublicKeys';
const LS_MODE = 'eliGpgDefaultMode'; // 'symmetric' | 'publickey'

const BEGIN = '-----BEGIN PGP MESSAGE-----';
const END = '-----END PGP MESSAGE-----';

// ---------------------------------------------------------------------------
// Entorno (inyectable para tests)

let promptFn = askPassphrase;
export const setPromptFunction = (fn) => {
  promptFn = fn;
};

const memoryStorage = {};
const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return memoryStorage[key] || null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      memoryStorage[key] = value;
    }
  },
};

// Memoria de sesión
const unlockedKeys = new Map(); // fingerprint -> clave privada descifrada
const passphrases = new Map(); // cacheKey -> frase de paso simétrica
const fileMeta = new Map(); // path -> cómo estaba cifrado el fichero

export const forgetSecrets = () => {
  unlockedKeys.clear();
  passphrases.clear();
  // Las frases guardadas junto a cada fichero también se olvidan (se mantiene el modo y los
  // destinatarios, para volver a cifrar igual que estaba).
  fileMeta.forEach((meta) => {
    delete meta.passphrase;
  });
};

export const hasSecretsInMemory = () =>
  unlockedKeys.size > 0 ||
  passphrases.size > 0 ||
  Array.from(fileMeta.values()).some((m) => !!m.passphrase);

// ---------------------------------------------------------------------------
// Utilidades

export const isEncryptedPath = (path) => /\.(gpg|asc)$/i.test(path || '');
export const isBinaryEncryptedPath = (path) => /\.gpg$/i.test(path || '');

export const containsArmoredMessage = (text) => typeof text === 'string' && text.includes(BEGIN);

const utf8Encode = (s) => new TextEncoder().encode(s);
const utf8Decode = (b) => new TextDecoder('utf-8').decode(b);

// Quita la indentación de un bloque armored (p. ej. dentro de una cabecera indentada)
export const normalizeArmored = (text) => {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '').trim());
  const start = lines.findIndex((l) => l === BEGIN);
  const end = lines.findIndex((l, i) => i > start && l === END);
  if (start < 0 || end < 0) return null;
  return lines.slice(start, end + 1).join('\n') + '\n';
};

// ---------------------------------------------------------------------------
// Anillo de claves

const readJSONList = (key) => {
  try {
    return JSON.parse(storage.get(key) || '[]');
  } catch (e) {
    return [];
  }
};

export const getDefaultMode = () => storage.get(LS_MODE) || 'symmetric';
export const setDefaultMode = (mode) => storage.set(LS_MODE, mode);

export const loadPrivateKeys = async () => {
  const keys = [];
  for (const armoredKey of readJSONList(LS_PRIVATE)) {
    try {
      keys.push(await openpgp.readPrivateKey({ armoredKey }));
    } catch (e) {
      console.warn('Clave privada ilegible', e);
    }
  }
  return keys;
};

export const loadPublicKeys = async () => {
  const keys = [];
  for (const armoredKey of readJSONList(LS_PUBLIC)) {
    try {
      keys.push(await openpgp.readKey({ armoredKey }));
    } catch (e) {
      console.warn('Clave pública ilegible', e);
    }
  }
  const privates = await loadPrivateKeys();
  privates.forEach((k) => {
    if (!keys.some((p) => p.getFingerprint() === k.getFingerprint())) keys.push(k.toPublic());
  });
  return keys;
};

const describeKey = (key, isPrivate) => ({
  fingerprint: key.getFingerprint().toUpperCase(),
  keyID: key.getKeyID().toHex().toUpperCase(),
  userIDs: key.getUserIDs(),
  created: key.getCreationTime(),
  algorithm: key.getAlgorithmInfo().algorithm,
  isPrivate,
});

export const listKeys = async () => {
  const privates = await loadPrivateKeys();
  const result = privates.map((k) => describeKey(k, true));
  for (const armoredKey of readJSONList(LS_PUBLIC)) {
    try {
      const k = await openpgp.readKey({ armoredKey });
      if (!result.some((r) => r.fingerprint === k.getFingerprint().toUpperCase())) {
        result.push(describeKey(k, false));
      }
    } catch (e) {}
  }
  return result;
};

// Importa claves en formato armored (texto) o binario (Uint8Array). Admite varias.
export const importKeys = async (data) => {
  const keys =
    typeof data === 'string'
      ? await openpgp.readKeys({ armoredKeys: data })
      : await openpgp.readKeys({ binaryKeys: data });
  const privates = readJSONList(LS_PRIVATE);
  const publics = readJSONList(LS_PUBLIC);
  const imported = [];
  for (const key of keys) {
    const fp = key.getFingerprint();
    if (key.isPrivate()) {
      const existing = await Promise.all(
        privates.map((a) => openpgp.readPrivateKey({ armoredKey: a }).catch(() => null))
      );
      const idx = existing.findIndex((k) => k && k.getFingerprint() === fp);
      if (idx >= 0) privates.splice(idx, 1);
      privates.push(key.armor());
      imported.push(describeKey(key, true));
    } else {
      const existing = await Promise.all(
        publics.map((a) => openpgp.readKey({ armoredKey: a }).catch(() => null))
      );
      const idx = existing.findIndex((k) => k && k.getFingerprint() === fp);
      if (idx >= 0) publics.splice(idx, 1);
      publics.push(key.armor());
      imported.push(describeKey(key, false));
    }
  }
  storage.set(LS_PRIVATE, JSON.stringify(privates));
  storage.set(LS_PUBLIC, JSON.stringify(publics));
  return imported;
};

export const removeKey = async (fingerprint) => {
  const fp = fingerprint.toLowerCase();
  for (const [lsKey, reader] of [
    [LS_PRIVATE, (a) => openpgp.readPrivateKey({ armoredKey: a })],
    [LS_PUBLIC, (a) => openpgp.readKey({ armoredKey: a })],
  ]) {
    const list = readJSONList(lsKey);
    const keep = [];
    for (const a of list) {
      const k = await reader(a).catch(() => null);
      if (!k || k.getFingerprint() !== fp) keep.push(a);
    }
    storage.set(lsKey, JSON.stringify(keep));
  }
  unlockedKeys.delete(fp);
};

export const generateKeyPair = async ({ name, email, passphrase }) => {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519Legacy',
    userIDs: [{ name, email }],
    passphrase,
    format: 'armored',
  });
  await importKeys(privateKey);
  return { publicKey, privateKey };
};

export const exportPublicKey = async (fingerprint) => {
  const keys = await loadPublicKeys();
  const k = keys.find((x) => x.getFingerprint().toUpperCase() === fingerprint.toUpperCase());
  return k ? k.armor() : null;
};

const unlockPrivateKey = async (key) => {
  if (key.isDecrypted()) return key;
  const fp = key.getFingerprint();
  if (unlockedKeys.has(fp)) return unlockedKeys.get(fp);
  const uid = key.getUserIDs()[0] || key.getKeyID().toHex().toUpperCase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const passphrase = await promptFn({
      title: 'Clave privada',
      message:
        (attempt ? 'Frase de paso incorrecta. ' : '') + `Frase de paso de la clave de ${uid}`,
    });
    try {
      const unlocked = await openpgp.decryptKey({ privateKey: key, passphrase });
      unlockedKeys.set(fp, unlocked);
      return unlocked;
    } catch (e) {}
  }
  throw new Error('No se pudo desbloquear la clave privada');
};

// ---------------------------------------------------------------------------
// Descifrado

const readMessage = (data) =>
  typeof data === 'string'
    ? openpgp.readMessage({ armoredMessage: normalizeArmored(data) || data })
    : openpgp.readMessage({ binaryMessage: data });

const decryptToText = async (data, options) => {
  const message = await readMessage(data);
  const { data: bytes } = await openpgp.decrypt({ message, format: 'binary', ...options });
  return utf8Decode(bytes);
};

/**
 * Descifra un mensaje OpenPGP (string armored o Uint8Array binario).
 * @returns {Promise<{text: string, meta: object}>}
 */
export const decryptMessage = async (data, { label = '', cacheKey } = {}) => {
  const message = await readMessage(data);
  const recipientIDs = message.getEncryptionKeyIDs();
  const hasSymmetric =
    message.packets.filterByTag(openpgp.enums.packet.symEncryptedSessionKey).length > 0;
  const armored = typeof data === 'string';

  if (recipientIDs.length > 0) {
    const privates = await loadPrivateKeys();
    const candidates = privates.filter((k) =>
      recipientIDs.some((id) => id.isWildcard() || k.getKeys(id).length > 0)
    );
    for (const candidate of candidates) {
      const unlocked = await unlockPrivateKey(candidate);
      try {
        const text = await decryptToText(data, { decryptionKeys: unlocked });
        return {
          text,
          meta: {
            mode: 'publickey',
            armored,
            recipientKeyIDs: recipientIDs.map((id) => id.toHex()),
          },
        };
      } catch (e) {
        console.warn('No se pudo descifrar con', candidate.getKeyID().toHex(), e);
      }
    }
    if (!hasSymmetric) {
      throw new Error(
        `${label}: cifrado para ${recipientIDs
          .map((id) => id.toHex().toUpperCase())
          .join(', ')} y no tienes esa clave privada importada`
      );
    }
  }

  if (hasSymmetric) {
    const key = cacheKey || label;
    const tryPassphrase = async (passphrase) => {
      const text = await decryptToText(data, { passwords: [passphrase] });
      if (key) passphrases.set(key, passphrase);
      return { text, meta: { mode: 'symmetric', armored, passphrase } };
    };
    const known = key && passphrases.get(key);
    if (known) {
      try {
        return await tryPassphrase(known);
      } catch (e) {}
    }
    // Probar también la última frase usada en otros ficheros
    for (const p of new Set(passphrases.values())) {
      try {
        return await tryPassphrase(p);
      } catch (e) {}
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const passphrase = await promptFn({
        title: 'Descifrar',
        message: (attempt ? 'Frase de paso incorrecta. ' : '') + `Frase de paso para ${label}`,
      });
      try {
        return await tryPassphrase(passphrase);
      } catch (e) {}
    }
    throw new Error(`${label}: frase de paso incorrecta`);
  }

  throw new Error(`${label}: mensaje OpenPGP no reconocido`);
};

// ---------------------------------------------------------------------------
// Cifrado

const findKeysForRecipients = async (recipientKeyIDs) => {
  const publicKeys = await loadPublicKeys();
  const found = [];
  const missing = [];
  recipientKeyIDs.forEach((hex) => {
    if (/^0+$/.test(hex)) return; // destinatario oculto: se resuelve abajo
    const key = publicKeys.find((k) =>
      k.getKeys().some((sub) => sub.getKeyID().toHex().toLowerCase() === hex.toLowerCase())
    );
    if (key) {
      if (!found.includes(key)) found.push(key);
    } else missing.push(hex.toUpperCase());
  });
  return { found, missing };
};

const findKeysBySpec = async (spec) => {
  // spec: id de clave, huella, email o nombre (como CRYPTKEY de org-crypt)
  const s = spec.trim().toLowerCase().replace(/^0x/, '');
  const publicKeys = await loadPublicKeys();
  return publicKeys.filter(
    (k) =>
      k.getFingerprint().toLowerCase().endsWith(s) ||
      k.getKeys().some((sub) => sub.getKeyID().toHex().toLowerCase() === s) ||
      k.getUserIDs().some((u) => u.toLowerCase().includes(s))
  );
};

const ownPublicKeys = async () => (await loadPrivateKeys()).map((k) => k.toPublic());

const askNewPassphrase = async (label, cacheKey) => {
  if (cacheKey && passphrases.has(cacheKey)) return passphrases.get(cacheKey);
  const passphrase = await promptFn({
    title: 'Cifrado simétrico',
    message: `Nueva frase de paso para ${label}`,
    confirm: true,
  });
  if (cacheKey) passphrases.set(cacheKey, passphrase);
  return passphrase;
};

// Metadatos para cifrar algo nuevo según el modo por defecto
export const newEncryptionMeta = async ({ label, cacheKey, armored }) => {
  if (getDefaultMode() === 'publickey') {
    const own = await ownPublicKeys();
    if (own.length === 0) {
      throw new Error('Modo clave pública sin ninguna clave privada importada (Ajustes → Cifrado)');
    }
    return {
      mode: 'publickey',
      armored,
      recipientKeyIDs: own.map((k) => k.getKeyID().toHex()),
    };
  }
  return { mode: 'symmetric', armored, passphrase: await askNewPassphrase(label, cacheKey) };
};

/**
 * Cifra texto. Devuelve string armored o Uint8Array binario según meta.armored.
 */
export const encryptText = async (text, meta, { label = '' } = {}) => {
  const message = await openpgp.createMessage({ binary: utf8Encode(text) });
  const format = meta.armored ? 'armored' : 'binary';
  if (meta.mode === 'publickey') {
    let keys = meta.encryptionKeys;
    if (!keys) {
      const { found, missing } = await findKeysForRecipients(meta.recipientKeyIDs || []);
      if (missing.length) {
        throw new Error(
          `${label}: faltan las claves públicas ${missing.join(', ')}. ` +
            'Impórtalas en Ajustes → Cifrado para poder guardar sin perder destinatarios.'
        );
      }
      keys = found.length ? found : await ownPublicKeys();
    }
    if (!keys.length) throw new Error(`${label}: no hay claves públicas para cifrar`);
    return openpgp.encrypt({ message, encryptionKeys: keys, format });
  }
  if (!meta.passphrase) throw new Error(`${label}: falta la frase de paso`);
  return openpgp.encrypt({ message, passwords: [meta.passphrase], format });
};

// ---------------------------------------------------------------------------
// Ficheros completos (.gpg / .asc)

export const decryptFile = async (path, data) => {
  const { text, meta } = await decryptMessage(data, { label: path, cacheKey: path });
  fileMeta.set(path, meta);
  return text;
};

export const encryptFile = async (path, text) => {
  let meta = fileMeta.get(path);
  if (!meta) {
    meta = await newEncryptionMeta({
      label: path,
      cacheKey: path,
      armored: !isBinaryEncryptedPath(path),
    });
    fileMeta.set(path, meta);
  }
  if (meta.mode === 'symmetric' && !meta.passphrase) {
    // Frases olvidadas (bloqueo/olvidar): se pide de nuevo antes de volver a cifrar
    meta.passphrase = await askNewPassphrase(path, path);
  }
  return encryptText(text, meta, { label: path });
};

// ---------------------------------------------------------------------------
// org-crypt: cabeceras con la etiqueta :crypt:

const HEADING = /^(\*+)\s/;
const CRYPT_TAG = /\s:(?:[^\s:]+:)*crypt:(?:[^\s:]+:)*\s*$/;
const PLANNING = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;
const PROPS_START = /^\s*:PROPERTIES:\s*$/;
const PROPS_END = /^\s*:END:\s*$/;
const CRYPTKEY = /^\s*:CRYPTKEY:\s*(.+?)\s*$/i;

// Recorre las entradas :crypt: de nivel superior y llama a fn para cada una.
const forEachCryptEntry = (lines, fn) => {
  let i = 0;
  while (i < lines.length) {
    const m = HEADING.exec(lines[i]);
    if (!m || !CRYPT_TAG.test(lines[i])) {
      i++;
      continue;
    }
    const level = m[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const h = HEADING.exec(lines[end]);
      if (h && h[1].length <= level) break;
      end++;
    }
    let bodyStart = i + 1;
    let cryptKey = null;
    if (bodyStart < end && PLANNING.test(lines[bodyStart])) bodyStart++;
    if (bodyStart < end && PROPS_START.test(lines[bodyStart])) {
      let j = bodyStart + 1;
      while (j < end && !PROPS_END.test(lines[j])) {
        const ck = CRYPTKEY.exec(lines[j]);
        if (ck) cryptKey = ck[1];
        j++;
      }
      if (j < end) bodyStart = j + 1;
    }
    let bodyEnd = end;
    while (bodyEnd > bodyStart && lines[bodyEnd - 1].trim() === '') bodyEnd--;
    fn({ headingIndex: i, bodyStart, bodyEnd, end, cryptKey });
    i = end;
  }
};

export const hasUnencryptedCryptEntries = (text) => {
  if (!text || !text.includes('crypt:')) return false;
  const lines = text.split('\n');
  let found = false;
  forEachCryptEntry(lines, ({ bodyStart, bodyEnd }) => {
    const body = lines.slice(bodyStart, bodyEnd).join('\n').trim();
    if (body && !body.startsWith(BEGIN)) found = true;
  });
  return found;
};

/**
 * Cifra el contenido de las cabeceras :crypt: que estén en claro (como hace
 * org-crypt al guardar en Emacs). La línea de planificación y el cajón
 * :PROPERTIES: se quedan en claro; el resto del subárbol se cifra.
 */
export const encryptCryptEntries = async (text, { label = 'org-crypt' } = {}) => {
  if (!hasUnencryptedCryptEntries(text)) return text;
  const lines = text.split('\n');
  const jobs = [];
  forEachCryptEntry(lines, (entry) => {
    const body = lines.slice(entry.bodyStart, entry.bodyEnd).join('\n');
    if (body.trim() && !body.trim().startsWith(BEGIN)) jobs.push({ ...entry, body });
  });
  const replacements = [];
  for (const job of jobs) {
    let meta;
    if (job.cryptKey) {
      const keys = await findKeysBySpec(job.cryptKey);
      if (!keys.length) {
        throw new Error(`No hay clave pública para CRYPTKEY "${job.cryptKey}"`);
      }
      meta = { mode: 'publickey', armored: true, encryptionKeys: keys };
    } else {
      meta = await newEncryptionMeta({ label: 'las cabeceras :crypt:', cacheKey: 'org-crypt', armored: true });
    }
    const armored = await encryptText(job.body + '\n', meta, { label });
    replacements.push({ ...job, armored: armored.replace(/\n$/, '') });
  }
  // Sustituir de abajo arriba para no desplazar índices
  replacements
    .sort((a, b) => b.bodyStart - a.bodyStart)
    .forEach((r) => lines.splice(r.bodyStart, r.bodyEnd - r.bodyStart, ...r.armored.split('\n')));
  return lines.join('\n');
};

/**
 * Descifra en el texto del fichero el bloque armored indicado (o el primero
 * que encuentre dentro de una cabecera :crypt:), como org-decrypt-entry.
 */
export const decryptCryptEntryInText = async (text, armoredBlock) => {
  const target = armoredBlock ? normalizeArmored(armoredBlock) : null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== BEGIN) continue;
    let j = i;
    while (j < lines.length && lines[j].trim() !== END) j++;
    if (j >= lines.length) break;
    const block = lines.slice(i, j + 1).join('\n');
    if (target && normalizeArmored(block) !== target) {
      i = j;
      continue;
    }
    const { text: plain } = await decryptMessage(normalizeArmored(block), {
      label: 'la cabecera cifrada',
      cacheKey: 'org-crypt',
    });
    lines.splice(i, j - i + 1, ...plain.replace(/\n$/, '').split('\n'));
    return lines.join('\n');
  }
  throw new Error('No se encontró el bloque cifrado');
};

// ---------------------------------------------------------------------------
// Envoltorio para los clientes de sincronización (Dropbox, WebDAV, GitLab)

export const withEncryption = (client) => {
  if (!client || client.__eliEncrypted) return client;
  const getFileContentsAndMetadata = async (path) => {
    const result = await client.getFileContentsAndMetadata(path);
    if (!isEncryptedPath(path)) return result;
    try {
      return { ...result, contents: await decryptFile(path, result.contents) };
    } catch (e) {
      e.eliMessage = e.message;
      throw e;
    }
  };
  const prepare = async (path, contents) => {
    if (isEncryptedPath(path)) return encryptFile(path, contents);
    // Copias de seguridad de organice de ficheros cifrados: también cifradas
    const backup = /^(.*\.(gpg|asc))\.organice-bak$/i.exec(path);
    if (backup) return encryptFile(backup[1], contents);
    return encryptCryptEntries(contents);
  };
  return {
    ...client,
    __eliEncrypted: true,
    getFileContentsAndMetadata,
    getFileContents: async (path) => (await getFileContentsAndMetadata(path)).contents,
    updateFile: async (path, contents, ...rest) =>
      client.updateFile(path, await prepare(path, contents), ...rest),
    createFile: async (path, contents, ...rest) =>
      client.createFile(path, await prepare(path, contents), ...rest),
  };
};
