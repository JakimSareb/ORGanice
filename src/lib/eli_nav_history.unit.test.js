import {
  installNavHistory,
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  areaOf,
} from './eli_nav_history';

const fakeHistory = () => {
  let listener = null;
  let n = 0;
  const stack = [{ pathname: '/files', key: undefined }];
  let pos = 0;
  const h = {
    get location() {
      return stack[pos];
    },
    listen: (f) => {
      listener = f;
    },
    push: (pathname) => {
      stack.splice(pos + 1);
      stack.push({ pathname, key: 'k' + ++n });
      pos++;
      if (listener) listener(stack[pos], 'PUSH');
    },
    go: (d) => {
      pos += d;
      listener(stack[pos], 'POP');
    },
  };
  return h;
};

test('areaOf', () => {
  expect(areaOf('/gtd')).toBe('gtd');
  expect(areaOf('/gtd/x')).toBe('gtd');
  expect(areaOf('/file/a.org')).toBe('docs');
  expect(areaOf('/gtdx')).toBe('docs');
});

test('el historial de GTD y el de Documentos van por separado', () => {
  const h = fakeHistory();
  installNavHistory(h);
  h.push('/file/a.org');
  h.push('/gtd');
  h.push('/file/b.org');
  // En Documentos (b): atrás = a (saltando GTD)
  expect(canGoBack()).toBe(true);
  goBack(h);
  expect(h.location.pathname).toBe('/file/a.org');
  expect(canGoForward()).toBe(true);
  goForward(h);
  expect(h.location.pathname).toBe('/file/b.org');
  // En GTD: no hay a dónde ir
  h.push('/gtd');
  expect(canGoBack()).toBe(true); // el /gtd anterior
  goBack(h);
  expect(h.location.pathname).toBe('/gtd');
  expect(canGoBack()).toBe(false);
});

test('3.30: se recupera tras recargar la página (sessionStorage)', () => {
  const h = fakeHistory();
  installNavHistory(h);
  h.push('/file/a.org');
  h.push('/file/b.org');
  // «Recarga»: un history nuevo cuya entrada actual tiene la misma clave
  const h2 = fakeHistory();
  h2.push('/file/a.org');
  h2.push('/file/b.org');
  installNavHistory(h2);
  expect(canGoBack()).toBe(true);
  goBack(h2);
  expect(h2.location.pathname).toBe('/file/a.org');
});

test('3.30: una entrada desconocida no hace saltar mal', () => {
  const h = fakeHistory();
  installNavHistory(h);
  h.push('/file/a.org');
  h.push('/file/b.org');
  h.go(0); // clave conocida
  expect(canGoBack()).toBe(true);
});
