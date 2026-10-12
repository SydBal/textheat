// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEditor } from '../demo/editor';

let editor: ReturnType<typeof connectEditor>;
const shadow = () => document.querySelector('.textheat-extension-reactions')?.shadowRoot;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 120, top: 80, bottom: 100, width: 100, height: 20 } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn(() => ({ cancel: vi.fn() })) });
  document.body.innerHTML = '<input id="hero-emoji" type="checkbox"><textarea id="input"></textarea><div id="output" aria-hidden="true"></div>';
  editor = connectEditor(document.querySelector('textarea')!, document.querySelector('#output')!);
});
afterEach(() => { editor.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; document.body.replaceChildren(); });
function render(words: [string, string][]) {
  const output = document.querySelector('#output')!;
  output.replaceChildren(...words.map(([text, category]) => {
    const span = document.createElement('span'); span.className = 'textheat-highlight'; span.textContent = text; span.dataset.sentiment = category;
    return span;
  }));
  document.querySelector<HTMLTextAreaElement>('textarea')!.value = output.textContent!;
  editor.sync();
}
function enable() { const toggle = document.querySelector<HTMLInputElement>('#hero-emoji')!; toggle.checked = true; toggle.dispatchEvent(new Event('change')); }
describe('live editor reaction preview', () => {
  it('bursts for added and changed evidence without replaying unchanged rerendered words', () => {
    render([['good', 'positive']]); enable();
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(0);
    render([['good', 'positive'], ['terrible', 'negative']]);
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(4);
    expect(document.querySelector('textarea')!.value).toBe('goodterrible');
    vi.advanceTimersByTime(1600);
    render([['good', 'positive'], ['terrible', 'negative']]);
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(0);
    render([['good', 'positive'], ['excellent', 'positive']]);
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(4);
  });
  it('drains added mirror evidence in two bounded waves without changing native text or selection', () => {
    enable();
    const words = Array.from({ length: 16 }, (_, index): [string, string] => [`good${index}`, 'positive']);
    render(words);
    const input = document.querySelector('textarea')!; input.setSelectionRange(1, 3);
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(32);
    vi.advanceTimersByTime(1600);
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(32);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(80);
    vi.advanceTimersByTime(1600);
    expect(shadow()?.querySelectorAll('.particle')).toHaveLength(0);
    expect(input.value).toBe(words.map(([text]) => text).join(''));
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    render(words); expect(shadow()?.querySelectorAll('.particle')).toHaveLength(0);
    editor.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels removed queued mirror spans and registers unchanged rerendered evidence as static', () => {
    enable();
    const words = Array.from({ length: 16 }, (_, index): [string, string] => [`good${index}`, 'positive']);
    render(words); expect(shadow()?.querySelectorAll('.particle')).toHaveLength(32);
    render(words); expect(shadow()?.querySelectorAll('.particle')).toHaveLength(0);
    vi.advanceTimersByTime(3200);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(40);
    expect(shadow()?.querySelectorAll('.badge')).toHaveLength(16);
    editor.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up when unchecked and leaves source text and native selection unchanged', () => {
    enable(); render([['good', 'positive']]);
    const input = document.querySelector('textarea')!; input.setSelectionRange(1, 3);
    const toggle = document.querySelector<HTMLInputElement>('#hero-emoji')!; toggle.checked = false; toggle.dispatchEvent(new Event('change'));
    expect(shadow()).toBeUndefined(); expect(input.value).toBe('good');
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
  });
});