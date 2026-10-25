import { normalizeTagsPos, getTagsPos, setTagsPos } from './eli_tags_pos';

describe('4.30 posición de las etiquetas', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setTagsPos('side');
  });

  test('valores raros = al lado', () => {
    expect(normalizeTagsPos('below')).toBe('below');
    expect(normalizeTagsPos('side')).toBe('side');
    expect(normalizeTagsPos(null)).toBe('side');
    expect(normalizeTagsPos('x')).toBe('side');
  });

  test('debajo pone la clase en body y se guarda; al lado la quita', () => {
    setTagsPos('below');
    expect(getTagsPos()).toBe('below');
    expect(document.body.classList.contains('eli-tags-below')).toBe(true);
    expect(window.localStorage.getItem('eliTagsPos')).toBe('below');
    setTagsPos('side');
    expect(document.body.classList.contains('eli-tags-below')).toBe(false);
  });
});
