// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyze, getPageTheme } from '../src/browser/index';
import { heroWords, startHeroRotation } from '../demo/hero';

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
function setup(reduced = false) {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  document.body.innerHTML = '<h1 id="hero-title" aria-label="Give emotional words a little color."><span id="hero-emotion"><span class="hero-emotion-text"></span></span></h1>';
  const rotation = startHeroRotation(); cleanup = rotation.destroy;
  return { rotation, word: document.querySelector<HTMLElement>('#hero-emotion')!, heading: document.querySelector<HTMLElement>('h1')! };
}
describe('hero emotion demonstration', () => {
  it('cycles real dictionary words with the correct emotion or polarity colors and loops', () => {
    expect(heroWords.length).toBeGreaterThan(150);
    expect(new Set(heroWords).size).toBe(heroWords.length);
    const { word, heading } = setup(); const colors = new Set<string>();
    for (const value of heroWords) {
      expect(word.textContent).toBe(value);
      const p = analyze(value, { threshold: 0 }).highlights[0]!;
      const category = p.emotion ?? p.sentiment;
      expect(word.dataset.category).toBe(category);
      const reference = document.createElement('span'); reference.style.backgroundColor = getPageTheme(heading)[category].background;
      expect(word.style.backgroundColor).toBe(reference.style.backgroundColor);
      colors.add(word.style.backgroundColor);
      vi.advanceTimersByTime(value === heroWords[0] ? 2780 : 2600);
    }
    expect(colors.size).toBe(7); expect(word.textContent).toBe('happy');
    expect(heading.getAttribute('aria-label')).toBe('Give emotional words a little color.');
  });
  it('suspends while hidden, resumes while visible, and cleans up timers without a button', () => {
    const { word, rotation } = setup();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10000); expect(word.textContent).toBe('happy');
    expect(document.querySelector('#hero-rotation-toggle')).toBeNull();
    hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2780); expect(word.textContent).toBe('angry');
    rotation.destroy(); expect(vi.getTimerCount()).toBe(0);
    hidden.mockRestore();
  });
  it('stays static for reduced motion', () => {
    const { word } = setup(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10000); expect(word.textContent).toBe('happy');
  });
  it('refreshes the current color when the surrounding theme changes', () => {
    const { heading, word, rotation } = setup(); const light = word.style.backgroundColor;
    heading.style.backgroundColor = '#191c19'; rotation.refresh();
    expect(word.textContent).toBe('happy'); expect(word.style.backgroundColor).not.toBe(light);
  });
  it('fades out before swapping, measures the new width, and then fades back in', () => {
    const { word } = setup(); const label = word.querySelector<HTMLElement>('.hero-emotion-text')!;
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue({ width: 140 } as DOMRect);
    vi.advanceTimersByTime(2600);
    expect(word.classList.contains('is-changing')).toBe(true);
    expect(word.textContent).toBe('happy');
    vi.advanceTimersByTime(180);
    expect(word.textContent).toBe('angry'); expect(word.style.width).toBe('140px');
    expect(word.classList.contains('is-changing')).toBe(true);
    vi.advanceTimersByTime(80);
    expect(word.classList.contains('is-changing')).toBe(false);
  });
});