import { describe, expect, it } from 'vitest';
import { analyze, scoreSentiment, tokenize } from '../src/api/index';
import { lexicon } from '../src/core/lexicon';

const score = (text: string) => scoreSentiment(tokenize(text), { text });
const last = (text: string) => score(text).at(-1)!;

describe('bounded transparent contextual reasoning', () => {
  it.each(['not only', 'not just', 'not merely', 'not simply', 'no doubt', 'without doubt'])('does not invert %s reliable', cue => {
    const p = last(`${cue} reliable`);
    expect(p.score).toBe(lexicon.get('reliable')!.score);
    expect(p.rules).toContain('negation-exception');
    expect(p.rules).not.toContain('negation-scope');
    expect(p.explanation).toMatch(/does not negate|expresses certainty/);
    expect(p.ambiguity).toEqual([]);
  });

  it('does not let a certainty/additive exception escape actual negation', () => {
    expect(last('not good').score).toBe(lexicon.get('not good')!.score);
    expect(last('not just not reliable').score).toBeCloseTo(-2 * 0.7);
    expect(last('no doubt not reliable').score).toBeCloseTo(-2 * 0.7);
    expect(last('without doubt not good').sentiment).toBe('negative');
    expect(last('not just bad').sentiment).toBe('negative');
  });

  it.each([
    ['free of bugs', 'buggy'], ['free from errors', 'error'], ['free of problems', 'problem'],
    ['without problems', 'problem'], ['without errors', 'error'], ['without delays', 'slow']
  ])('scores only explicit negative-noun absence: %s', (text, lexeme) => {
    const p = last(text);
    expect(p.score).toBeCloseTo(lexicon.get(lexeme)!.score * -0.7);
    expect(p.rules).toContain('absence-of-negative');
    expect(p.text).toBe(text);
    expect(p.heuristicConfidence).toBe(0.64);
    expect(p.emotion).toBeUndefined();
    expect(p.explanation).toContain('scaled by -0.7');
  });

  it.each([['lack of support', 'helpful'], ['lacks reliability', 'reliability']])('scores narrow positive-noun lack: %s', (text, lexeme) => {
    const p = last(text);
    expect(p.score).toBeCloseTo(lexicon.get(lexeme)!.score * -0.7);
    expect(p.rules).toContain('lack-of-positive');
    expect(p.text).toBe(text);
    expect(last(`not ${text}`).score).toBeCloseTo(lexicon.get(lexeme)!.score * 0.49);
    expect(last(`not ${text}`).rules).toContain('negation-scope');
  });

  it('does not generalize absence, invent standalone noun scores, or cross clauses', () => {
    for (const text of ['without doubt reliable', 'without reliable support', 'free. Problems', 'without\nerrors', 'free of, problems', 'lack of. Support']) {
      expect(score(text).every(p => !p.rules?.includes('absence-of-negative') && !p.rules?.includes('lack-of-positive'))).toBe(true);
    }
    for (const text of ['bugs', 'errors', 'problems', 'delays', 'support']) {
      expect(score(text).map(p => p.score)).toEqual(lexicon.has(text) ? [lexicon.get(text)!.score] : []);
    }
    expect(last('not free of problems').sentiment).toBe('negative');
    expect(last('not without problems').sentiment).toBe('negative');
  });

  it('scales narrow comparisons rather than treating less as a polarity reversal', () => {
    expect(last('less useful').score).toBeCloseTo(2 * 0.65);
    expect(last('more reliable').score).toBeCloseTo(2 * 1.15);
    expect(last('less useful').rules).toContain('comparative-degree');
    expect(last('more reliable').text).toBe('more reliable');
    expect(last('less. Useful').score).toBe(2);
    expect(last('not more reliable').score).toBeCloseTo(2 * 1.15 * -0.7);
  });

  it.each(['If the interface is reliable.', 'Unless the interface is reliable.', 'The interface would be reliable.', 'The interface could be reliable.'])('abstains locally: %s', text => {
    const p = last(text);
    expect(p.score).toBe(2);
    expect(p.heuristicConfidence).toBe(0.44);
    expect(p.rules).toContain('hypothetical-scope');
    expect(p.ambiguity).toEqual(['Hedged or hypothetical opinion']);
    expect(p.explanation).toContain('bounded preceding modal or conditional cue');
    expect(analyze(text).highlights).toEqual([]);
    expect(analyze(text, { minConfidence: 0, threshold: 0 }).highlights).toHaveLength(1);
  });

  it('does not leak hypothetical scope across sentence, newline, comma, contrast or coordination boundaries', () => {
    for (const boundary of ['. ', '\n', ', ', ' but ', ' and ']) {
      const items = score(`If the app is useful${boundary}the interface is reliable.`);
      expect(items[0]!.heuristicConfidence).toBe(0.44);
      expect(items[1]!.heuristicConfidence).toBe(0.78);
      expect(items[1]!.rules).not.toContain('hypothetical-scope');
    }
    expect(last('If one two three four five six seven eight reliable').rules).not.toContain('hypothetical-scope');
  });

  it('marks narrowly framed excess/insufficiency ambiguous without blanket adjective flips', () => {
    const too = last('too slow to use');
    expect(too.score).toBeCloseTo(-1.5 * 1.2);
    expect(too.rules).toContain('excess-to-frame');
    expect(too.heuristicConfidence).toBe(0.44);
    const insufficient = last('not reliable enough');
    expect(insufficient.score).toBeCloseTo(2 * -0.7);
    expect(insufficient.rules).toContain('insufficient-enough-frame');
    expect(insufficient.heuristicConfidence).toBe(0.44);
    expect(last('too fast to use').score).toBeGreaterThan(0);
    expect(last('too fast to use').ambiguity).toContain('Excess may prevent the stated action');
    expect(last('too slow. To use').rules).not.toContain('excess-to-frame');
    expect(last('not reliable. Enough').rules).not.toContain('insufficient-enough-frame');
    expect(last('too beautiful to describe').rules).not.toContain('excess-to-frame');
    expect(analyze('too slow to use').highlights).toEqual([]);
  });

  it('uses existing negative noun-head scores without turning great support negative', () => {
    for (const noun of ['defect', 'flaws', 'glitches', 'failures']) {
      const p = last(`great ${noun}`);
      expect(p.text).toBe(`great ${noun}`);
      expect(p.score).toBeCloseTo(lexicon.get(noun)!.score * 1.15);
      expect(p.rules).toContain('negative-noun-composition');
    }
    expect(score('great support')[0]!.score).toBe(2.5);
    expect(score('great. Defect')[0]!.sentiment).toBe('positive');
  });

  it('preserves exact UTF-16 offsets and synchronous independent scoring', () => {
    const text = '🧡 free\tfrom   errors; not lack of support. If the app is reliable.';
    for (const p of score(text)) {
      expect(text.slice(p.start, p.end)).toBe(p.text);
      expect(p.confidence).toBeNull();
    }
    expect(scoreSentiment(tokenize('without errors'))[0]!.score).toBeCloseTo(1.5 * 0.7);
    expect(analyze(text)).not.toBeInstanceOf(Promise);
  });
});