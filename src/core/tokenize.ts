import type { Token } from './types';

/** Offsets are JavaScript UTF-16 code units, not grapheme indices. */
export function tokenize(text: string): Token[] {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*|[^\s]/gu), match => ({
    text: match[0], normalized: match[0].normalize('NFKC').toLowerCase().replaceAll('’', "'"),
    start: match.index, end: match.index + match[0].length,
    kind: /^[\p{L}\p{N}\p{M}]/u.test(match[0]) ? 'word' : 'punctuation'
  }));
}