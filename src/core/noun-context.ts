import { lexicon, maxPhraseWords, type Lexeme } from './lexicon';
import type { Token } from './types';

/** Closed vocabulary: these are grammatical descriptors here, not new lexemes. */
export const nounDescriptors: ReadonlySet<string> = new Set([
  'functional', 'technical', 'major', 'minor', 'serious', 'recurring', 'performance',
  'usability', 'operational', 'structural', 'critical', 'intermittent', 'persistent',
  'significant', 'severe', 'unexpected', 'known', 'potential', 'practical'
]);
export const observationVerbs: ReadonlySet<string> = new Set([
  'see', 'find', 'notice', 'detect', 'encounter', 'experience', 'have'
]);
/** Fallbacks apply only in a recognized frame; never introduce standalone scores. */
const headFallbacks: ReadonlyMap<string, number> = new Map([
  ['problem', -1.7], ['problems', -1.7], ['issue', -2], ['issues', -2],
  ['bug', -2.5], ['bugs', -2.5], ['error', -1.5], ['errors', -1.5],
  ['defect', -2], ['defects', -2], ['flaw', -2], ['flaws', -2],
  ['glitch', -2], ['glitches', -2], ['delay', -1.5], ['delays', -1.5],
  ['failure', -2.5], ['failures', -2.5], ['crash', -2.4], ['crashes', -2.4]
]);
export const contextualNegativeHeads: ReadonlySet<string> = new Set(headFallbacks.keys());
const observationNegators = new Set(["don't", "doesn't", "didn't", "can't", 'cannot',
  "couldn't", "won't", "wouldn't", "shouldn't", "haven't", "hasn't", 'not', 'never', 'dont']);

export interface NounContext {
  length: number;
  entry: Lexeme;
  observation: boolean;
  negations: number;
  descriptors: number;
  typo: boolean;
}

/** Recognize before lexical scoring, consuming the entire bounded noun frame once.
 * Exact phrases at its starting token retain precedence. No punctuation, newline,
 * conjunction, unknown descriptor, or fourth descriptor can be crossed.
 */
export function recognizeNounContext(tokens: Token[], start: number, text?: string): NounContext | undefined {
  const word = (i: number) => tokens[i]?.kind === 'word' ? tokens[i]!.normalized : undefined;
  const first = word(start) ?? '';
  if (!nounDescriptors.has(first) && !observationNegators.has(first) && first !== 'no') return undefined;
  const adjacent = (i: number) => word(i) !== undefined && word(i + 1) !== undefined
    && (text === undefined || /^[ \t]+$/u.test(text.slice(tokens[i]!.end, tokens[i + 1]!.start)));
  // Only multiword matches matter: a lexical adjective must not defeat its noun head.
  let phrase = first;
  for (let i = start; i < Math.min(tokens.length - 1, start + maxPhraseWords - 1) && adjacent(i); i++) {
    phrase += ` ${word(i + 1)}`;
    if (lexicon.has(phrase)) return undefined;
  }
  let cursor = start;
  let observation = false, negations = 0, descriptors = 0, typo = false;
  if (observationNegators.has(word(cursor) ?? '') && adjacent(cursor)
    && observationVerbs.has(word(cursor + 1) ?? '')) {
    observation = true; negations = 1; cursor += 2;
    if (!adjacent(cursor - 1)) return undefined;
    if (['any', 'a', 'no'].includes(word(cursor) ?? '')) {
      if (word(cursor) === 'no') negations++;
      cursor++;
      if (!adjacent(cursor - 1)) return undefined;
    }
  } else if (word(cursor) === 'no' && adjacent(cursor)) {
    negations = 1; cursor++;
  }
  while (nounDescriptors.has(word(cursor) ?? '') || observation && word(cursor) === 'funcitonal') {
    if (++descriptors > 3 || !adjacent(cursor)) return undefined;
    typo ||= word(cursor) === 'funcitonal';
    cursor++;
  }
  const head = word(cursor);
  if (!head || !headFallbacks.has(head) || !observation && !negations && !descriptors) return undefined;
  const lexicalHead = lexicon.get(head);
  const entry = lexicalHead && lexicalHead.score < 0 ? lexicalHead : { score: headFallbacks.get(head)! };
  return { length: cursor - start + 1, entry, observation, negations, descriptors, typo };
}