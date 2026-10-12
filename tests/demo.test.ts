// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const markup = readFileSync(resolve(process.cwd(), 'demo/index.html'), 'utf8');
const element = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
let systemDark = false;
let reducedMotion = false;
let onSystemThemeChange: (() => void) | undefined;
const oldScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
function type(input: string) {
  element<HTMLTextAreaElement>('#input').value = input;
  element('#input').dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(async () => {
  vi.resetModules();
  systemDark = false; reducedMotion = false; onSystemThemeChange = undefined;
  try { window.localStorage.removeItem('textheat-color-theme'); } catch { /* Opaque origin. */ }
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  document.documentElement.innerHTML = markup.replace(/<!doctype html>/i, '');
  vi.stubGlobal('LanguageModel', undefined);
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query.includes('reduced-motion') ? reducedMotion : query === '(prefers-color-scheme: dark)' && systemDark; },
    addEventListener: (name: string, listener: () => void) => { if (name === 'change' && query === '(prefers-color-scheme: dark)') onSystemThemeChange = listener; },
    removeEventListener: vi.fn()
  }));
  await import('../demo/main');
});
afterEach(async () => {
  window.dispatchEvent(new Event('pagehide'));
  const { destroy } = await import('../src/browser/mount');
  destroy(element('#output'));
  document.body.replaceChildren();
  if (oldScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', oldScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});

describe('live browser demo attribution', () => {
  it('follows OS light/dark and refreshes the current hero word until the visitor manually selects a theme', async () => {
    const { getPageTheme } = await import('../src/browser/index');
    expect(document.body.classList.contains('dark')).toBe(false);
    const heroWord = element<HTMLElement>('#hero-emotion');
    const category = heroWord.dataset.category as keyof ReturnType<typeof getPageTheme>;
    const expectedLight = document.createElement('span'); expectedLight.style.backgroundColor = getPageTheme(element('#hero-title'))[category].background;
    expect(heroWord.style.backgroundColor).toBe(expectedLight.style.backgroundColor);
    systemDark = true; onSystemThemeChange?.();
    expect(document.body.classList.contains('dark')).toBe(true);
    const expectedDark = document.createElement('span'); expectedDark.style.backgroundColor = getPageTheme(element('#hero-title'))[category].background;
    expect(heroWord.style.backgroundColor).toBe(expectedDark.style.backgroundColor);
    expect(expectedDark.style.backgroundColor).not.toBe(expectedLight.style.backgroundColor);
    element<HTMLButtonElement>('#theme-toggle').click();
    expect(document.body.classList.contains('dark')).toBe(true);
    systemDark = false; onSystemThemeChange?.();
    expect(document.body.classList.contains('dark')).toBe(true);
    element<HTMLButtonElement>('#theme-toggle').click();
    expect(document.body.classList.contains('dark')).toBe(false);
    systemDark = true; onSystemThemeChange?.();
    expect(document.body.classList.contains('dark')).toBe(false);
  });
  it('cycles system → dark → light → system and persists each explicit choice', () => {
    const button = element<HTMLButtonElement>('#theme-toggle');
    expect(button.title).toContain('system preference');
    button.click(); expect(document.body.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('textheat-color-theme')).toBe('dark');
    button.click(); expect(document.body.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('textheat-color-theme')).toBe('light');
    button.click(); expect(window.localStorage.getItem('textheat-color-theme')).toBe('system');
    systemDark = true; onSystemThemeChange?.(); expect(document.body.classList.contains('dark')).toBe(true);
  });
  it('restores a saved explicit scheme and defaults to dark when matchMedia is unavailable', async () => {
    window.dispatchEvent(new Event('pagehide'));
    vi.resetModules(); document.documentElement.innerHTML = markup.replace(/<!doctype html>/i, '');
    window.localStorage.setItem('textheat-color-theme', 'light');
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('color-scheme') && systemDark, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    await import('../demo/main');
    expect(document.body.classList.contains('dark')).toBe(false);
    window.dispatchEvent(new Event('pagehide')); vi.resetModules(); document.documentElement.innerHTML = markup.replace(/<!doctype html>/i, '');
    window.localStorage.removeItem('textheat-color-theme');
    vi.stubGlobal('matchMedia', undefined);
    await import('../demo/main');
    expect(document.body.classList.contains('dark')).toBe(true);
  });
  it('demonstrates all seven palette categories in the initial editable example', () => {
    const categories = new Set([...document.querySelectorAll<HTMLElement>('#output .textheat-highlight')].map(span => span.dataset.emotion ?? span.dataset.sentiment));
    expect([...categories].sort()).toEqual(['positive', 'negative', 'joy', 'anger', 'sadness', 'fear', 'surprise'].sort());
    expect(element('#output').textContent).toBe(element<HTMLTextAreaElement>('#input').value);
  });
  it('loads every example without stale attribution', () => {
    reducedMotion = true;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-example]'));
    expect(buttons).toHaveLength(26);
    const sentences = new Set<string>();
    for (const button of buttons) {
      button.click();
      const completeInput = element<HTMLTextAreaElement>('#input').value;
      expect(completeInput.length).toBeGreaterThan(0);
      expect(element('.live-editor').getAttribute('aria-busy')).toBe('false');
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      expect(element('#output').textContent).toBe(completeInput);
      expect(element('#char-count').textContent).toBe(`${completeInput.length} characters`);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelectorAll('[data-example][aria-pressed="true"]')).toHaveLength(1);
      expect(element('#attribution-status').textContent!.length).toBeGreaterThan(0);
      expect(document.querySelector('#output img, #output b')).toBeNull();
      sentences.add(completeInput);
    }
    expect(sentences.size).toBe(buttons.length);
  });
  it('updates fresh typed text, highlights, compound targets and explanations without a preset click', () => {
    type('Excellent customer service.');
    expect(element('#aspects').textContent).toContain('customer service');
    expect(element('#aspects').textContent).not.toContain('interface');
    expect(element('#output .textheat-highlight').textContent).toBe('Excellent');
    expect(element('#output .textheat-highlight').getAttribute('data-textheat-tooltip')).toContain('lexical');
    expect(element('#evidence').textContent).toContain('Excellent — Highlighted');
    type('The dashboard is clunky and confusing.');
    expect(element('#aspects').textContent).toContain('dashboard');
    expect(element('#aspects').textContent).not.toContain('customer service');
    expect(document.querySelectorAll('#output .textheat-highlight')).toHaveLength(2);
    expect(element('#evidence').textContent).toContain('confusing — Highlighted');
  });
  it('retains complete coordinated evidence and exposes threshold omissions', () => {
    type('The app is fast and intuitive.');
    expect(document.querySelectorAll('#aspects li')).toHaveLength(1);
    expect(element('#aspects').textContent).toContain('apppositive');
    expect(document.querySelectorAll('#evidence li')).toHaveLength(2);
    const slider = element<HTMLInputElement>('#threshold'); slider.value = '1'; slider.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#output .textheat-highlight')).toHaveLength(0);
    expect(element('#aspects').textContent).toContain('app');
    expect(element('#evidence').textContent).toContain('Hidden: below highlight threshold');
    expect(element('#attribution-status').textContent).toContain('2 recognized emotional spans; 0 highlighted; 0 without');
  });
  it('explains coverage gaps, targetless sentiment and uncertainty rather than silently going blank', () => {
    type('The app is zorbastic.');
    expect(element('#attribution-status').textContent).toContain('not proof that the text is neutral');
    expect(element('#evidence').textContent).toContain('absent from the vocabulary');
    type('I love it.');
    expect(element('#attribution-status').textContent).toContain('1 without an identifiable opinion target');
    type('The interface might be good.');
    expect(element('#evidence').textContent).toContain('Hidden: uncertainty / abstention');
    expect(element('#ambiguity').hasAttribute('hidden')).toBe(false);
  });
  it('clears old attribution and renders new evidence safely as text', () => {
    type('The <img src=x onerror=alert(1)> dashboard is excellent.');
    expect(element('#output').textContent).toBe('The <img src=x onerror=alert(1)> dashboard is excellent.');
    expect(document.querySelector('#output img, #evidence img, #clauses img, #aspects img')).toBeNull();
    element<HTMLButtonElement>('#clear').click();
    expect(element('#output').textContent).toBe('');
    expect(element('#aspects').textContent).not.toContain('dashboard');
    expect(element('#evidence').textContent).not.toContain('excellent');
  });
  it('types preset words incrementally, scrolls to the demo, and cancels when the user edits', async () => {
    const button = element<HTMLButtonElement>('[data-example="positive"]');
    button.click();
    expect(element<HTMLTextAreaElement>('#input').value.length).toBe(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(36);
    expect(element<HTMLTextAreaElement>('#input').value.length).toBeGreaterThan(1);
    expect(element('.live-editor').getAttribute('aria-busy')).toBe('true');
    type('Own text');
    expect(element('.live-editor').getAttribute('aria-busy')).toBe('false');
    const entered = element<HTMLTextAreaElement>('#input').value;
    await vi.advanceTimersByTimeAsync(500);
    expect(element<HTMLTextAreaElement>('#input').value).toBe(entered);
  });
  it('types immediately when reduced-motion is requested', () => {
    reducedMotion = true;
    element<HTMLButtonElement>('[data-example="positive"]').click();
    expect(element<HTMLTextAreaElement>('#input').value).toContain('beautiful');
    expect(element('.live-editor').getAttribute('aria-busy')).toBe('false');
  });
  it('uses cohesive adaptive colors for positive/negative badges and updates them in dark mode', async () => {
    const { getPageTheme } = await import('../src/browser/index');
    type('The interface is good, but the service is terrible.');
    const positive = element<HTMLElement>('.insight-label.positive');
    const negative = element<HTMLElement>('.insight-label.negative');
    expect(positive.classList.contains('sentiment-badge')).toBe(true);
    const reference = document.createElement('span');
    reference.style.background = getPageTheme(positive.parentElement!).positive.background;
    expect(positive.style.background).toBe(reference.style.background);
    reference.style.background = getPageTheme(negative.parentElement!).negative.background;
    expect(negative.style.background).toBe(reference.style.background);
    const light = positive.style.background;
    document.body.style.backgroundColor = '#191c19';
    element<HTMLButtonElement>('#theme-toggle').click();
    expect(element<HTMLElement>('.insight-label.positive').style.background).not.toBe(light);
    expect(element<HTMLElement>('#sentiment-label').dataset.sentiment).toBe('mixed');
    expect(element<HTMLElement>('#sentiment-label').style.background).toContain('gradient');
    type('The interface is good.');
    expect(element<HTMLElement>('#sentiment-label').dataset.sentiment).toBe('positive');
    expect(element<HTMLElement>('#sentiment-label').style.background).not.toContain('gradient');
  });
  it('shows new rules and shared explicit targets in typed-text evidence', () => {
    type('The interface and navigation are intuitive. The release is free of bugs.');
    expect(element('#aspects').textContent).toContain('interface');
    expect(element('#aspects').textContent).toContain('navigation');
    expect(element('#evidence').textContent).toContain('absence-of-negative');
    type('If the update is reliable, we will install it.');
    expect(element('#evidence').textContent).toContain('hypothetical-scope');
    expect(element('#evidence').textContent).toContain('Hidden: uncertainty / abstention');
  });
  it('highlights the complete negated problem observation green rather than a red adjective', () => {
    for (const input of ['dont see any functional problems', "don't see any functional problems", 'dont see any funcitonal problems']) {
      type(input);
      const spans = document.querySelectorAll<HTMLElement>('#output .textheat-highlight');
      expect(spans).toHaveLength(1);
      expect(spans[0]!.textContent).toBe(input);
      expect(spans[0]!.dataset.sentiment).toBe('positive');
      expect(spans[0]!.dataset.emotion).toBeUndefined();
      expect(element('#evidence').textContent).toContain('negative-noun-observation');
    }
    type('The app has functional problems.');
    expect(element<HTMLElement>('#output .textheat-highlight').dataset.sentiment).toBe('negative');
  });
  it('keeps native editing selection while updating an inaccessible highlight mirror', () => {
    const input = element<HTMLTextAreaElement>('#input');
    input.value = 'I love this good interface. 🧡'; input.focus(); input.setSelectionRange(7, 11, 'backward');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.selectionStart).toBe(7); expect(input.selectionEnd).toBe(11);
    expect(input.selectionDirection).toBe('backward'); expect(document.activeElement).toBe(input);
    expect(element('#output').textContent).toBe(input.value);
    expect(element('#output').getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('#output [tabindex]')).toHaveLength(0);
    input.scrollTop = 40; input.dispatchEvent(new Event('scroll'));
    expect(element<HTMLElement>('#output').scrollTop).toBe(40);
    type('good\n'); expect(element('#output').classList.contains('ends-with-newline')).toBe(true);
    type('good'); expect(element('#output').classList.contains('ends-with-newline')).toBe(false);
  });
});