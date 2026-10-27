import Store from '../store';
import { readInitialState, subscribeToChanges } from './settings_persister';

describe('Settings persister', () => {
  let store;
  beforeEach(() => {
    const initialState = readInitialState();
    store = Store(initialState);
    subscribeToChanges(store)();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('Do not persist nonsense like like "false" for settings without default', () => {
    // (4.37) showClockDisplay ya tiene defecto (encendido): se prueba con uno que no lo tiene
    expect(localStorage.getItem('eliPagesFile')).not.toBe('false');
    expect(localStorage.getItem('eliPagesFile')).toBe(null);
  });

  test('Does persist given default values, for example colorScheme', () => {
    expect(localStorage.getItem('colorScheme')).toBe('Light'); // (4.37)
  });
});
