import { analyze, getTheme } from 'textheat';
import { getPageTheme } from 'textheat/browser';
import type { Category, Prediction, Theme, ThemeInput } from 'textheat';
import type { ExtensionSettings } from '../../extension/shared/settings';
import { editingRoot } from './exclusions';

/** Preserve direction and collapsed carets without rewriting the editor's markup. */
function preserveSelection(element: Element): (() => void) | undefined {
  const root = editingRoot(element);
  const selection = element.ownerDocument.getSelection();
  if (!root || !selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
  const offset = (node: Node, position: number) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(root); range.setEnd(node, position);
    return range.toString().length;
  };
  const anchor = offset(selection.anchorNode, selection.anchorOffset);
  const focus = offset(selection.focusNode, selection.focusOffset);
  return () => {
    if (!root.isConnected) return;
    const endpoint = (position: number): [Node, number] => {
      const walker = element.ownerDocument.createTreeWalker(root, 4);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const length = (node as Text).length;
        if (position <= length) return [node, position];
        position -= length;
      }
      return [root, root.childNodes.length];
    };
    const [anchorNode, anchorOffset] = endpoint(anchor), [focusNode, focusOffset] = endpoint(focus);
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  };
}

export const marker = '[data-textheat-extension="wrapper"]';
export function extensionTheme(settings: ExtensionSettings, element?: Element): ThemeInput {
  if (settings.theme === 'adaptive') return element ? getPageTheme(element) : 'default';
  if (settings.theme === 'custom') return settings.customTheme as ThemeInput;
  if (settings.theme === 'high-contrast') return Object.fromEntries(['positive', 'negative', 'joy', 'anger', 'sadness', 'fear', 'surprise'].map(category => [category, { background: category === 'negative' || category === 'anger' ? '#000000' : '#FFFFFF', color: category === 'negative' || category === 'anger' ? '#FFFFFF' : '#000000' }])) as ThemeInput;
  return settings.theme;
}
export interface Replacement { original: Text; value: string }
// Keep explanation text even when tooltips are disabled; never parse page markup.
const explanations = new WeakMap<Element, string>();
export function updateTooltips(wrapper: Element, enabled: boolean): void {
  for (const span of wrapper.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]')) {
    const explanation = explanations.get(span);
    if (enabled && explanation) span.title = explanation;
    else span.removeAttribute('title');
  }
}
export function recolorHighlights(wrapper: Element, theme: Theme, roundedCorners = false): void {
  for (const span of wrapper.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]')) {
    const category = (span.dataset.emotion ?? span.dataset.sentiment) as Category;
    const color = theme[category];
    if (!color) continue;
    // Avoid observer feedback when colors did not change.
    if (span.style.getPropertyValue('--textheat-bg') !== color.background) span.style.setProperty('--textheat-bg', color.background);
    if (span.style.getPropertyValue('--textheat-fg') !== color.color) span.style.setProperty('--textheat-fg', color.color);
    span.style.setProperty('--textheat-radius', roundedCorners ? '3px' : '0px');
  }
}
export function replaceText(node: Text, settings: ExtensionSettings, palette?: Theme): { wrapper?: HTMLSpanElement; highlights: HTMLSpanElement[] } {
  const analysis = analyze(node.data, { threshold: settings.threshold });
  if (!analysis.highlights.length) return { highlights: [] };
  return applyHighlights(node, analysis.highlights, settings, palette);
}
/** Wrap precomputed highlight spans (node-local offsets) inside one text node.
 * The controller's merged cross-node analysis renders through here too, so the
 * DOM only ever gains the same wrapper and highlight spans replaceText makes.
 */
export function applyHighlights(node: Text, predictions: Prediction[], settings: ExtensionSettings, palette?: Theme): { wrapper?: HTMLSpanElement; highlights: HTMLSpanElement[] } {
  const input = node.data;
  const doc = node.ownerDocument;
  const wrapper = doc.createElement('span');
  wrapper.dataset.textheatExtension = 'wrapper';
  const theme = palette ?? getTheme(extensionTheme(settings, node.parentElement ?? undefined));
  const highlights: HTMLSpanElement[] = [];
  let offset = 0;
  for (const p of predictions) {
    wrapper.append(doc.createTextNode(input.slice(offset, p.start)));
    const span = doc.createElement('span');
    span.className = `textheat-highlight textheat-${p.sentiment}${p.emotion ? ` textheat-${p.emotion}` : ''} textheat-extension-highlight`;
    span.dataset.textheatExtension = 'highlight';
    span.dataset.sentiment = p.sentiment;
    if (p.emotion) span.dataset.emotion = p.emotion;
    span.dataset.importance = p.importance.toFixed(2);
    span.dataset.textheatAnimationState = 'waiting';
    if (p.confidence !== null) span.dataset.confidence = String(p.confidence);
    const color = theme[p.emotion ?? p.sentiment];
    span.style.setProperty('--textheat-bg', color.background);
    span.style.setProperty('--textheat-fg', color.color);
    span.style.setProperty('--textheat-radius', settings.roundedCorners ? '3px' : '0px');
    const explanation = `${p.sentiment}${p.emotion ? ` / ${p.emotion}` : ''}; importance ${p.importance.toFixed(2)}; uncalibrated heuristic ${p.heuristicConfidence.toFixed(2)}. ${p.explanation}`;
    explanations.set(span, explanation);
    if (settings.showTooltips) span.title = explanation;
    span.textContent = input.slice(p.start, p.end);
    wrapper.append(span); highlights.push(span); offset = p.end;
  }
  wrapper.append(doc.createTextNode(input.slice(offset)));
  const restoreSelection = node.parentElement && preserveSelection(node.parentElement);
  node.replaceWith(wrapper); restoreSelection?.();
  return { wrapper, highlights };
}
/** Restore the exact original node unless the page edited the generated subtree. */
export function restoreWrapper(wrapper: Element, replacement?: Replacement): void {
  const restoreSelection = preserveSelection(wrapper);
  if (replacement && wrapper.textContent === replacement.value && [...wrapper.children].every(child => child.getAttribute('data-textheat-extension') === 'highlight')) {
    wrapper.replaceWith(replacement.original); restoreSelection?.(); return;
  }
  for (const span of wrapper.querySelectorAll('[data-textheat-extension="highlight"]')) span.replaceWith(...span.childNodes);
  wrapper.replaceWith(...wrapper.childNodes); restoreSelection?.();
}