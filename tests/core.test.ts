import { describe, expect, it } from 'vitest';
import text, { analyze, calibrate, createTextheat, escapeHTML, getTheme, heat, renderHTML, scoreImportance, scoreSentiment, tokenize } from '../src/api/index';

describe('public API and contextual baseline', () => {
  it('exposes all independent functions and the default synchronous API', () => {
    expect(typeof text.heat('excellent')).toBe('string');
    expect(text.analyze('excellent').sentiment.label).toBe('positive');
    expect(scoreImportance(tokenize('very good'), { text: 'very good' })[0]!.importance).toBeGreaterThan(0.5);
    expect(scoreSentiment(tokenize('awful'))[0]!.score).toBeLessThan(0);
    expect(escapeHTML(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
    expect(renderHTML('good', analyze('good'))).toBe(heat('good'));
  });
  it.each([
    ['The new design is absolutely beautiful.', 'positive', ['absolutely beautiful']],
    ['The delivery was slow and the packaging was awful.', 'negative', ['slow', 'awful']],
    ['I love the interface, but the app crashes constantly.', 'mixed', ['love', 'crashes constantly']],
    ['The result was not good.', 'negative', ['not good']],
    ['This is not bad.', 'positive', []],
    ['This is not bad.', 'positive', ['not bad'], 0],
    ['The package arrived on Tuesday and contains three books.', 'neutral', []],
    ["It isn't very good.", 'negative', ["isn't very good"], 0],
    ['It is not really happy.', 'negative', ['not really happy']],
    ['It is not only good but excellent.', 'positive', ['good', 'excellent']],
    ['not good, wonderful', 'mixed', ['not good', 'wonderful']],
    ['It looks like a book.', 'neutral', []]
  ])('handles %s', (input, label, spans, threshold = 0.3) => {
    const result = analyze(input as string, { threshold: threshold as number });
    expect(result.sentiment.label).toBe(label);
    expect(result.highlights.map(p => p.text)).toEqual(spans);
  });
  it('keeps negation local and intensifies phrase importance', () => {
    expect(analyze('not good. great').highlights[1]!.sentiment).toBe('positive');
    expect(analyze('not\ngood').highlights[0]!.sentiment).toBe('positive');
    expect(analyze('very good').highlights[0]!.importance).toBeGreaterThan(analyze('good').highlights[0]!.importance);
    expect(() => heat('not wonderful good bad not awful')).not.toThrow();
    expect(analyze('good however awful').sentiment.label).toBe('mixed');
  });
  it('selects longest non-overlapping phrases and preserves spacing', () => {
    const input = '  very\tgood, crashes   constantly!\n';
    expect(analyze(input).highlights.map(p => p.text)).toEqual(['very\tgood', 'crashes   constantly']);
    for (const p of analyze(input).highlights) expect(input.slice(p.start, p.end)).toBe(p.text);
  });
  it('preserves UTF-16 offsets for Unicode, apostrophes and combining marks', () => {
    const input = '🧡 café e\u0301  我愛你 — I don’t love this.\nExcellent!';
    for (const token of tokenize(input)) expect(input.slice(token.start, token.end)).toBe(token.text);
    for (const p of analyze(input).highlights) expect(input.slice(p.start, p.end)).toBe(p.text);
    expect(tokenize('🧡 good')[1]!.start).toBe(3);
    expect(analyze('I don’t love this.').highlights[0]!.sentiment).toBe('negative');
  });
  it('separates importance, heuristic confidence and distribution semantics', () => {
    const result = analyze('I love this but it is awful.');
    expect(result.metadata.calibrated).toBe(false);
    expect(result.highlights.every(p => p.confidence === null)).toBe(true);
    expect(Object.values(result.sentiment.distribution).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Object.values(result.sentiment.distribution).every(n => n >= 0 && n <= 1)).toBe(true);
    expect(analyze('unknown neutral facts').sentiment.distribution.neutral).toBe(1);
  });
  it('applies only supplied calibration, without mutating predictions', () => {
    const predictions = analyze('excellent').highlights;
    const calibrated = calibrate(predictions, { method: 'platt', a: 1, b: 0 });
    expect(calibrated[0]!.confidence).toBeCloseTo(predictions[0]!.heuristicConfidence);
    expect(predictions[0]!.confidence).toBeNull();
    expect(calibrate(calibrated)[0]!.confidence).toBeNull();
    expect(analyze('good', { calibration: { method: 'platt', a: 2, b: 1 } }).metadata.calibrated).toBe(true);
    expect(() => calibrate(predictions, { method: 'platt', a: NaN, b: 1 })).toThrow();
    expect(calibrate(predictions, { method: 'platt', a: 1e300, b: 1e300 })[0]!.confidence).toBe(1);
  });
  it('supports abstention, thresholds, filters, and independent defaults', () => {
    expect(analyze('good', { threshold: 0.9 }).highlights).toEqual([]);
    expect(analyze('good', { minConfidence: 0.9 }).highlights).toEqual([]);
    expect(analyze('I love this but it is awful', { emotions: ['joy'] }).highlights.map(p => p.text)).toEqual(['love']);
    const defaults = { threshold: 0.9 };
    const instance = createTextheat(defaults); defaults.threshold = 0;
    expect(instance.analyze('good').highlights).toEqual([]);
    expect(instance.configure({ threshold: 0 }).analyze('good').highlights).toHaveLength(1);
    expect(text.analyze('good').highlights).toHaveLength(1);
    expect(() => analyze('good', { threshold: NaN })).toThrow();
    expect(() => analyze('good', { minConfidence: 2 })).toThrow();
    expect(() => analyze(null as unknown as string)).toThrow();
  });
  it('resolves fresh safe themes and rejects CSS injection', () => {
    const theme = getTheme(); theme.positive.background = '#000000';
    expect(getTheme().positive.background).toBe('#D1FAE5');
    expect(heat('excellent', { theme: { positive: { background: '#ABCDEF', color: '#112233' } } })).toContain('#ABCDEF');
    expect(heat('excellent', { theme: 'dark' })).toContain('#064E3B');
    expect(() => getTheme({ positive: { background: 'red; background:url(javascript:alert(1))', color: '#112233' } })).toThrow();
  });
  it('handles empty text and bounded large-input time and memory', () => {
    expect(heat('')).toBe(''); expect(analyze('').sentiment.label).toBe('neutral');
    const input = 'Excellent work, but awful service. 🧡\n'.repeat(5000);
    const before = process.memoryUsage().heapUsed, start = performance.now();
    const result = analyze(input);
    expect(result.highlights).toHaveLength(10000);
    expect(heat(input).length).toBeGreaterThan(input.length);
    expect(performance.now() - start).toBeLessThan(10000);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(200 * 1024 * 1024);
  });
});

describe('curated emoji evidence', () => {
  it('scores a positive emoji in scoreSentiment and analyze', () => {
    const prediction = scoreSentiment(tokenize('😍'))[0]!;
    expect(prediction.text).toBe('😍');
    expect(prediction.score).toBeGreaterThan(0);
    expect(prediction.sentiment).toBe('positive');
    expect(prediction.emotion).toBe('joy');
    expect(prediction.rules).toContain('emoji-symbol');
    const result = analyze('absolutely love it 😍');
    expect(result.highlights.map(p => p.text)).toEqual(['absolutely love', '😍']);
    expect(result.sentiment.label).toBe('positive');
    expect(result.sentiment.scores.positive).toBeGreaterThan(analyze('absolutely love it').sentiment.scores.positive);
  });
  it('moves negative with a strong negative emoji', () => {
    const result = analyze('The update shipped 😡');
    const emoji = result.highlights.find(p => p.text === '😡')!;
    expect(emoji).toBeDefined();
    expect(emoji.score).toBeLessThan(0);
    expect(emoji.emotion).toBe('anger');
    expect(result.sentiment.label).toBe('negative');
    expect(scoreSentiment(tokenize('😢'))[0]!.emotion).toBe('sadness');
    expect(scoreSentiment(tokenize('😱'))[0]!.emotion).toBe('fear');
  });
  it('leaves neutral and unlisted-emoji text unchanged', () => {
    expect(analyze('The package arrived on Tuesday and contains three books.').highlights).toEqual([]);
    expect(scoreSentiment(tokenize('The package arrived 📦'))).toEqual([]);
    expect(scoreSentiment(tokenize('🧡'))).toEqual([]);
    expect(analyze('absolutely love it').highlights.map(p => p.text)).toEqual(['absolutely love']);
  });
  it('emphasizes an emoji with trailing exclamation marks', () => {
    const plain = scoreSentiment(tokenize('😍'))[0]!;
    const emphatic = scoreSentiment(tokenize('😍!'))[0]!;
    expect(emphatic.score).toBeGreaterThan(plain.score);
    expect(emphatic.rules).toContain('punctuation-emphasis');
  });
});