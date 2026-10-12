// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageTheme, mount } from '../src/browser/index';
import { getTheme } from '../src/api/index';

afterEach(() => { document.body.replaceChildren(); document.body.removeAttribute('style'); document.documentElement.removeAttribute('style'); vi.unstubAllGlobals(); });
function contrast(a: string, b: string): number {
  const lum = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(s => s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe('page-aware palettes', () => {
  it.each(['#ffffff', '#191c19', '#faf9f6', '#7d328b', '#426cbe', '#00ff00', '#777777', '#fff000'])('fits %s and keeps every foreground/background pair readable', surface => {
    const element = document.createElement('p'); element.style.backgroundColor = surface; document.body.append(element);
    const theme = getPageTheme(element);
    for (const color of Object.values(theme)) {
      expect(color.background).toMatch(/^#[\da-f]{6}$/i);
      expect(contrast(color.background, color.color)).toBeGreaterThanOrEqual(4.5);
    }
    expect(theme.positive.background).not.toBe(theme.negative.background);
  });
  it('composites translucent nested backgrounds and uses the local surface rather than the body', () => {
    document.body.style.backgroundColor = '#000000';
    const parent = document.createElement('div'); parent.style.backgroundColor = 'rgba(255,255,255,0.5019607843137255)';
    const child = document.createElement('p'); parent.append(child); document.body.append(parent);
    const middle = getPageTheme(child);
    parent.style.backgroundColor = '#808080';
    expect(getPageTheme(child)).toEqual(middle);
    child.style.backgroundColor = '#ffffff';
    expect(getPageTheme(child)).not.toEqual(middle);
  });
  it('uses a dark canvas fallback for transparent color-scheme pages', () => {
    document.documentElement.style.colorScheme = 'dark';
    const p = document.createElement('p'); document.body.append(p);
    expect(getPageTheme(p).positive.color).toBe(getTheme('dark').positive.color);
  });
  it('DOM rendering adapts on update while explicit themes remain exact', () => {
    const p = document.createElement('p'); document.body.append(p);
    mount(p, 'good'); const light = p.firstElementChild!.getAttribute('style');
    p.style.backgroundColor = '#111111'; mount(p, 'good');
    expect(p.firstElementChild!.getAttribute('style')).not.toBe(light);
    mount(p, 'good', { theme: 'default' });
    expect(p.firstElementChild!.getAttribute('style')).toContain(getTheme().positive.background);
    mount(p, 'good', { theme: { positive: { background: '#123456', color: '#ffffff' } } });
    expect(p.firstElementChild!.getAttribute('style')).toContain('#123456');
  });
});