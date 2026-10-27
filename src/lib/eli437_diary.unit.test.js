import { dayAnchorId, dayAnchorHref } from './eli_diary_print';

test('anclas del diario: id y enlace coinciden', () => {
  expect(dayAnchorId('2026-10-26')).toBe('dia-2026-10-26');
  expect(dayAnchorHref('2026-10-26')).toBe('#dia-2026-10-26');
});
