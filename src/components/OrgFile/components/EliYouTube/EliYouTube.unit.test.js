import { youTubeId, youTubeStart } from './index';
import { parseMarkupAndCookies } from '../../../../lib/parse_org';

test('reconoce enlaces de YouTube', () => {
  expect(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  expect(youTubeId('https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
  expect(youTubeId('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe('dQw4w9WgXcQ');
  expect(youTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  expect(youTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  expect(youTubeId('https://www.youtube.com/channel/UCxyz')).toBe(null);
  expect(youTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBe(null);
  expect(youTubeStart('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
  expect(youTubeStart('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(90);
});

test('el parser de organice detecta URLs de YouTube sueltas y entre corchetes', () => {
  const parts = parseMarkupAndCookies(
    'Mira https://youtu.be/dQw4w9WgXcQ y [[https://www.youtube.com/watch?v=dQw4w9WgXcQ][este vídeo]]'
  );
  const bare = parts.filter((p) => p.type === 'url').map((p) => p.content);
  const links = parts.filter((p) => p.type === 'link').map((p) => p.contents.uri);
  expect(bare.map(youTubeId)).toEqual(['dQw4w9WgXcQ']);
  expect(links.map(youTubeId)).toEqual(['dQw4w9WgXcQ']);
});
