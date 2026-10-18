import { fromJS } from 'immutable';
import { propertyListFromRows } from './gtd_actions';

describe('(3.11) propertyListFromRows', () => {
  const old = fromJS([
    { id: 1, property: 'ID', value: [{ type: 'text', contents: 'abc' }] },
    { id: 2, property: 'AREA', value: [{ type: 'text', contents: 'Casa' }] },
  ]);
  test('keeps unchanged items, edits, removes and adds', () => {
    const next = propertyListFromRows(old, [
      { id: 1, name: 'ID', value: 'abc' },
      { name: ':nuevo prop:', value: ' x ' },
    ]);
    expect(next.size).toBe(2);
    expect(next.get(0)).toBe(old.get(0));
    expect(next.getIn([1, 'property'])).toBe('nuevo_prop');
    expect(next.getIn([1, 'value', 0, 'contents'])).toBe('x');
  });
  test('drops nameless and duplicate names', () => {
    const next = propertyListFromRows(old, [
      { id: 2, name: 'AREA', value: 'Trabajo' },
      { name: 'area', value: 'otra' },
      { name: '  ', value: 'z' },
    ]);
    expect(next.size).toBe(1);
    expect(next.getIn([0, 'id'])).toBe(2);
    expect(next.getIn([0, 'value', 0, 'contents'])).toBe('Trabajo');
  });
});
