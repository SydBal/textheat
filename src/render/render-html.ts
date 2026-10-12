import type { Analysis, Category, Options, Prediction, Theme } from '../core/types';
import { shouldHighlight, validateOptions } from '../core/options';
import { escapeHTML } from './escape-html';
import { getTheme } from './themes';
const polarities = new Set(['positive', 'negative', 'neutral']);
const emotions = new Set(['joy', 'anger', 'sadness', 'fear', 'surprise']);

/** Invalid or overlapping spans are rejected rather than repaired silently. */
export function validatedHighlights(text: string, analysis: Analysis, options: Options = {}): Prediction[] {
  if (analysis.text !== text) throw new TypeError('Analysis text does not match render input');
  validateOptions(options);
  const sorted = [...analysis.highlights].sort((a, b) => a.start - b.start || b.end - a.end);
  let previousEnd = 0;
  for (const p of sorted) {
    if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < previousEnd || p.end <= p.start || p.end > text.length
      || text.slice(p.start, p.end) !== p.text || !polarities.has(p.sentiment) || (p.emotion !== undefined && !emotions.has(p.emotion))
      || !Number.isFinite(p.score) || !Number.isFinite(p.importance) || p.importance < 0 || p.importance > 1
      || !Number.isFinite(p.heuristicConfidence) || p.heuristicConfidence < 0 || p.heuristicConfidence > 1
      || (p.confidence !== null && (!Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1)) || typeof p.explanation !== 'string') throw new TypeError('Invalid or overlapping highlight');
    for (const offset of [p.start, p.end]) {
      if (offset > 0 && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset] ?? '')) throw new TypeError('Highlight splits a Unicode surrogate pair');
    }
    previousEnd = p.end;
  }
  return sorted.filter(p => shouldHighlight(p, options));
}
export function tooltipText(p: Prediction, options: Options): string {
  return `Sentiment: ${p.sentiment}.${p.emotion ? ` Emotion: ${p.emotion}.` : ''}${options.showImportance === false ? '' : ` Importance: ${p.importance.toFixed(2)}.`} ${p.confidence === null ? `Confidence: uncalibrated heuristic ${p.heuristicConfidence.toFixed(2)}.` : `Externally calibrated confidence: ${p.confidence.toFixed(2)}.`} ${p.explanation}`;
}
export function highlightAttributes(p: Prediction, options: Options, theme: Theme): Record<string, string> {
  const category: Category = p.emotion ?? p.sentiment;
  const color = theme[category];
  const attributes: Record<string, string> = {
    class: `textheat-highlight textheat-${p.sentiment}${p.emotion ? ` textheat-${p.emotion}` : ''}`,
    'data-sentiment': p.sentiment, style: `background-color:${color.background};color:${color.color};border-radius:3px;box-decoration-break:clone`
  };
  if (p.emotion) attributes['data-emotion'] = p.emotion;
  if (options.showImportance !== false) attributes['data-importance'] = p.importance.toFixed(2);
  if (options.showTooltips) {
    attributes.tabindex = '0';
    attributes['data-textheat-tooltip'] = tooltipText(p, options);
    attributes['aria-label'] = `${p.text}. ${tooltipText(p, options)}`;
  }
  return attributes;
}
export function renderHTML(text: string, analysis: Analysis, options: Options = {}): string {
  const highlights = validatedHighlights(text, analysis, options);
  const theme = getTheme(options.theme);
  const chunks: string[] = [];
  let offset = 0;
  for (const p of highlights) {
    chunks.push(escapeHTML(text.slice(offset, p.start)));
    const attrs = Object.entries(highlightAttributes(p, options, theme)).map(([key, value]) => `${key}="${escapeHTML(value)}"`).join(' ');
    chunks.push(`<span ${attrs}>${escapeHTML(text.slice(p.start, p.end))}</span>`);
    offset = p.end;
  }
  chunks.push(escapeHTML(text.slice(offset)));
  return chunks.join('');
}