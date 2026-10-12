import type { Options } from './types';
const emotions = new Set(['joy', 'anger', 'sadness', 'fear', 'surprise']);
export function validateOptions(options: Options): void {
  for (const key of ['threshold', 'minConfidence'] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError(`${key} must be between 0 and 1`);
  }
  if (options.emotions && (!Array.isArray(options.emotions) || options.emotions.some(e => !emotions.has(e)))) throw new TypeError('Unknown emotion filter');
}
export function shouldHighlight(p: import('./types').Prediction, options: Options): boolean {
  return p.sentiment !== 'neutral' && p.importance >= (options.threshold ?? 0.3)
    && (p.confidence ?? p.heuristicConfidence) >= (options.minConfidence ?? 0.5)
    && (!options.emotions || (!!p.emotion && options.emotions.includes(p.emotion)));
}