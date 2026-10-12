import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyze, scoreSentiment, tokenize } from '../src/api/index';
import { expandedEntries } from '../src/core/lexicon-expanded';
import { reviewEntries } from '../src/core/lexicon-reviews';
import { lexicon, lexiconStats, maxPhraseWords } from '../src/core/lexicon';

const score = (text: string) => scoreSentiment(tokenize(text), { text });

describe('original expanded English lexicon', () => {
  it('preserves the old expansion counts and meets the new unique coverage floor', () => {
    const keys = expandedEntries.map(([key]) => key);
    expect(keys).toHaveLength(1326);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter(key => key.includes(' '))).toHaveLength(280);
    expect(lexicon.size).toBeGreaterThanOrEqual(5642 + 200);
    expect(lexiconStats.phrases).toBeGreaterThanOrEqual(700);
  });

  it('preserves all 1392 legacy keys, scores and emotion assignments', () => {
    const baselineOnlyWords = `
      good great excellent wonderful fantastic beautiful amazing perfect helpful
      love loved lovely like happy joy enjoy enjoyed pleased bad poor disappointment
      frustrating frustrated angry anger hate hated sad fear surprised astonished
      slow broken crash failure fail failed disaster waste error delicious comfortable
      smooth problem mess pain annoying fast easy nice impressive useful friendly
      polished difficult
    `.trim().split(/\s+/u);
    const baselineOnlyPhrases = [
      'not bad', 'not good', 'no problem', 'well done', 'crashes constantly',
      'falls short', 'fell short', 'let down', 'pleasant surprise', 'fed up', 'on cloud nine'
    ];
    const legacyKeys = new Set([
      ...expandedEntries.map(([key]) => key), ...baselineOnlyWords, ...baselineOnlyPhrases
    ]);
    expect(legacyKeys.size).toBe(1392);
    const legacyValues = [...legacyKeys].map(key => [key, lexicon.get(key)] as const)
      .sort(([a], [b]) => a.localeCompare(b, 'en'));
    // Golden fingerprint of the complete pre-domain merged dictionary, not
    // merely examples or comparisons against the currently edited source data.
    expect(createHash('sha256').update(JSON.stringify(legacyValues)).digest('hex'))
      .toBe('a21b38d59e4bc8106391a2fca05fe72fc0145a8cce201fc2576d581b370e7e07');
  });

  it('preserves every one of the 5642 pre-review keys, scores and emotions', () => {
    const additionKeys = new Set(reviewEntries.map(([key]) => key));
    const oldValues = [...lexicon].filter(([key]) => !additionKeys.has(key))
      .sort(([a], [b]) => a.localeCompare(b, 'en'));
    expect(oldValues).toHaveLength(5642);
    // Captured before the review layer existed: all domain, expansion and
    // baseline values, including their original merge precedence.
    expect(createHash('sha256').update(JSON.stringify(oldValues)).digest('hex'))
      .toBe('02d23153cc55ced117b96f247d2314b02c9d4c93e601b124001e3147f0fa4056');
  });

  it('uses normalized, tokenizer-compatible keys and finite conservative scores', () => {
    for (const [key, value, emotion] of expandedEntries) {
      expect(key).toBe(key.normalize('NFKC').toLowerCase().trim());
      expect(key).toMatch(/^[a-z]+(?:'[a-z]+)?(?: [a-z]+(?:'[a-z]+)?)*$/u);
      expect(tokenize(key).map(token => token.normalized).join(' ')).toBe(key);
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeGreaterThan(0);
      expect(Math.abs(value)).toBeLessThanOrEqual(4);
      if (emotion) expect(['joy', 'anger', 'sadness', 'fear', 'surprise']).toContain(emotion);
    }
  });

  it('can match every expanded key as one span, including internal negation', () => {
    for (const [key] of expandedEntries) {
      const result = score(key);
      expect(result, key).toHaveLength(1);
      expect(result[0]!.text, key).toBe(key);
      expect(result[0]!.score, key).toBe(lexicon.get(key)!.score);
      expect(result[0]!.emotion, key).toBe(lexicon.get(key)!.emotion);
      expect(result[0]!.rules, key).not.toContain('negation-scope');
    }
  });

  it.each([
    ['reliable', 2, undefined], ['intuitive', 2.2, undefined],
    ['efficient', 2, undefined], ['responsive', 2.1, undefined],
    ['delighted', 3.2, 'joy'], ['grateful', 2.5, 'joy'],
    ['satisfied', 2.3, undefined], ['satisfying', 2.3, undefined],
    ['excited', 2.6, 'joy'], ['horrible', -3.5, undefined],
    ['terrible', -3.5, undefined], ['awful', -3.4, undefined],
    ['unreliable', -2.5, undefined], ['crashed', -2.4, undefined],
    ['crashes', -2.4, undefined], ['buggy', -2.5, undefined],
    ['laggy', -2.2, undefined], ['unresponsive', -2.5, undefined],
    ['unusable', -3, undefined], ['clunky', -2, undefined],
    ['confusing', -2.2, undefined], ['useless', -3, undefined],
    ['disappointing', -2.8, 'sadness'], ['disappointed', -2.8, 'sadness'],
    ['rude', -2.5, undefined], ['furious', -3.6, 'anger'],
    ['miserable', -3, 'sadness'], ['heartbroken', -3.5, 'sadness'],
    ['afraid', -2.5, 'fear'], ['scared', -2.6, 'fear'],
    ['terrified', -3.5, 'fear'], ['anxious', -2.5, 'fear'],
    ['worried', -2.2, 'fear'], ['unpleasant', -2.2, undefined],
    ['boring', -1.8, undefined], ['not bad', 0.9, undefined],
    ['not good', -1.8, undefined], ['on cloud nine', 3.2, 'joy']
  ])('preserves the baseline entry %s', (key, value, emotion) => {
    expect(lexicon.get(key as string)).toEqual({ score: value, emotion });
  });

  it.each([
    ['meticulous', 'positive', undefined], ['overpriced', 'negative', undefined],
    ['jubilant', 'positive', 'joy'], ['exasperated', 'negative', 'anger'],
    ['despondent', 'negative', 'sadness'], ['apprehensive', 'negative', 'fear'],
    ['awestruck', 'positive', 'surprise'],
    ['would happily buy again', 'positive', undefined],
    ['not worth the money at all', 'negative', undefined],
    ['put a smile on my face', 'positive', 'joy'],
    ['scared out of my mind', 'negative', 'fear'],
    ['caught me off guard in a bad way', 'negative', 'surprise']
  ])('recognizes representative vocabulary: %s', (text, sentiment, emotion) => {
    const result = analyze(text as string, { threshold: 0 }).highlights;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ text, sentiment, emotion });
    expect(result[0]!.confidence).toBeNull();
  });

  it('derives the longest phrase limit and prefers a complete phrase', () => {
    expect(maxPhraseWords).toBe(Math.max(...[...lexicon.keys()].map(key => key.split(' ').length)));
    expect(maxPhraseWords).toBeGreaterThanOrEqual(8);
    expect(maxPhraseWords).toBeLessThanOrEqual(12);
    expect(score('not worth the money at all')[0]!.text).toBe('not worth the money at all');
    expect(score('well worth the extra money')[0]!.text).toBe('well worth the extra money');
  });

  it('retains the baseline span and target for excellent customer service', () => {
    const result = analyze('Excellent customer service.');
    expect(result.highlights.map(item => item.text)).toEqual(['Excellent']);
    expect(result.aspects.map(item => item.text)).toEqual(['customer service']);
  });

  it('preserves UTF-16 offsets, mixed case, apostrophes, spaces and tabs', () => {
    const text = '🧡 café: Would\t happily   buy again. I couldn’t be happier.';
    const result = score(text);
    expect(result.map(item => item.text)).toEqual(['Would\t happily   buy again', 'couldn’t be happier']);
    expect(result[0]!.start).toBe(text.indexOf('Would'));
    for (const item of result) expect(text.slice(item.start, item.end)).toBe(item.text);
  });

  it('does not join phrases across punctuation, newlines or hyphens', () => {
    for (const text of ['worth, every penny', 'worth\nevery penny', 'worth-every penny']) {
      expect(score(text).some(item => item.rules?.includes('lexical-phrase'))).toBe(false);
    }
    expect(score('not\nworth it')[0]).toMatchObject({ text: 'worth it', sentiment: 'positive' });
  });

  it('distinguishes internal negation from preceding external negation', () => {
    for (const text of ['not worth it', 'would not buy again', 'does not disappoint', "couldn't be happier"]) {
      expect(score(text)[0]!.rules).not.toContain('negation-scope');
    }
    expect(score('not worth it')[0]!.sentiment).toBe('negative');
    expect(score('does not disappoint')[0]!.sentiment).toBe('positive');
    expect(score('never highly recommend')[0]).toMatchObject({ sentiment: 'negative', score: -2.3 * 0.7 });
    expect(score('not not worth it')[0]).toMatchObject({ sentiment: 'positive', score: 2.5 * 0.7 });
    expect(score('not jubilant')[0]).toMatchObject({ sentiment: 'negative', emotion: undefined });
    expect(score('not only meticulous')[0]!.sentiment).toBe('positive');
    expect(score('not meticulous. dependable').map(item => item.sentiment)).toEqual(['negative', 'positive']);
    expect(score('not meticulous and dependable').map(item => item.sentiment)).toEqual(['negative', 'positive']);
  });

  it('keeps factual or strongly ambiguous standalone vocabulary unscored', () => {
    for (const key of ['fine', 'sound', 'cold', 'sick', 'cheap', 'charge', 'patient', 'appeal', 'accommodation', 'consideration', 'transparent']) {
      expect(lexicon.has(key)).toBe(false);
    }
    expect(analyze('The patient has a cold. The charge appears on page three.').sentiment.label).toBe('neutral');
    expect(analyze('The package arrived on Tuesday and contains three books.').highlights).toEqual([]);
  });
});