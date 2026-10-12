// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const markup = readFileSync(resolve(process.cwd(), 'demo/index.html'), 'utf8');
const element = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
function type(input: string) {
  element<HTMLTextAreaElement>('#input').value = input;
  element('#input').dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(async () => {
  vi.resetModules();
  document.documentElement.innerHTML = markup.replace(/<!doctype html>/i, '');
  vi.stubGlobal('LanguageModel', undefined);
  await import('../demo/main');
});
afterEach(async () => {
  window.dispatchEvent(new Event('pagehide'));
  const { destroy } = await import('../src/browser/mount');
  destroy(element('#output'));
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('live browser demo attribution', () => {
  it('demonstrates all seven palette categories in the initial editable example', () => {
    const categories = new Set([...document.querySelectorAll<HTMLElement>('#output .textheat-highlight')].map(span => span.dataset.emotion ?? span.dataset.sentiment));
    expect([...categories].sort()).toEqual(['positive', 'negative', 'joy', 'anger', 'sadness', 'fear', 'surprise'].sort());
    expect(element('#output').textContent).toBe(element<HTMLTextAreaElement>('#input').value);
  });
  it('loads every example and updates the playground without stale attribution', () => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-example]'));
    expect(buttons).toHaveLength(26);
    const sentences = new Set<string>();
    for (const button of buttons) {
      button.click();
      const input = element<HTMLTextAreaElement>('#input').value;
      expect(input.length).toBeGreaterThan(0);
      expect(element('#output').textContent).toBe(input);
      expect(element('#char-count').textContent).toBe(`${input.length} characters`);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelectorAll('[data-example][aria-pressed="true"]')).toHaveLength(1);
      expect(element('#attribution-status').textContent!.length).toBeGreaterThan(0);
      expect(document.querySelector('#output img, #output b')).toBeNull();
      sentences.add(input);
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