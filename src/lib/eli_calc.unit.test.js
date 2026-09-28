import { evaluate, formatNumber, plainNumber } from './eli_calc';

describe('eli_calc', () => {
  test('operaciones básicas y precedencia', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(2+3)*4')).toBe(20);
    expect(evaluate('10 ÷ 4')).toBe(2.5);
    expect(evaluate('3 × 3 − 1')).toBe(8);
    expect(evaluate('-5+2')).toBe(-3);
    expect(evaluate('2*-3')).toBe(-6);
  });
  test('decimales con coma y porcentajes', () => {
    expect(evaluate('1,5+1,25')).toBe(2.75);
    expect(evaluate('50%')).toBe(0.5);
    expect(evaluate('200+10%')).toBe(220);
    expect(evaluate('200-25%')).toBe(150);
    expect(evaluate('200*10%')).toBe(20);
  });
  test('errores', () => {
    expect(() => evaluate('2+')).toThrow();
    expect(() => evaluate('1/0')).toThrow();
    expect(() => evaluate('abc')).toThrow();
    expect(evaluate('')).toBe(null);
    expect(evaluate('(2+3')).toBe(5);
  });
  test('formato', () => {
    expect(plainNumber(0.1 + 0.2)).toBe('0,3');
    expect(formatNumber(2.5)).toMatch(/2,5/);
  });
});
