import type { Category, Theme } from '../core/types';
import { getTheme } from '../render/themes';

type RGB = [number, number, number];
type RGBA = [number, number, number, number];
function parseColor(value: string): RGBA | undefined {
  if (value === 'transparent') return [0, 0, 0, 0];
  if (/^#[\da-f]{6}$/i.test(value)) return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), 1];
  const match = value.match(/^rgba?\((.*)\)$/i);
  if (match) {
    const parts = match[1]!.trim().split(/[\s,/]+/);
    if (parts.length < 3 || parts.length > 4) return undefined;
    const rgb = parts.slice(0, 3).map(part => parseFloat(part) * (part.endsWith('%') ? 2.55 : 1));
    const alpha = parts[3] ? parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : 1;
    if ([...rgb, alpha].every(Number.isFinite)) return [rgb[0]!, rgb[1]!, rgb[2]!, Math.min(1, Math.max(0, alpha))];
  }
  const srgb = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, Number(srgb[4] ?? 1)];
  return undefined;
}
function mix(a: RGB, b: RGB, amount: number): RGB { return a.map((v, i) => v * (1 - amount) + b[i]! * amount) as RGB; }
function luminance(rgb: RGB): number {
  const linear = rgb.map(v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(a: RGB, b: RGB): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hex(rgb: RGB): string { return '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join(''); }
function rgb(hexColor: string): RGB { return parseColor(hexColor)!.slice(0, 3) as RGB; }

/** Local presentation only: sample ancestor surfaces, preserve category hues and readable text.
 * Images/gradients cannot be sampled reliably; their solid background color is used instead.
 * Call again after a page theme change. Explicit static/custom themes remain unchanged.
 */
export function getPageTheme(element: Element): Theme {
  const win = element.ownerDocument.defaultView;
  if (!win) return getTheme();
  const styles: CSSStyleDeclaration[] = [];
  let current: Element | null = element;
  while (current) {
    styles.push(win.getComputedStyle(current));
    const root = current.getRootNode();
    current = current.parentElement ?? (root.nodeType === 11 && 'host' in root ? (root as ShadowRoot).host : null);
  }
  const scheme = styles[0]?.colorScheme || win.getComputedStyle(element.ownerDocument.documentElement).colorScheme;
  const darkCanvas = scheme === 'dark' || scheme?.includes('dark') && !!win.matchMedia?.('(prefers-color-scheme: dark)').matches;
  let surface: RGB = darkCanvas ? [24, 24, 24] : [255, 255, 255];
  for (const style of styles.reverse()) {
    const color = parseColor(style.backgroundColor);
    if (color) surface = mix(surface, color.slice(0, 3) as RGB, color[3]);
  }
  const theme = getTheme(luminance(surface) < 0.35 ? 'dark' : 'default');
  for (const category of Object.keys(theme) as Category[]) {
    // Round before checking contrast: the emitted CSS colors are opaque six-digit hex.
    const background = hex(mix(surface, rgb(theme[category].background), 0.62));
    let foreground = theme[category].color;
    if (contrast(rgb(background), rgb(foreground)) < 4.5) {
      foreground = contrast(rgb(background), [0, 0, 0]) >= contrast(rgb(background), [255, 255, 255]) ? '#000000' : '#ffffff';
    }
    theme[category] = { background, color: foreground };
  }
  return theme;
}