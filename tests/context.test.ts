import { describe, expect, it } from 'vitest';
import { analyze, heat, segmentClauses, tagTokens, tokenize } from '../src/api/index';

describe('deeper fast contextual analysis', () => {
  it('tags basic grammatical roles without modifying tokens', () => {
    const tokens = tokenize('The interface is very beautiful.');
    expect(tagTokens(tokens).map(t => t.pos)).toEqual(['determiner', 'noun', 'verb', 'adverb', 'adjective', 'punctuation']);
    expect(tokens.some(t => 'pos' in t)).toBe(false);
  });
  it('composes evaluative adjectives with negative emotional nouns', () => {
    const result = analyze('The launch was a great disappointment.');
    expect(result.highlights.map(p => p.text)).toEqual(['great disappointment']);
    expect(result.sentiment.label).toBe('negative');
    expect(result.highlights[0]!.rules).toContain('negative-noun-composition');
    expect(analyze('a wonderful disaster').highlights[0]!.sentiment).toBe('negative');
  });
  it('recognizes longer negation without crossing boundaries', () => {
    expect(analyze("I don't think the interface is good.").highlights[0]!.sentiment).toBe('negative');
    expect(analyze("I don't think it is good, but the support is excellent.").highlights[1]!.sentiment).toBe('positive');
    expect(analyze('not only good but excellent').highlights[0]!.sentiment).toBe('positive');
  });
  it('uses capitalization and bounded repeated exclamation emphasis', () => {
    expect(analyze('This is GOOD!!!').highlights[0]!.importance).toBeGreaterThan(analyze('This is good.').highlights[0]!.importance);
    expect(analyze('This is GOOD!!!').highlights[0]!.rules).toEqual(expect.arrayContaining(['capitalization-emphasis', 'punctuation-emphasis']));
    expect(analyze('GOOD').highlights[0]!.rules).not.toContain('capitalization-emphasis');
    expect(analyze('very good').highlights[0]!.importance).toBeGreaterThan(analyze('slightly good', { threshold: 0 }).highlights[0]!.importance);
  });
  it('abstains from ambiguous praise, questions and hypotheticals', () => {
    for (const text of ['Is the interface good?', 'The interface might be good.', 'Great, another crash.']) {
      const result = analyze(text);
      expect(result.ambiguity.length).toBeGreaterThan(0);
      if (!text.includes(',')) expect(result.highlights).toHaveLength(0);
      else expect(result.highlights.some(p => p.text === 'Great')).toBe(false);
    }
    const result = analyze('Great another crash.');
    expect(result.ambiguity).toContain('Possible ironic praise beside a repeated negative event');
    expect(result.highlights.some(p => p.text === 'Great')).toBe(false);
    expect(analyze('Is the interface good?', { minConfidence: 0 }).highlights[0]!.ambiguity).toContain('Question rather than an asserted opinion');
    expect(analyze('Excellent\nIs the app good?').highlights[0]!.text).toBe('Excellent');
    expect(analyze('The food is good but is the service awful?').highlights[0]!.text).toBe('good');
  });
  it('separates clause polarity and associates aspect evidence', () => {
    const text = 'The interface is beautiful, but the app crashes constantly.';
    const result = analyze(text);
    expect(result.clauses.filter(c => c.evidence.length).map(c => c.sentiment)).toEqual(['positive', 'negative']);
    expect(result.aspects.map(a => [a.text, a.sentiment])).toEqual([['interface', 'positive'], ['app', 'negative']]);
    expect(result.clauses.find(c => c.text.includes('crashes'))!.contrast).toBe(true);
    for (const span of [...result.clauses, ...result.aspects]) expect(text.slice(span.start, span.end)).toBe(span.text);
  });
  it('finds transitive objects and multiword aspects without inventing coreference', () => {
    expect(analyze('I love the interface.').aspects[0]!.text).toBe('interface');
    expect(analyze('The customer service was awful.').aspects[0]!.text).toBe('customer service');
    expect(analyze('I love it.').aspects).toEqual([]);
    expect(analyze('Maybe the update will be wonderful?').aspects[0]!.text).toBe('update');
    expect(analyze('The interface might be good.').aspects[0]!.text).toBe('interface');
    expect(analyze("I'm excited.").aspects).toEqual([]);
  });
  it('retains unhighlighted evidence and abstention reasons in clauses', () => {
    const result = analyze('The interface might be good.', { threshold: 1 });
    expect(result.highlights).toEqual([]);
    expect(result.clauses[0]!.evidence).toHaveLength(1);
    expect(result.aspects[0]!.sentiment).toBe('uncertain');
  });
  it.each(['Excellent customer service.', 'I love the customer service.', 'The customer service is excellent.'])('attributes complete compound targets in %s', input => {
    const result = analyze(input);
    expect(result.aspects.map(a => a.text)).toEqual(['customer service']);
    expect(result.aspects[0]!.evidence).toHaveLength(1);
    expect(input.slice(result.aspects[0]!.start, result.aspects[0]!.end)).toBe('customer service');
  });
  it('shares a subject across coordinated predicates without losing evidence', () => {
    const result = analyze('The interface is good and beautiful and reliable.');
    expect(result.aspects.map(a => a.text)).toEqual(['interface']);
    expect(result.aspects[0]!.evidence.map(p => p.text)).toEqual(['good', 'beautiful', 'reliable']);
    expect(result.clauses.flatMap(c => c.evidence).map(p => p.text)).toEqual(['good', 'beautiful', 'reliable']);
  });
  it('does not invent subject inheritance across sentences, contrast, or explicit pronouns', () => {
    for (const input of ['The interface is good. Beautiful.', 'The interface is good but beautiful.', 'The interface is good and I am happy.']) {
      expect(analyze(input).aspects[0]!.evidence.map(p => p.text)).toEqual(['good']);
    }
    const result = analyze('The interface is good and the service is awful.');
    expect(result.aspects.map(a => [a.text, a.sentiment])).toEqual([['interface', 'positive'], ['service', 'negative']]);
  });
  it('recognizes common fresh evaluative vocabulary without attributing factual nouns', () => {
    expect(analyze('The app is fast and intuitive.').aspects[0]!.evidence.map(p => p.text)).toEqual(['fast', 'intuitive']);
    expect(analyze('The dashboard is clunky and confusing.').aspects[0]!.sentiment).toBe('negative');
    expect(tagTokens(tokenize('friendly'))[0]!.pos).toBe('adjective');
    expect(analyze('The package contains three books.').aspects).toEqual([]);
    expect(analyze('The app is zorbastic.').highlights).toEqual([]);
  });
  it('keeps exact whitespace, Unicode offsets and safe rendering', () => {
    const text = '🧡 The interface is GOOD!!\nThe app is a great disappointment <b>today</b>.';
    expect(segmentClauses(text).every(c => text.slice(c.start, c.end) === c.text)).toBe(true);
    expect(heat(text)).toContain('&lt;b&gt;');
    const result = analyze(text);
    expect(result.highlights.every((p, i, spans) => i === 0 || p.start >= spans[i - 1]!.end)).toBe(true);
  });
  it.each([
    ['The interface and navigation are intuitive.', ['interface', 'navigation']],
    ['The customer service and account dashboard are reliable.', ['customer service', 'account dashboard']],
    ['The interface and navigation and dashboard are useful.', ['interface', 'navigation', 'dashboard']]
  ])('attributes bounded explicit coordinated subjects: %s', (input, targets) => {
    const result = analyze(input as string);
    expect(result.aspects.map(a => a.text)).toEqual(targets);
    expect(result.clauses.filter(c => c.evidence.length)).toHaveLength(1);
    for (const aspect of result.aspects) {
      expect(aspect.sentiment).toBe('positive');
      expect(aspect.evidence[0]!.rules).toContain('coordinated-explicit-targets');
      expect((input as string).slice(aspect.start, aspect.end)).toBe(aspect.text);
    }
  });
  it('shares coordinated targets across predicates, not across sentences or new subjects', () => {
    const result = analyze('The interface and navigation are intuitive and reliable. It is good.');
    expect(result.aspects.map(a => a.text)).toEqual(['interface', 'navigation']);
    for (const a of result.aspects) expect(a.evidence.map(p => p.text)).toEqual(['intuitive', 'reliable']);
    expect(analyze('The interface and it are reliable.').aspects.map(a => a.text)).not.toContain('it');
    expect(analyze('The interface and navigation and dashboard and toolbar are useful.').aspects.length).toBeLessThanOrEqual(1);
  });
  it('distinguishes opinion verb objects from their explicit subjects and refuses pronoun antecedents', () => {
    expect(analyze('I love the interface.').aspects.map(a => a.text)).toEqual(['interface']);
    const result = analyze('The interface loved the navigation.');
    expect(result.aspects.map(a => a.text)).toEqual(['navigation']);
    expect(result.aspects[0]!.evidence[0]!.rules).toContain('opinion-verb-object');
    expect(analyze('The interface never loved the navigation.').aspects.map(a => a.text)).toEqual(['navigation']);
    expect(analyze('The interface never loved it.').aspects).toEqual([]);
    expect(tagTokens(tokenize('The interface loves the navigation.'))[2]!.pos).toBe('verb');
    expect(analyze('The interface loved it.').aspects).toEqual([]);
    expect(analyze('The interface is reliable. I love it.').aspects[0]!.evidence.map(p => p.text)).toEqual(['reliable']);
  });
  it('does not turn absence scaffolding or comparison modifiers into aspect nouns', () => {
    for (const input of ['The app lacks reliability.', 'The app has a lack of support.', 'The app is free of bugs.', 'The app is without errors.', 'The app is more reliable.', 'The app is less useful.']) {
      expect(analyze(input, { threshold: 0 }).aspects.map(a => a.text)).toEqual(['app']);
    }
  });
});