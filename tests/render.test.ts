// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { analyze, heat, renderHTML } from '../src/api/index';
import { destroy, enhanceTooltips, mount, renderDOM, update } from '../src/browser/index';

describe('safe HTML and accessible DOM rendering', () => {
  it.each(['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'I love this <b>product</b>.', '" onmouseover="alert(1) & awful', '🧡 very\tgood\n& terrible < >'])('escapes %s and preserves original text', input => {
    const node = document.createElement('div'); node.innerHTML = heat(input, { showTooltips: true });
    expect(node.textContent).toBe(input);
    expect(node.querySelectorAll('script,img,b')).toHaveLength(0);
    expect(node.querySelector('[onmouseover],[onerror]')).toBeNull();
  });
  it('escapes adversarial tooltip text and allowlists metadata', () => {
    const result = analyze('good');
    result.highlights[0]!.explanation = '"><img src=x onerror=alert(1)>';
    const node = document.createElement('div'); node.innerHTML = renderHTML('good', result, { showTooltips: true });
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('span')!.getAttribute('data-textheat-tooltip')).toContain('<img');
    result.highlights[0]!.sentiment = 'evil" onerror="x' as never;
    expect(() => renderHTML('good', result)).toThrow();
  });
  it('rejects mismatches, overlaps, invalid offsets and split surrogate pairs', () => {
    const result = analyze('good bad');
    expect(() => renderHTML('changed', result)).toThrow();
    result.highlights.push({ ...result.highlights[0]! });
    expect(() => renderHTML('good bad', result)).toThrow(/overlapping/);
    for (const offset of [-1, 0.5, 500, NaN]) {
      const a = analyze('good'); a.highlights[0]!.start = offset;
      expect(() => renderHTML('good', a)).toThrow();
    }
    const a = analyze('good'); a.text = '🧡'; a.highlights[0] = { ...a.highlights[0]!, start: 0, end: 1, text: '\ud83e' };
    expect(() => renderHTML('🧡', a)).toThrow(/surrogate/);
  });
  it('adds only requested accessible tooltip and importance metadata', () => {
    const node = document.createElement('div');
    node.innerHTML = heat('terrible', { showTooltips: true });
    const span = node.querySelector('span')!;
    expect(span.tabIndex).toBe(0); expect(span.getAttribute('aria-label')).toContain('Sentiment: negative');
    expect(span.getAttribute('data-textheat-tooltip')).toContain('uncalibrated heuristic');
    node.innerHTML = heat('terrible', { showImportance: false });
    expect(node.querySelector('[data-importance],[tabindex],[aria-label],[data-textheat-tooltip]')).toBeNull();
    node.innerHTML = heat('terrible', { showImportance: false, showTooltips: true });
    expect(node.querySelector('span')!.getAttribute('aria-label')).not.toContain('Importance:');
  });
  it('constructs DOM safely, manages focus/tap/Escape tooltips and cleans up', () => {
    const node = document.createElement('div'); document.body.append(node);
    const result = mount(node, 'I love <script>bad</script>', { showTooltips: true });
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(node.querySelector('script')).toBeNull();
    const span = node.querySelector('span')!;
    span.focus();
    const popup = document.querySelector<HTMLElement>('[role=tooltip]')!;
    expect(popup.hidden).toBe(false); expect(span.getAttribute('aria-describedby')).toBe(popup.id);
    document.dispatchEvent(new Event('scroll'));
    expect(popup.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popup.hidden).toBe(true); expect(span.hasAttribute('aria-describedby')).toBe(false);
    span.click(); expect(popup.hidden).toBe(false);
    span.click(); expect(popup.hidden).toBe(false);
    document.body.click(); expect(popup.hidden).toBe(true);
    update(node, 'not good', { showTooltips: true });
    expect(document.querySelectorAll('[role=tooltip]')).toHaveLength(1);
    destroy(node); expect(node.childNodes).toHaveLength(0); expect(document.querySelector('[role=tooltip]')).toBeNull();
    node.remove();
  });
  it('restores existing descriptions on standalone enhancement cleanup', () => {
    const node = document.createElement('div'); document.body.append(node);
    renderDOM(node, 'good', analyze('good'), { showTooltips: true });
    const span = node.querySelector('span')!; span.setAttribute('aria-describedby', 'original');
    const cleanup = enhanceTooltips(node); span.focus(); cleanup();
    expect(span.getAttribute('aria-describedby')).toBe('original'); expect(node.classList.contains('textheat-enhanced')).toBe(false);
    node.remove();
  });
  it('round-trips varied punctuation and adjacent sentiment words without overlapping', () => {
    const fragments = ['good', 'not', 'bad', 'very', '<&>', 'love', '🧡', '\n', 'awful', '!', 'crashes constantly'];
    let seed = 42;
    for (let i = 0; i < 200; i++) {
      const input = Array.from({ length: 20 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return fragments[seed % fragments.length]; }).join(' ');
      const node = document.createElement('div'); node.innerHTML = heat(input);
      expect(node.textContent).toBe(input);
    }
  });
});