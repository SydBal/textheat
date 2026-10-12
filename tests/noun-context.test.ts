import { describe, expect, it } from 'vitest';
import { analyze, heat, scoreSentiment, tagTokens, tokenize } from '../src/api/index';
import { lexicon } from '../src/core/lexicon';
import { recognizeNounContext } from '../src/core/noun-context';

const score = (text: string) => scoreSentiment(tokenize(text), { text });
const observation = (text: string) => score(text).filter(p => p.rules?.includes('negative-noun-observation'));

describe('bounded noun-head context', () => {
  it.each(["don't", 'don’t', 'dont'])('highlights the whole %s observation positively at defaults', cue => {
    const phrase = `${cue} see any functional problems`;
    const text = `I ${phrase}.`;
    const result = analyze(text);
    expect(result.highlights).toHaveLength(1);
    const p = result.highlights[0]!;
    expect(p.text).toBe(phrase);
    expect(p.start).toBe(2);
    expect(p.end).toBe(2 + phrase.length);
    expect(p.sentiment).toBe('positive');
    expect(p.score).toBeCloseTo(1.36);
    expect(p.importance).toBeCloseTo(0.34);
    expect(p.heuristicConfidence).toBe(0.64);
    expect(p.emotion).toBeUndefined();
    expect(p.rules).toContain('negative-noun-observation');
    expect(p.rules).not.toContain('lexical-phrase');
    expect(p.explanation).toContain('scaled by -0.8');
    expect(result.clauses.flatMap(c => c.evidence)).toHaveLength(1);
    expect(heat(text)).toContain(phrase.replaceAll("'", '&#39;'));
    expect(heat(text)).toContain('textheat-positive');
  });

  it.each(['see', 'find', 'notice', 'detect', 'encounter', 'experience', 'have'])('recognizes only a complete negated %s frame', verb => {
    for (const determiner of ['', 'any ', 'a ']) {
      const text = `dont ${verb} ${determiner}functional problems`;
      expect(observation(text)).toHaveLength(1);
      expect(observation(text)[0]!.text).toBe(text);
      expect(observation(text)[0]!.score).toBeCloseTo(1.36);
    }
  });

  it.each(["don't", "doesn't", "didn't", "can't", 'cannot', "couldn't", "won't", "wouldn't",
    "shouldn't", "haven't", "hasn't", 'not', 'never', 'dont'])('recognizes the explicit observation negator %s without changing its global spelling', cue => {
    const text = `${cue} see functional problems`;
    expect(observation(text)).toHaveLength(1);
    expect(observation(text)[0]!.text).toBe(text);
    expect(observation(text)[0]!.score).toBeCloseTo(1.36);
  });

  it('handles singular heads and scoring without source text, while retaining contextual-only fallback scores', () => {
    for (const head of ['problem', 'issue', 'bug', 'error', 'defect', 'flaw', 'glitch', 'delay', 'failure', 'crash']) {
      const text = `dont find a technical ${head}`;
      expect(observation(text)).toHaveLength(1);
      expect(scoreSentiment(tokenize(text))[0]!.text).toBe(text);
    }
    expect(heat('<script>dont see functional problems</script>')).not.toContain('<script>');
  });

  it.each(['problems', 'issues', 'bugs', 'errors', 'defects', 'flaws', 'glitches', 'delays', 'failures', 'crashes'])('uses %s as the contextual head, never as a new standalone lexeme', head => {
    const phrase = `dont see any functional ${head}`;
    expect(analyze(phrase).highlights).toHaveLength(1);
    expect(score(phrase)).toHaveLength(1);
    expect(score(phrase)[0]!.sentiment).toBe('positive');
    expect(score(head).map(p => p.score)).toEqual(lexicon.has(head) ? [lexicon.get(head)!.score] : []);
  });

  it.each(['functional', 'technical', 'major', 'minor', 'serious', 'recurring', 'performance', 'usability',
    'operational', 'structural', 'critical', 'intermittent', 'persistent', 'significant', 'severe',
    'unexpected', 'known', 'potential', 'practical'])('accepts the explicitly listed descriptor %s', descriptor => {
    expect(observation(`dont see any ${descriptor} problems`)).toHaveLength(1);
    expect(score(`${descriptor} problems`)).toHaveLength(1);
    expect(score(`${descriptor} problems`)[0]!.score).toBeCloseTo(-1.7 * 1.15);
  });

  it('accepts zero to three descriptors, but refuses an unknown or fourth descriptor', () => {
    for (const descriptors of ['', 'functional ', 'major functional ', 'major recurring functional ']) {
      expect(observation(`dont see any ${descriptors}problems`)).toHaveLength(1);
    }
    for (const descriptors of ['major serious recurring functional ', 'zorbastic ', 'functionnal ']) {
      expect(observation(`dont see any ${descriptors}problems`)).toEqual([]);
    }
  });

  it('confines funcitonal and dont spelling support to the complete observation frame', () => {
    for (const cue of ["don't", 'don’t', 'dont']) {
      const text = `${cue} see any funcitonal problems`;
      expect(score(text)).toHaveLength(1);
      expect(score(text)[0]!.text).toBe(text);
      expect(score(text)[0]!.rules).toContain('observation-descriptor-typo');
      expect(analyze(text).highlights[0]!.sentiment).toBe('positive');
    }
    for (const text of ['funcitonal', 'funcitonal problems', 'no funcitonal problems', 'do see funcitonal problems', 'dont see functional', 'dont functional']) {
      expect(observation(text)).toEqual([]);
      expect(score(text).every(p => !p.rules?.includes('observation-descriptor-typo') && !p.rules?.includes('observation-negator-spelling'))).toBe(true);
    }
    expect(score('dont useful')[0]!.score).toBe(lexicon.get('useful')!.score);
  });

  it('distinguishes observation negation, negative noun composition and absent positive qualities', () => {
    for (const text of ['functional problems', 'do see functional problems']) {
      expect(score(text)).toHaveLength(1);
      expect(score(text)[0]!.sentiment).toBe('negative');
      expect(score(text)[0]!.text).toBe('functional problems');
    }
    for (const text of ["don't see functional problems", 'no functional problems']) {
      expect(analyze(text).highlights).toHaveLength(1);
      expect(analyze(text).highlights[0]!.sentiment).toBe('positive');
    }
    expect(score('no functional problems')[0]!.score).toBeCloseTo(-1.7 * 1.15 * -0.7);
    expect(observation("don't see any functional improvements")).toEqual([]);
    expect(score("don't see any functional improvements").length).toBeGreaterThan(0);
    expect(score("don't see any functional improvements").every(p => p.score < 0)).toBe(true);
    expect(score('no positive accomplishments').every(p => !p.rules?.includes('negative-noun-composition'))).toBe(true);
  });

  it.each(['. ', ', ', '; ', ': ', '! ', '? ', '\n', '\r\n', ' and ', ' or ', ' but ', ' because ', ' if ', ' unless ', ' when '])('does not cross %j inside an observation', boundary => {
    for (const text of [`dont${boundary}see any functional problems`, `dont see${boundary}any functional problems`,
      `dont see any functional${boundary}problems`]) expect(observation(text)).toEqual([]);
  });

  it('preserves Unicode, tabs and UTF-16 offsets, ordered nonoverlapping evidence and independent clauses', () => {
    const phrase = 'don’t\tsee  any\tmajor recurring funcitonal problems';
    const text = `🧡 I ${phrase}; but the interface is excellent.`;
    const items = score(text);
    expect(items).toHaveLength(2);
    expect(items[0]!.text).toBe(phrase);
    expect(items[0]!.start).toBe(5);
    expect(items[1]!.text).toBe('excellent');
    for (const [i, p] of items.entries()) {
      expect(text.slice(p.start, p.end)).toBe(p.text);
      if (i) expect(p.start).toBeGreaterThanOrEqual(items[i - 1]!.end);
    }
    expect(score('dont see any functional problems but functional issues')[1]!.score).toBeLessThan(0);
  });

  it('applies external modifiers once and prevents false green under additional negation', () => {
    expect(score('really dont see any functional problems')[0]!.score).toBeCloseTo(-1.7 * -0.8 * 1.25);
    expect(score('very functional problems')[0]!.score).toBeCloseTo(-1.7 * 1.15 * 1.35);
    for (const text of ["not don't see functional problems", 'not dont see functional problems',
      "don't see no functional problems", "don't think there are no problems", "don't think there are no functional problems"]) {
      expect(score(text)).toHaveLength(1);
      expect(score(text)[0]!.sentiment).toBe('negative');
    }
    expect(score('not only dont see functional problems')[0]!.sentiment).toBe('positive');
  });

  it.each(['If I dont see any functional problems.', 'Unless I dont see functional problems.',
    'I would not see functional problems.', 'I could not see functional problems.',
    "I wouldn't see functional problems.", "I couldn't see functional problems.", "I shouldn't see functional problems.",
    'Do I not see functional problems?', 'I dont see any functional problems?'])('abstains for uncertain %s', text => {
    const p = observation(text)[0]!;
    expect(p.heuristicConfidence).toBe(0.44);
    expect(p.ambiguity!.length).toBeGreaterThan(0);
    expect(analyze(text).highlights).toEqual([]);
    expect(analyze(text, { minConfidence: 0, threshold: 0 }).highlights).toHaveLength(1);
  });

  it('does not leak external negation or uncertainty across a boundary', () => {
    for (const boundary of ['. ', ', ', '\n', ' and ', ' but ']) {
      const p = observation(`not maybe${boundary}dont see functional problems`)[0]!;
      expect(p.sentiment).toBe('positive');
      expect(p.heuristicConfidence).toBe(0.64);
    }
  });

  it('preserves exact legacy lexical phrases, including their original scores', () => {
    for (const text of ['not good', 'not bad', 'well done', 'no problem', 'crashes constantly', 'pleasant surprise']) {
      expect(score(text)).toHaveLength(1);
      expect(score(text)[0]!.score).toBe(lexicon.get(text)!.score);
      expect(score(text)[0]!.rules).toContain('lexical-phrase');
      expect(recognizeNounContext(tokenize(text), 0, text)).toBeUndefined();
    }
    expect(score('great disappointment')[0]!.score).toBeCloseTo(-2.8 * 1.15);
  });

  it('keeps frame scaffolding out of aspects and tags head/descriptor roles', () => {
    expect(tagTokens(tokenize('functional problems technical issues')).map(t => t.pos)).toEqual(['adjective', 'noun', 'adjective', 'noun']);
    for (const text of ['The app has no functional problems.', 'The app has functional problems.',
      'The app does not experience any technical issues.', 'I dont see any funcitonal problems.']) {
      expect(analyze(text).aspects.map(a => a.text)).toEqual(text.startsWith('The app') ? ['app'] : []);
    }
  });
});