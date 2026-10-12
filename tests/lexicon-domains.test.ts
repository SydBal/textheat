import { describe, expect, it } from 'vitest';
import { scoreSentiment } from '../src/core/sentiment';
import { tokenize } from '../src/core/tokenize';
import { domainEntries } from '../src/core/lexicon-domains';
import { expandedEntries } from '../src/core/lexicon-expanded';
import { lexicon, lexiconStats, maxPhraseWords } from '../src/core/lexicon';

const score = (text: string) => scoreSentiment(tokenize(text), { text });
const emotions = new Set(['joy', 'anger', 'sadness', 'fear', 'surprise']);

describe('original domain vocabulary and local opinion phrases', () => {
  it('does not silently deduplicate additions and records exact unique counts', () => {
    const keys = domainEntries.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    const oldExpandedKeys = new Set(expandedEntries.map(([key]) => key));
    expect(keys.filter(key => oldExpandedKeys.has(key))).toEqual([]);
    const mergedKeys = [...lexicon.keys()];
    const words = mergedKeys.filter(key => !key.includes(' ')).length;
    expect(lexiconStats).toEqual({
      entries: mergedKeys.length,
      words,
      phrases: mergedKeys.length - words,
      maxPhraseWords: Math.max(...mergedKeys.map(key => key.split(' ').length))
    });
    expect(lexiconStats).toEqual({ entries: 5981, words: 1850, phrases: 4131, maxPhraseWords: 12 });
    expect(keys).toHaveLength(4250);
    expect(keys.filter(key => !key.includes(' '))).toHaveLength(536);
    expect(keys.filter(key => key.includes(' '))).toHaveLength(3714);
    expect(lexiconStats.entries).toBeGreaterThanOrEqual(5642 + 200);
    expect(lexiconStats.phrases).toBeGreaterThanOrEqual(700);
    expect(maxPhraseWords).toBeLessThanOrEqual(12);
    expect(Object.isFrozen(lexiconStats)).toBe(true);
    for (const count of Object.values(lexiconStats)) {
      expect(Number.isSafeInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it('uses only exact normalized tokenizable keys and bounded finite values', () => {
    for (const [key, value, emotion] of domainEntries) {
      expect(key, key).toBe(key.normalize('NFKC').toLowerCase().trim());
      expect(key, key).toMatch(/^[a-z]+(?:'[a-z]+)?(?: [a-z]+(?:'[a-z]+)?)*$/u);
      expect(tokenize(key).map(token => token.normalized).join(' '), key).toBe(key);
      expect(Number.isFinite(value), key).toBe(true);
      expect(Math.abs(value), key).toBeGreaterThan(0);
      expect(Math.abs(value), key).toBeLessThanOrEqual(4);
      if (emotion !== undefined) expect(emotions.has(emotion), key).toBe(true);
    }
    for (const [key, value] of lexicon) {
      expect(Number.isFinite(value.score), key).toBe(true);
      expect(Math.abs(value.score), key).toBeLessThanOrEqual(4);
      if (value.emotion !== undefined) expect(emotions.has(value.emotion), key).toBe(true);
    }
  });

  it('keeps existing expanded scores except where the original baseline won', () => {
    // These are the preexisting expansion/baseline overlaps; all other old
    // expansion values must survive, even when a domain row shares their key.
    const baselineWins = new Set(`
      reliable delighted grateful satisfied satisfying excited horrible terrible
      awful unreliable crashed crashes buggy laggy unresponsive unusable clunky
      confusing useless disappointing disappointed rude furious miserable
      heartbroken afraid scared terrified anxious worried unpleasant boring
      intuitive responsive efficient
    `.trim().split(/\s+/u));
    for (const [key, value, emotion] of expandedEntries) {
      if (!baselineWins.has(key)) expect(lexicon.get(key), key).toEqual({ score: value, emotion });
    }
  });

  it('matches every addition as one complete span without changing authored polarity', () => {
    for (const [key] of domainEntries) {
      const predictions = score(key);
      expect(predictions, key).toHaveLength(1);
      expect(predictions[0], key).toMatchObject({
        text: key, start: 0, end: key.length,
        score: lexicon.get(key)!.score, emotion: lexicon.get(key)!.emotion
      });
      expect(predictions[0]!.rules, key).not.toContain('negation-scope');
    }
  });

  it.each([
    ['the subscription was worth the asking price', 'positive', undefined],
    ['the refund process was full of unexplained charges', 'negative', undefined],
    ['the support agent was patient with my questions', 'positive', undefined],
    ['the chair was falling apart after light use', 'negative', undefined],
    ['the parcel delivery was handled with care', 'positive', undefined],
    ['the settings menu was intuitive without a tutorial', 'positive', undefined],
    ['the backup system was prone to losing my work', 'negative', undefined],
    ['the privacy policy was respectful of my choices', 'positive', undefined],
    ['the hotel room was too noisy for restful sleep', 'negative', undefined],
    ['the train journey was comfortable throughout', 'positive', undefined],
    ['the soup was cold when it should have been hot', 'negative', undefined],
    ['the cake was a delightful treat', 'positive', undefined],
    ['the cafe service was careful about my dietary requirements', 'positive', undefined],
    ['the lesson was full of misleading examples', 'negative', undefined],
    ['the team discussion was respectful of different viewpoints', 'positive', undefined],
    ['the manager was inconsiderate of my workload', 'negative', undefined],
    ['the ticket machine was usable with my assistive technology', 'positive', undefined],
    ['the venue entrance was inaccessible with a mobility aid', 'negative', undefined],
    ['the safety briefing was misleading about the risks', 'negative', undefined],
    ['the complaint handling was fair to everyone involved', 'positive', undefined],
    ['i felt deeply appreciated after the visit', 'positive', 'joy'],
    ['i felt angry about the unfairness after the meeting', 'negative', 'anger'],
    ['i felt deeply let down after the trip', 'negative', 'sadness'],
    ['i felt afraid for my wellbeing after the appointment', 'negative', 'fear'],
    ['i felt pleasantly astonished after the event', 'positive', 'surprise'],
    ['fine workmanship', 'positive', undefined],
    ['sick of being ignored', 'negative', undefined],
    ['they carried my bags with care', 'positive', undefined],
    ['they were carrying my bags carefully', 'positive', undefined]
  ])('recognizes a representative authored reading: %s', (text, sentiment, emotion) => {
    expect(score(text)).toHaveLength(1);
    expect(score(text)[0]).toMatchObject({ text, sentiment, emotion });
  });

  it('respects internal negation, external negation and newline boundaries', () => {
    const internal = 'the purchase was not worth the asking price';
    expect(score(internal)[0]).toMatchObject({ text: internal, sentiment: 'negative', score: -2.2 });
    expect(score(internal)[0]!.rules).not.toContain('negation-scope');
    expect(score(`not ${internal}`)[0]).toMatchObject({ sentiment: 'positive', score: 2.2 * 0.7 });
    expect(score('not fine workmanship')[0]).toMatchObject({ sentiment: 'negative', score: -1.8 * 0.7 });
    expect(score('not\nfine workmanship')[0]).toMatchObject({ text: 'fine workmanship', sentiment: 'positive' });
    expect(score('not fine workmanship. equitable').map(item => item.sentiment)).toEqual(['negative', 'positive']);
    expect(score('not fine workmanship and equitable').map(item => item.sentiment)).toEqual(['negative', 'positive']);
  });

  it('does not bridge punctuation, newlines or hyphens in new qualified phrases', () => {
    for (const text of ['fine, workmanship', 'fine\nworkmanship', 'fine-workmanship']) {
      expect(score(text), text).toEqual([]);
    }
    for (const text of ['the cake was, a delightful treat', 'the cake was\na delightful treat', 'the cake was-a delightful treat']) {
      expect(score(text).some(item => item.text === text), text).toBe(false);
    }
  });

  it('preserves mixed case, tabs, curly apostrophes and UTF-16 source offsets', () => {
    const text = '🧡 café: The\t soup  was cold when it should have been hot. I couldn’t be happier.';
    const predictions = score(text);
    expect(predictions.map(item => item.text)).toEqual([
      'The\t soup  was cold when it should have been hot', 'couldn’t be happier'
    ]);
    expect(predictions[0]!.start).toBe(text.indexOf('The'));
    for (const item of predictions) expect(text.slice(item.start, item.end)).toBe(item.text);
  });

  it('does not turn neutral homonyms or factual domain nouns into emotional words', () => {
    for (const key of ['fine', 'sound', 'cold', 'charge', 'sick', 'cheap', 'patient', 'appeal', 'transparent',
      'soup', 'cake', 'subscription', 'privacy', 'consent', 'security', 'keyboard', 'carry', 'carried', 'carrying',
      'superlative', 'underhand', 'fret', 'frets', 'fretted', 'fretting', 'nettles', 'predatory', 'desolation']) {
      expect(lexicon.has(key), key).toBe(false);
    }
    expect(score('The soup was in the kitchen. The cake was on the table.')).toEqual([]);
    expect(score('The charge was listed on the form. The patient carried a bag.')).toEqual([]);
    expect(score('The privacy policy was revised on Tuesday.')).toEqual([]);
  });
});