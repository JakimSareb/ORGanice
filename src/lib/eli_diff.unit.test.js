import { diffBlocks, changeCount, mergeBlocks } from './eli_diff';
import { sameContents } from './eli_conflicts';

const mine = ['* TODO A', '* TODO B mía', '* C', '* D', '* E nueva mía', ''].join('\n');
const theirs = ['* TODO A', '* TODO B dropbox', '* C', '* D', '* F nueva dropbox', ''].join('\n');

test('bloques de diferencias', () => {
  const blocks = diffBlocks(mine, theirs);
  expect(changeCount(blocks)).toBe(2);
  expect(blocks[0]).toEqual({ type: 'same', lines: ['* TODO A'] });
  expect(blocks[1]).toEqual({
    type: 'change',
    mine: ['* TODO B mía'],
    theirs: ['* TODO B dropbox'],
  });
  expect(blocks[2]).toEqual({ type: 'same', lines: ['* C', '* D'] });
  expect(blocks[3]).toEqual({
    type: 'change',
    mine: ['* E nueva mía'],
    theirs: ['* F nueva dropbox'],
  });
});

test('combinar', () => {
  const blocks = diffBlocks(mine, theirs);
  expect(mergeBlocks(blocks)).toBe(mine);
  expect(mergeBlocks(blocks, ['theirs', 'theirs'])).toBe(theirs);
  expect(mergeBlocks(blocks, ['theirs', 'both'])).toBe(
    ['* TODO A', '* TODO B dropbox', '* C', '* D', '* E nueva mía', '* F nueva dropbox', ''].join(
      '\n'
    )
  );
});

test('solo añadidos o borrados, e iguales', () => {
  const b = diffBlocks('a\nb\n', 'a\nx\nb\n');
  expect(b).toEqual([
    { type: 'same', lines: ['a'] },
    { type: 'change', mine: [], theirs: ['x'] },
    { type: 'same', lines: ['b'] },
  ]);
  expect(mergeBlocks(b, ['theirs'])).toBe('a\nx\nb\n');
  expect(changeCount(diffBlocks('a\r\nb', 'a\nb\n'))).toBe(0);
  expect(sameContents('a\nb\n\n', 'a\nb')).toBe(true);
  expect(sameContents('a\nb', 'a\nc')).toBe(false);
});
