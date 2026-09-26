import { toggleOrgEmphasis } from './eli_format';

describe('toggleOrgEmphasis', () => {
  test('pone el marcador alrededor de la selección', () => {
    expect(toggleOrgEmphasis('hola mundo', 5, 10, '*')).toEqual({
      value: 'hola *mundo*',
      start: 5,
      end: 12,
    });
  });
  test('sin selección inserta el par y deja el cursor en medio', () => {
    expect(toggleOrgEmphasis('ab', 1, 1, '/')).toEqual({ value: 'a//b', start: 2, end: 2 });
  });
  test('no incluye los espacios de los extremos', () => {
    expect(toggleOrgEmphasis('a  texto  b', 1, 10, '_').value).toBe('a  _texto_  b');
  });
  test('quita el marcador si la selección lo incluye', () => {
    expect(toggleOrgEmphasis('x *y* z', 2, 5, '*')).toEqual({ value: 'x y z', start: 2, end: 3 });
  });
  test('quita el marcador si rodea la selección', () => {
    expect(toggleOrgEmphasis('x =y= z', 3, 4, '=')).toEqual({ value: 'x y z', start: 2, end: 3 });
  });
  test('varias líneas: cada una por separado, sin tocar las vacías', () => {
    expect(toggleOrgEmphasis('uno\n\n dos', 0, 9, '+').value).toBe('+uno+\n\n +dos+');
  });
});
