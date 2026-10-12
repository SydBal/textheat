import { describe, expect, it } from 'vitest';
import { reviewEntries } from '../src/core/lexicon-reviews';
import { domainEntries } from '../src/core/lexicon-domains';
import { expandedEntries } from '../src/core/lexicon-expanded';
import { lexicon, lexiconStats, maxPhraseWords } from '../src/core/lexicon';
import { scoreSentiment } from '../src/core/sentiment';
import { tokenize } from '../src/core/tokenize';

const score = (text: string) => scoreSentiment(tokenize(text), { text });
const emotions = new Set(['joy', 'anger', 'sadness', 'fear', 'surprise']);

describe('individually authored review vocabulary', () => {
  it('adds unique keys without overlapping any previous dictionary layer', () => {
    const keys = reviewEntries.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    const oldLayers = new Set([...domainEntries, ...expandedEntries].map(([key]) => key));
    // Every compact baseline key is also covered by the legacy fingerprint test.
    const baselineKeys = `
      good great excellent wonderful fantastic beautiful amazing perfect helpful reliable
      love loved lovely like happy joy delighted excited enjoy enjoyed grateful pleased
      bad terrible awful horrible poor disappointing disappointed disappointment
      frustrating frustrated angry anger furious hate hated sad miserable heartbroken
      afraid scared anxious worried terrified fear surprised astonished slow broken
      crash crashes crashed unusable useless failure fail failed disaster rude boring
      waste error satisfied satisfying delicious comfortable smooth problem mess pain
      annoying fast intuitive responsive efficient easy nice impressive useful friendly
      polished clunky confusing buggy laggy unreliable unresponsive unpleasant difficult
    `.trim().split(/\s+/u);
    const baselinePhrases = ['not bad', 'not good', 'no problem', 'well done', 'crashes constantly',
      'falls short', 'fell short', 'let down', 'pleasant surprise', 'fed up', 'on cloud nine'];
    for (const key of [...baselineKeys, ...baselinePhrases]) oldLayers.add(key);
    expect(oldLayers.size).toBe(5642);
    expect(keys.filter(key => oldLayers.has(key))).toEqual([]);
    expect(keys).toHaveLength(339);
    expect(keys.filter(key => !key.includes(' '))).toHaveLength(213);
    expect(keys.filter(key => key.includes(' '))).toHaveLength(126);
    expect(lexiconStats).toEqual({ entries: 5981, words: 1850, phrases: 4131, maxPhraseWords: 12 });
    expect(lexiconStats.entries).toBeGreaterThanOrEqual(5642 + 200);
    expect(maxPhraseWords).toBe(12);
  });

  it('uses normalized exact tokenizer keys and finite conservative authored values', () => {
    for (const [key, value, emotion] of reviewEntries) {
      expect(key, key).toBe(key.normalize('NFKC').toLowerCase().trim());
      expect(key, key).toMatch(/^[a-z]+(?:'[a-z]+)?(?: [a-z]+(?:'[a-z]+)?)*$/u);
      expect(tokenize(key).map(token => token.normalized).join(' '), key).toBe(key);
      expect(Number.isFinite(value), key).toBe(true);
      expect(Math.abs(value), key).toBeGreaterThan(0);
      expect(Math.abs(value), key).toBeLessThanOrEqual(4);
      if (emotion !== undefined) expect(emotions.has(emotion), key).toBe(true);
      expect(lexicon.get(key), key).toEqual({ score: value, emotion });
    }
  });

  it('scores every addition as one exact complete span, including its internal modifiers', () => {
    for (const [key, value, emotion] of reviewEntries) {
      const predictions = score(key);
      expect(predictions, key).toHaveLength(1);
      expect(predictions[0], key).toMatchObject({
        text: key, start: 0, end: key.length, score: value, emotion,
        sentiment: value > 0 ? 'positive' : 'negative'
      });
      expect(predictions[0]!.rules, key).not.toContain('negation-scope');
      expect(predictions[0]!.rules, key).toContain(key.includes(' ') ? 'lexical-phrase' : 'lexical-term');
    }
  });

  it.each([
    ['dysfunctional', -2.6, undefined], ['nonfunctional', -2.6, undefined],
    ['masterful', 2.8, undefined], ['insightful', 2.2, undefined],
    ['overjoyed', 3.2, 'joy'], ['distraught', -2.8, 'sadness'],
    ['seething', -3, 'anger'], ['nervous', -1.8, 'fear'],
    ['blindsided', -2.1, 'surprise'], ['overcharged', -2.1, undefined],
    ['silently drops my changes', -2.7, undefined],
    ['handles interruptions gracefully', 2.3, undefined],
    ['felt genuinely listened to', 2.2, undefined],
    ['charged me after cancellation', -2.6, undefined],
    ['not ready for everyday use', -2.3, undefined]
  ])('keeps the exact authored reading of %s', (text, value, emotion) => {
    expect(score(text)).toHaveLength(1);
    expect(score(text)[0]).toMatchObject({ text, score: value, emotion });
  });

  it('does not duplicate malfunctioning or add factual observation heads and frames', () => {
    const keys = new Set(reviewEntries.map(([key]) => key));
    expect(keys.has('malfunctioning')).toBe(false);
    expect(lexicon.get('malfunctioning')).toEqual({ score: -2, emotion: undefined });
    for (const key of ['problems', 'issues', 'bugs', 'errors', 'delays', 'support',
      'issue', 'bug', 'delay', 'observation', 'connection', 'button', 'settings', 'refund']) {
      expect(keys.has(key), key).toBe(false);
    }
    expect([...keys].filter(key => /^(?:i )?(?:don't|dont|do not|cannot|can't) see\b/u.test(key))).toEqual([]);
    expect(score('Buttons and settings are listed beside the refund form.')).toEqual([]);
    expect(score('The connection uses a cable.')).toEqual([]);
  });

  it('does not infer unlisted spellings or inflections', () => {
    for (const key of ['dysfunctionals', 'nonfunctionals', 'masterfull', 'overjoyeds', 'jankier', 'overchargez']) {
      expect(lexicon.has(key), key).toBe(false);
      expect(score(key), key).toEqual([]);
    }
    expect(lexicon.get('skilful')).toEqual(lexicon.get('skillful'));
    expect(lexicon.get('mislabeled')).toEqual(lexicon.get('mislabelled'));
    expect(lexicon.get('empathize')).toEqual(lexicon.get('empathise'));
  });

  it('preserves mixed case, whitespace and UTF-16 source offsets', () => {
    const text = '🧡 café: Felt\t genuinely   listened to. Handles interruptions gracefully.';
    const predictions = score(text);
    expect(predictions.map(item => item.text)).toEqual([
      'Felt\t genuinely   listened to', 'Handles interruptions gracefully'
    ]);
    expect(predictions.map(item => item.score)).toEqual([2.2, 2.3]);
    expect(predictions[0]!.start).toBe(text.indexOf('Felt'));
    for (const item of predictions) expect(text.slice(item.start, item.end)).toBe(item.text);
  });

  it('does not bridge punctuation, hyphens or newline boundaries in any added phrase', () => {
    for (const [key] of reviewEntries.filter(([key]) => key.includes(' '))) {
      for (const boundary of [', ', '\n', '-']) {
        const text = key.replace(' ', boundary);
        expect(score(text).some(item => item.text === text), text).toBe(false);
      }
    }
  });

  it('keeps internal negation authored and external negation scoped', () => {
    const phrase = 'not ready for everyday use';
    expect(score(phrase)[0]).toMatchObject({ text: phrase, score: -2.3, sentiment: 'negative' });
    expect(score(phrase)[0]!.rules).not.toContain('negation-scope');
    expect(score(`not ${phrase}`)[0]).toMatchObject({ score: 2.3 * 0.7, sentiment: 'positive' });
    expect(score('not masterful')[0]).toMatchObject({ score: -2.8 * 0.7, sentiment: 'negative' });
    expect(score('not\nmasterful')[0]).toMatchObject({ text: 'masterful', score: 2.8 });
    expect(score('not overjoyed')[0]).toMatchObject({ sentiment: 'negative', emotion: undefined });
  });
});