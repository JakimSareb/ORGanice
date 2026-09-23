/**
 * @jest-environment node
 */
/* global Buffer */
// Pruebas de interoperabilidad con GnuPG real (se omiten si no hay `gpg`).
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('openpgp', () =>
  jest.requireActual('../../node_modules/openpgp/dist/node/openpgp.min.cjs')
);

import {
  setPromptFunction,
  decryptFile,
  encryptFile,
  importKeys,
  listKeys,
  setDefaultMode,
  encryptCryptEntries,
  decryptCryptEntryInText,
  hasUnencryptedCryptEntries,
  withEncryption,
  forgetSecrets,
} from './eli_crypto';

let hasGpg = true;
try {
  execFileSync('gpg', ['--version']);
} catch (e) {
  hasGpg = false;
}
const maybe = hasGpg ? describe : describe.skip;

maybe('eli_crypto ↔ GnuPG', () => {
  let home;
  const gpg = (args, input) =>
    execFileSync('gpg', ['--homedir', home, '--batch', '--yes', '--pinentry-mode', 'loopback', ...args], {
      input,
    });
  const SYM = 'correcto caballo batería grapa';
  const KEYPASS = 'clave-privada-123';
  const text = '#+TITLE: Secreto\n#+TAGS: @casa @oficina\n* TODO Tarea ñ € 😀 :@casa:\n  cuerpo\n';

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'eli-gpg-'));
    fs.chmodSync(home, 0o700);
    gpg(['--passphrase', KEYPASS, '--quick-gen-key', 'Eli Test <eli@example.com>', 'default', 'default', 'never']);
  });

  beforeEach(() => forgetSecrets());

  test('fichero .gpg simétrico creado por gpg -c se descifra', async () => {
    const enc = gpg(['--passphrase', SYM, '--symmetric', '-o', '-'], text);
    const prompts = [];
    setPromptFunction(async (p) => {
      prompts.push(p);
      return SYM;
    });
    const plain = await decryptFile('/a.org.gpg', new Uint8Array(enc));
    expect(plain).toBe(text);
    expect(prompts.length).toBe(1);
    // Re-cifrado con la misma frase, sin volver a preguntar, y gpg lo lee
    const reenc = await encryptFile('/a.org.gpg', plain + '* nuevo\n');
    expect(reenc).toBeInstanceOf(Uint8Array);
    expect(prompts.length).toBe(1);
    const back = gpg(['--passphrase', SYM, '--decrypt'], Buffer.from(reenc)).toString('utf8');
    expect(back).toBe(text + '* nuevo\n');
    expect(back.includes('\r')).toBe(false);
  });

  test('clave pública: importar clave privada de gpg, descifrar y re-cifrar', async () => {
    const secret = gpg(['--passphrase', KEYPASS, '--armor', '--export-secret-keys', 'eli@example.com']).toString();
    const imported = await importKeys(secret);
    expect(imported[0].isPrivate).toBe(true);
    expect((await listKeys()).length).toBe(1);

    const enc = gpg(['--trust-model', 'always', '-e', '-r', 'eli@example.com', '-o', '-'], text);
    setPromptFunction(async () => KEYPASS);
    const plain = await decryptFile('/b.org.gpg', new Uint8Array(enc));
    expect(plain).toBe(text);
    const reenc = await encryptFile('/b.org.gpg', plain);
    const back = gpg(['--passphrase', KEYPASS, '--decrypt'], Buffer.from(reenc)).toString('utf8');
    expect(back).toBe(text);
  });

  test('fichero nuevo .asc en modo clave pública es armored y gpg lo abre', async () => {
    setDefaultMode('publickey');
    let enc;
    try {
      enc = await encryptFile('/nuevo.org.asc', text);
    } finally {
      setDefaultMode('symmetric');
    }
    expect(typeof enc).toBe('string');
    expect(enc.startsWith('-----BEGIN PGP MESSAGE-----')).toBe(true);
    const back = gpg(['--passphrase', KEYPASS, '--decrypt'], enc).toString('utf8');
    expect(back).toBe(text);
  });

  const cryptFile = [
    '#+TITLE: Notas',
    '* Público',
    'texto normal',
    '* Contraseñas :crypt:',
    'SCHEDULED: <2026-09-30 Wed>',
    ':PROPERTIES:',
    ':ID: 123',
    ':END:',
    'usuario: eli',
    '** Subnodo',
    'pin 1234',
    '',
    '* Otra',
    'fin',
    '',
  ].join('\n');

  test('org-crypt: cifra cabeceras :crypt: (simétrico) de forma compatible con gpg', async () => {
    setPromptFunction(async () => SYM);
    expect(hasUnencryptedCryptEntries(cryptFile)).toBe(true);
    const enc = await encryptCryptEntries(cryptFile);
    expect(hasUnencryptedCryptEntries(enc)).toBe(false);
    expect(enc).toContain('SCHEDULED: <2026-09-30 Wed>\n:PROPERTIES:\n:ID: 123\n:END:\n-----BEGIN PGP MESSAGE-----');
    expect(enc).not.toContain('pin 1234');
    expect(enc).toContain('\n\n* Otra\nfin\n');
    const block = enc.slice(enc.indexOf('-----BEGIN'), enc.indexOf('-----END PGP MESSAGE-----') + 25);
    const back = gpg(['--passphrase', SYM, '--decrypt'], block + '\n').toString('utf8');
    expect(back).toBe('usuario: eli\n** Subnodo\npin 1234\n');
    // Ida y vuelta
    const dec = await decryptCryptEntryInText(enc);
    expect(dec).toBe(cryptFile);
  });

  test('org-crypt: bloque creado por gpg (indentado) se descifra', async () => {
    const armored = gpg(['--passphrase', SYM, '--symmetric', '--armor', '-o', '-'], 'secreto\n').toString();
    const indented = armored
      .trim()
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n');
    const file = `* Nota :crypt:\n${indented}\n* Siguiente\n`;
    setPromptFunction(async () => SYM);
    expect(await decryptCryptEntryInText(file)).toBe('* Nota :crypt:\nsecreto\n* Siguiente\n');
  });

  test('org-crypt con CRYPTKEY usa la clave pública indicada', async () => {
    setPromptFunction(async () => KEYPASS);
    const f = '* K :crypt:\n:PROPERTIES:\n:CRYPTKEY: eli@example.com\n:END:\nsecreto\n';
    const enc = await encryptCryptEntries(f);
    const block = enc.slice(enc.indexOf('-----BEGIN'));
    const back = gpg(['--passphrase', KEYPASS, '--decrypt'], block).toString('utf8');
    expect(back).toBe('secreto\n');
  });

  test('withEncryption: descifra al leer y cifra al guardar; los .org normales cifran :crypt:', async () => {
    setPromptFunction(async () => SYM);
    const store = {
      '/x.org.gpg': new Uint8Array(gpg(['--passphrase', SYM, '--symmetric', '-o', '-'], text)),
    };
    const fake = {
      getFileContentsAndMetadata: async (p) => ({ contents: store[p], lastModifiedAt: 'x' }),
      updateFile: async (p, c) => {
        store[p] = c;
      },
      createFile: async (p, c) => {
        store[p] = c;
      },
    };
    const client = withEncryption(fake);
    expect(await client.getFileContents('/x.org.gpg')).toBe(text);
    await client.updateFile('/x.org.gpg', 'nuevo\n');
    expect(gpg(['--passphrase', SYM, '--decrypt'], Buffer.from(store['/x.org.gpg'])).toString()).toBe(
      'nuevo\n'
    );
    await client.createFile('/x.org.gpg.organice-bak', 'copia\n');
    expect(store['/x.org.gpg.organice-bak']).toBeInstanceOf(Uint8Array);
    expect(
      gpg(['--passphrase', SYM, '--decrypt'], Buffer.from(store['/x.org.gpg.organice-bak'])).toString()
    ).toBe('copia\n');
    await client.updateFile('/y.org', cryptFile);
    expect(store['/y.org']).not.toContain('pin 1234');
    expect(store['/y.org']).toContain('texto normal');
  });
});
