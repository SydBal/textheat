import { analyze } from '../core/analyze';
import { renderHTML } from '../render/render-html';
import type { Options } from '../core/types';
export { analyze } from '../core/analyze';
export { tokenize } from '../core/tokenize';
export { scoreSentiment } from '../core/sentiment';
export { scoreImportance } from '../core/importance';
export { calibrate } from '../core/calibration';
export { renderHTML } from '../render/render-html';
export { escapeHTML } from '../render/escape-html';
export { getTheme } from '../render/themes';
export { lexiconStats } from '../core/lexicon';
export { tagTokens, segmentClauses } from '../core/context';
export type * from '../core/types';

export function heat(text: string, options: Options = {}): string { return renderHTML(text, analyze(text, options), options); }
/** Independent defaults; configure returns a new instance and never mutates global state. */
export function createTextheat(defaults: Options = {}) {
  const snapshot = structuredClone(defaults);
  return Object.freeze({
    heat: (text: string, options: Options = {}) => heat(text, { ...snapshot, ...options }),
    analyze: (text: string, options: Options = {}) => analyze(text, { ...snapshot, ...options }),
    configure: (options: Options) => createTextheat({ ...snapshot, ...options })
  });
}
const text = createTextheat();
export default text;