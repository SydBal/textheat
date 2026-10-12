import type { Emotion } from './types';
import { expandedEntries } from './lexicon-expanded';
import { domainEntries } from './lexicon-domains';
export interface Lexeme { score: number; emotion?: Emotion }
// Original compact English baseline; no third-party lexicon or training data.
const entries: [string, number, Emotion?][] = [
  ['good', 1.8], ['great', 2.5], ['excellent', 3.3], ['wonderful', 3.2], ['fantastic', 3.4],
  ['beautiful', 2.8], ['amazing', 3.2], ['perfect', 3.4], ['helpful', 2], ['reliable', 2],
  ['love', 3, 'joy'], ['loved', 3, 'joy'], ['lovely', 2.5, 'joy'], ['like', 1.1],
  ['happy', 2.6, 'joy'], ['joy', 3, 'joy'], ['delighted', 3.2, 'joy'], ['excited', 2.6, 'joy'],
  ['enjoy', 2.4, 'joy'], ['enjoyed', 2.4, 'joy'], ['grateful', 2.5, 'joy'], ['pleased', 2.2, 'joy'],
  ['bad', -2], ['terrible', -3.5], ['awful', -3.4], ['horrible', -3.5], ['poor', -2],
  ['disappointing', -2.8, 'sadness'], ['disappointed', -2.8, 'sadness'], ['disappointment', -2.8, 'sadness'],
  ['frustrating', -2.8, 'anger'], ['frustrated', -2.8, 'anger'], ['angry', -3, 'anger'],
  ['anger', -3, 'anger'], ['furious', -3.6, 'anger'], ['hate', -3.4, 'anger'], ['hated', -3.4, 'anger'],
  ['sad', -2.6, 'sadness'], ['miserable', -3, 'sadness'], ['heartbroken', -3.5, 'sadness'],
  ['afraid', -2.5, 'fear'], ['scared', -2.6, 'fear'], ['anxious', -2.5, 'fear'], ['worried', -2.2, 'fear'],
  ['terrified', -3.5, 'fear'], ['fear', -2.5, 'fear'], ['surprised', 0.6, 'surprise'], ['astonished', 1, 'surprise'],
  ['slow', -1.5], ['broken', -2.8], ['crash', -2.4], ['crashes', -2.4], ['crashed', -2.4],
  ['unusable', -3], ['useless', -3], ['failure', -2.5], ['fail', -2.3], ['failed', -2.5],
  ['disaster', -3.3], ['rude', -2.5], ['boring', -1.8], ['waste', -2], ['error', -1.5],
  ['satisfied', 2.3], ['satisfying', 2.3], ['delicious', 2.8], ['comfortable', 2.2], ['smooth', 1.8],
  ['problem', -1.7], ['mess', -2.4], ['pain', -2.2], ['annoying', -2.4, 'anger'],
  ['fast', 1.6], ['intuitive', 2.2], ['responsive', 2.1], ['efficient', 2], ['easy', 1.8],
  ['nice', 1.7], ['impressive', 2.5], ['useful', 2], ['friendly', 2.2], ['polished', 2.1],
  ['clunky', -2], ['confusing', -2.2], ['buggy', -2.5], ['laggy', -2.2], ['unreliable', -2.5],
  ['unresponsive', -2.5], ['unpleasant', -2.2], ['difficult', -1.7],
  ['not bad', 0.9], ['not good', -1.8], ['no problem', 1.2], ['well done', 2.5],
  ['crashes constantly', -3], ['falls short', -2.3], ['fell short', -2.3], ['let down', -2.6, 'sadness'],
  ['pleasant surprise', 2.3, 'surprise'], ['fed up', -2.8, 'anger'], ['on cloud nine', 3.2, 'joy']
];
// Old expansion and baseline last: preserve every previously authored value.
export const lexicon: ReadonlyMap<string, Lexeme> = new Map(
  [...domainEntries, ...expandedEntries, ...entries].map(([word, score, emotion]) => [word, { score, emotion }])
);
export const maxPhraseWords = Math.max(...Array.from(lexicon.keys(), key => key.split(' ').length));
/** Counts describe unique merged keys, not source rows or estimated coverage. */
export const lexiconStats: Readonly<{
  entries: number; words: number; phrases: number; maxPhraseWords: number;
}> = Object.freeze({
  entries: lexicon.size,
  words: Array.from(lexicon.keys()).filter(key => !key.includes(' ')).length,
  phrases: Array.from(lexicon.keys()).filter(key => key.includes(' ')).length,
  maxPhraseWords
});
export const intensifiers: ReadonlyMap<string, number> = new Map([
  ['very', 1.35], ['really', 1.25], ['extremely', 1.6], ['absolutely', 1.5], ['incredibly', 1.5],
  ['so', 1.2], ['too', 1.2], ['slightly', 0.65], ['somewhat', 0.75], ['barely', 0.5]
]);
export const negators = new Set(['not', 'no', 'never', 'neither', 'hardly', "don't", "doesn't", "didn't", "isn't", "wasn't", "aren't", "weren't", "can't", 'cannot', "couldn't", "won't", "wouldn't", "shouldn't", "haven't", "hasn't"]);
export const contrasts = new Set(['but', 'however', 'yet', 'although', 'though']);