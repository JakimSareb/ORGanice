import { syncRoundMessage } from './org';

describe('3.27: un solo aviso por ronda de sincronización', () => {
  const n = (path) => ({ kind: 'nothing', path });
  test('nada en ningún fichero → un «Nada que sincronizar»', () => {
    expect(syncRoundMessage([n('/a.org'), n('/b.org'), n('/c.org'), n('/d.org')]).text).toBe(
      'Nada que sincronizar'
    );
  });
  test('subidos y descargados', () => {
    expect(syncRoundMessage([n('/a'), { kind: 'uploaded', path: '/b' }]).text).toBe(
      'Cambios subidos'
    );
    expect(syncRoundMessage([{ kind: 'downloaded', path: '/b.org' }, n('/a')]).text).toBe(
      'Última versión descargada: /b.org'
    );
    expect(
      syncRoundMessage([
        { kind: 'downloaded', path: '/a' },
        { kind: 'downloaded', path: '/b' },
      ]).text
    ).toBe('Última versión descargada (2 ficheros)');
    expect(
      syncRoundMessage([
        { kind: 'downloaded', path: '/a' },
        { kind: 'uploaded', path: '/b' },
      ]).text
    ).toMatch(/^Sincronizado/);
  });
  test('errores y conflictos mandan', () => {
    expect(
      syncRoundMessage([{ kind: 'uploaded' }, { kind: 'error', text: 'Error al subir /x' }]).text
    ).toBe('Error al subir /x');
    expect(syncRoundMessage([{ kind: 'uploaded' }, { kind: 'conflict' }])).toBe(null);
  });
});
