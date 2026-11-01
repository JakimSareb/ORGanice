// 4.58: Ajustes › Copias de seguridad (UI): lista, copiar ahora, restaurar con confirmación
import React from 'react';
import { TextEncoder, TextDecoder } from 'util';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { Map as IMap } from 'immutable';

global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

jest.mock('../../lib/eli_prompt', () => ({
  askConfirm: jest.fn(),
  showMessage: jest.fn(),
}));

import BackupsSettings from './BackupsSettings';
import { askConfirm, showMessage } from '../../lib/eli_prompt';
import { makeZip, formatBackupName } from '../../lib/eli_backups';

// CRA reinicia los mocks entre tests: se configuran aquí
beforeEach(() => {
  askConfirm.mockResolvedValue(true);
  showMessage.mockResolvedValue();
});

const blobBytes = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = reject;
    r.readAsArrayBuffer(blob);
  });

const makeClient = () => {
  const files = { '/gtd.org': '* TODO a\n' };
  const zips = {};
  const client = {
    files,
    zips,
    listAllFileEntries: async () =>
      Object.keys(files).map((path) => ({ path, size: files[path].length, stamp: files[path] })),
    getFileBlob: async (path) => ({
      arrayBuffer: async () => {
        const u8 = zips[path] || new TextEncoder().encode(files[path]);
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      },
    }),
    listBackupZips: async () =>
      Object.keys(zips).map((path) => ({
        path,
        name: path.split('/').pop(),
        size: zips[path].length,
      })),
    uploadBinaryFile: async (path, blob) => {
      zips[path] = await blobBytes(blob);
      return path;
    },
    deleteFile: async (path) => {
      delete zips[path];
    },
    updateFile: async (path, contents) => {
      files[path] = contents;
    },
  };
  return client;
};

const renderWith = (client) => {
  const state = {
    syncBackend: IMap({ client }),
    org: { present: IMap({ files: IMap() }) },
  };
  const store = createStore((s = state) => s, applyMiddleware(thunk));
  return render(
    <Provider store={store}>
      <BackupsSettings />
    </Provider>
  );
};

test('sin soporte (p. ej. WebDAV) se explica y no ofrece botones', () => {
  const { getByTestId, queryByTestId } = renderWith({ type: 'WebDAV' });
  expect(getByTestId('eli-backups-unsupported')).toBeTruthy();
  expect(queryByTestId('eli-backups-now')).toBe(null);
});

test('«Copiar ahora» crea una copia y sale en la lista', async () => {
  const client = makeClient();
  const { getByTestId, findAllByTestId } = renderWith(client);
  fireEvent.click(getByTestId('eli-backups-now'));
  const items = await findAllByTestId('eli-backups-item');
  expect(items).toHaveLength(1);
  expect(Object.keys(client.zips)).toHaveLength(1);
  // (4.60) dice a qué hora y cuántos ficheros
  expect(getByTestId('eli-backups-note').textContent).toMatch(
    /^Copia hecha a las \d\d:\d\d \(\d+ ficheros?\)\.$/
  );
});

test('«Restaurar» pide confirmación y reescribe el fichero', async () => {
  const client = makeClient();
  const when = new Date(2026, 9, 30, 9, 0);
  const zip = await makeZip(
    [{ name: 'gtd.org', data: new TextEncoder().encode('* TODO viejo\n') }],
    {
      date: when,
      deflateRaw: null,
    }
  );
  client.zips[`/backups/${formatBackupName(when, 'abcdef1234')}`] = zip;
  const reload = jest.fn();
  const original = window.location;
  delete window.location;
  window.location = { ...original, reload };
  const { getByText, findAllByTestId } = renderWith(client);
  fireEvent.click(getByText('Ver copias'));
  const buttons = await findAllByTestId('eli-backups-restore');
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(reload).toHaveBeenCalled());
  expect(askConfirm).toHaveBeenCalled();
  expect(client.files['/gtd.org']).toBe('* TODO viejo\n');
  window.location = original;
});
