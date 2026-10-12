import { analyze } from '../core/analyze';
import type { Analysis, Options } from '../core/types';
import { getTheme } from '../render/themes';
import { highlightAttributes, validatedHighlights } from '../render/render-html';
import { enhanceTooltips } from './tooltips';
import { getPageTheme } from './page-theme';
const mounted = new WeakMap<Element, () => void>();

/** Safe DOM renderer: no innerHTML, even for tooltip or metadata content. */
export function renderDOM(element: Element, text: string, analysis: Analysis, options: Options = {}): void {
  const highlights = validatedHighlights(text, analysis, options);
  const theme = options.theme === undefined ? getPageTheme(element) : getTheme(options.theme);
  const doc = element.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let offset = 0;
  for (const p of highlights) {
    fragment.append(doc.createTextNode(text.slice(offset, p.start)));
    const span = doc.createElement('span');
    for (const [key, value] of Object.entries(highlightAttributes(p, options, theme))) span.setAttribute(key, value);
    span.textContent = text.slice(p.start, p.end);
    fragment.append(span);
    offset = p.end;
  }
  fragment.append(doc.createTextNode(text.slice(offset)));
  element.replaceChildren(fragment);
}
export function mount(element: Element, input: string, options: Options = {}): Analysis {
  const result = analyze(input, options);
  // Build successfully before removing previous interactive state.
  renderDOM(element, input, result, options);
  mounted.get(element)?.();
  mounted.set(element, options.showTooltips ? enhanceTooltips(element) : () => {});
  return result;
}
export const update = mount;
export function destroy(element: Element): void {
  mounted.get(element)?.(); mounted.delete(element); element.replaceChildren();
}