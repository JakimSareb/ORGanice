import { validateSubtreeText } from './index';

test('validación del texto de un subárbol', () => {
  expect(validateSubtreeText('** Hijo\ntexto\n*** Nieto\n', 2).ok).toBe(true);
  expect(validateSubtreeText('\n\n** Hijo\n', 2).ok).toBe(true);
  expect(validateSubtreeText('   \n', 2).empty).toBe(true);
  expect(validateSubtreeText('texto sin encabezado\n', 2).ok).toBe(false);
  expect(validateSubtreeText('* Subido de nivel\n', 2).ok).toBe(false);
  const r = validateSubtreeText('** A\n** B hermano\n', 2);
  expect(r.ok).toBe(false);
  expect(r.soft).toBe(true);
});
