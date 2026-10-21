import type { Emotion } from './types';

export interface EmojiSentiment { score: number; emotion?: Emotion }

/** Curated emoji evidence, scored conservatively below equivalent words.
 * Static data only: no models, no network, no dependencies. Keys are stored
 * without variation selectors because the tokenizer emits the base symbol and
 * U+FE0F as separate tokens. Unlisted emoji carry no sentiment evidence.
 * Standalone heart symbols are deliberately excluded: they are used as
 * decoration at least as often as as sentiment (this project's own fixtures
 * and branding included), while faces and gestures are unambiguous.
 */
const entries: ReadonlyArray<readonly [string, number, Emotion?]> = [
  // Joy and affection faces.
  ['😍', 2.2, 'joy'], ['🤩', 2.2, 'joy'], ['🥰', 2, 'joy'], ['😂', 1.9, 'joy'], ['🤣', 1.9, 'joy'],
  ['😊', 1.7, 'joy'], ['😄', 1.7, 'joy'], ['😁', 1.7, 'joy'], ['😆', 1.7, 'joy'], ['🎉', 1.7, 'joy'],
  ['😋', 1.5, 'joy'], ['😌', 1.2, 'joy'], ['😅', 1, 'joy'], ['😉', 1, 'joy'],
  // Approval gestures carry polarity without a specific emotion.
  ['👍', 1.2], ['👏', 1.4], ['🙏', 1],
  // Anger.
  ['🤬', -2.4, 'anger'], ['😡', -2.2, 'anger'], ['😠', -2, 'anger'], ['😤', -1.6, 'anger'],
  // Sadness.
  ['😭', -2.1, 'sadness'], ['😢', -1.8, 'sadness'], ['😞', -1.6, 'sadness'],
  ['😔', -1.4, 'sadness'], ['🥺', -1.1, 'sadness'],
  // Fear and worry.
  ['😱', -1.9, 'fear'], ['😨', -1.7, 'fear'], ['😰', -1.7, 'fear'], ['😟', -1.4, 'fear'],
  // Surprise reads mildly positive, like amazement.
  ['😮', 0.9, 'surprise'], ['😲', 0.9, 'surprise'], ['😳', 0.7, 'surprise'],
  // Disapproval and disgust carry polarity without a specific emotion.
  ['👎', -1.2], ['🤮', -2], ['💩', -1.4], ['🙄', -1]
];

export const emojiSentiment: ReadonlyMap<string, EmojiSentiment> = new Map(
  entries.map(([symbol, score, emotion]) => [symbol.replace(/\uFE0F/gu, ''), emotion ? { score, emotion } : { score }])
);
