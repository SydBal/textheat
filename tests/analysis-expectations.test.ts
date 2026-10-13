import { describe, expect, it } from 'vitest';
import { analyze, getTheme, heat } from '../src/api/index';

const paletteCases = [
  { text: 'The interface is excellent.', span: 'excellent', category: 'positive', sentiment: 'positive' },
  { text: 'The delivery was terrible.', span: 'terrible', category: 'negative', sentiment: 'negative' },
  { text: 'I love it.', span: 'love', category: 'joy', sentiment: 'positive', emotion: 'joy' },
  { text: 'I am furious about the delay.', span: 'furious', category: 'anger', sentiment: 'negative', emotion: 'anger' },
  { text: 'I feel sad today.', span: 'sad', category: 'sadness', sentiment: 'negative', emotion: 'sadness' },
  { text: 'I am anxious about the deadline.', span: 'anxious', category: 'fear', sentiment: 'negative', emotion: 'fear' },
  { text: 'The update was a pleasant surprise.', span: 'pleasant surprise', category: 'surprise', sentiment: 'positive', emotion: 'surprise' },
] as const;

describe('expected analysis and palette examples', () => {
  it.each(paletteCases)('renders "$span" with the $category palette', example => {
    const result = analyze(example.text);
    expect(result.highlights.map(prediction => prediction.text)).toEqual([example.span]);
    const [prediction] = result.highlights;
    expect(prediction!.sentiment).toBe(example.sentiment);
    expect(prediction!.emotion).toBe('emotion' in example ? example.emotion : undefined);
    const color = getTheme()[example.category];
    const rendered = heat(example.text);
    expect(rendered).toContain(`data-sentiment="${example.sentiment}"`);
    if ('emotion' in example) expect(rendered).toContain(`data-emotion="${example.emotion}"`);
    expect(rendered).toContain(`background-color:${color.background};color:${color.color}`);
    expect(rendered).toContain(`>${example.span}</span>`);
  });

  it('composes modifiers and negative noun heads into a single expected span', () => {
    const cases = [
      { text: 'The result is absolutely beautiful.', span: 'absolutely beautiful', sentiment: 'positive', score: 4, rules: ['degree-modifier'] },
      { text: 'The launch was a great disappointment.', span: 'great disappointment', sentiment: 'negative', emotion: 'sadness', score: -3.22, rules: ['negative-noun-composition'] },
      { text: 'The result was not good.', span: 'not good', sentiment: 'negative', score: -1.8, rules: ['lexical-phrase'] },
      { text: 'The result is not happy.', span: 'not happy', sentiment: 'negative', score: -1.82, rules: ['negation-scope'] },
    ] as const;
    for (const example of cases) {
      const result = analyze(example.text);
      expect(result.highlights.map(prediction => prediction.text)).toEqual([example.span]);
      const prediction = result.highlights[0]!;
      expect(prediction.sentiment).toBe(example.sentiment);
      expect(prediction.score).toBeCloseTo(example.score);
      expect(prediction.rules).toEqual(expect.arrayContaining([...example.rules]));
      expect(prediction.emotion).toBe('emotion' in example ? example.emotion : undefined);
    }
  });

  it('combines positive and negative clauses while retaining target-specific evidence', () => {
    const input = 'The interface is beautiful, but the support is awful.';
    const result = analyze(input);
    expect(result.sentiment.label).toBe('mixed');
    expect(result.highlights.map(({ text, sentiment }) => [text, sentiment])).toEqual([
      ['beautiful', 'positive'], ['awful', 'negative']
    ]);
    expect(result.clauses.filter(clause => clause.evidence.length).map(({ sentiment, contrast }) => [sentiment, contrast])).toEqual([
      ['positive', false], ['negative', true]
    ]);
    expect(result.aspects.map(({ text, sentiment, evidence }) => [text, sentiment, evidence.map(item => item.text)])).toEqual([
      ['interface', 'positive', ['beautiful']], ['support', 'negative', ['awful']]
    ]);
    expect(result.sentiment.scores.positive).toBeGreaterThan(0);
    expect(result.sentiment.scores.negative).toBeGreaterThan(0);
    expect(Object.values(result.sentiment.distribution).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it('preserves coordinated evidence and withholds uncertain opinions', () => {
    const coordinated = analyze('The interface and navigation are intuitive and reliable.');
    expect(coordinated.highlights.map(item => item.text)).toEqual(['intuitive', 'reliable']);
    expect(coordinated.aspects.map(aspect => [aspect.text, aspect.evidence.map(item => item.text)])).toEqual([
      ['interface', ['intuitive', 'reliable']], ['navigation', ['intuitive', 'reliable']]
    ]);

    const uncertain = analyze('Maybe the update will be wonderful?');
    expect(uncertain.highlights).toEqual([]);
    expect(uncertain.ambiguity).toContain('Hedged or hypothetical opinion');
    expect(uncertain.sentiment.label).toBe('uncertain');
    expect(analyze('The package arrived on Tuesday.').sentiment.label).toBe('neutral');
  });

  it('shows emphasis in score without claiming calibrated confidence', () => {
    const plain = analyze('This is good.').highlights[0]!;
    const emphatic = analyze('This is GOOD!!!').highlights[0]!;
    expect(emphatic.score).toBeGreaterThan(plain.score);
    expect(emphatic.rules).toEqual(expect.arrayContaining(['capitalization-emphasis', 'punctuation-emphasis']));
    expect(emphatic.confidence).toBeNull();
    expect(analyze('This is excellent.', { threshold: 0.9 }).highlights).toEqual([]);
  });
});
