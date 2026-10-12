import { analyze, getTheme } from 'textheat';
import { getPageTheme } from 'textheat/browser';
import type { Category, Theme, ThemeInput } from 'textheat';
import type { ExtensionSettings } from '../../extension/shared/settings';

export const marker = '[data-textheat-extension="wrapper"]';
export function extensionTheme(settings: ExtensionSettings, element?: Element): ThemeInput {
  if (settings.theme === 'adaptive') return element ? getPageTheme(element) : 'default';
  if (settings.theme === 'custom') return settings.customTheme as ThemeInput;
  if (settings.theme === 'high-contrast') return Object.fromEntries(['positive', 'negative', 'joy', 'anger', 'sadness', 'fear', 'surprise'].map(category => [category, { background: category === 'negative' || category === 'anger' ? '#000000' : '#FFFFFF', color: category === 'negative' || category === 'anger' ? '#FFFFFF' : '#000000' }])) as ThemeInput;
  return settings.theme;
}
export interface Replacement { original: Text; value: string }
export function recolorHighlights(wrapper: Element, theme: Theme): void {
  for (const span of wrapper.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]')) {
    const category = (span.dataset.emotion ?? span.dataset.sentiment) as Category;
    const color = theme[category];
    if (!color) continue;
    // Avoid observer feedback when colors did not change.
    if (span.style.getPropertyValue('--textheat-bg') !== color.background) span.style.setProperty('--textheat-bg', color.background);
    if (span.style.getPropertyValue('--textheat-fg') !== color.color) span.style.setProperty('--textheat-fg', color.color);
  }
}
export function replaceText(node: Text, settings: ExtensionSettings, palette?: Theme): { wrapper?: HTMLSpanElement; highlights: HTMLSpanElement[] } {
  const input = node.data;
  const analysis = analyze(input, { threshold: settings.threshold });
  if (!analysis.highlights.length) return { highlights: [] };
  const doc = node.ownerDocument;
  const wrapper = doc.createElement('span');
  wrapper.dataset.textheatExtension = 'wrapper';
  const theme = palette ?? getTheme(extensionTheme(settings, node.parentElement ?? undefined));
  const highlights: HTMLSpanElement[] = [];
  let offset = 0;
  for (const p of analysis.highlights) {
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
    if (settings.showTooltips) span.title = `${p.sentiment}${p.emotion ? ` / ${p.emotion}` : ''}; importance ${p.importance.toFixed(2)}; uncalibrated heuristic ${p.heuristicConfidence.toFixed(2)}. ${p.explanation}`;
    span.textContent = input.slice(p.start, p.end);
    wrapper.append(span); highlights.push(span); offset = p.end;
  }
  wrapper.append(doc.createTextNode(input.slice(offset)));
  node.replaceWith(wrapper);
  return { wrapper, highlights };
}
/** Restore the exact original node unless the page edited the generated subtree. */
export function restoreWrapper(wrapper: Element, replacement?: Replacement): void {
  if (replacement && wrapper.textContent === replacement.value && [...wrapper.children].every(child => child.getAttribute('data-textheat-extension') === 'highlight')) {
    wrapper.replaceWith(replacement.original); return;
  }
  for (const span of wrapper.querySelectorAll('[data-textheat-extension="highlight"]')) span.replaceWith(...span.childNodes);
  wrapper.replaceWith(...wrapper.childNodes);
}