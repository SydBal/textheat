export type Mode = 'off' | 'auto' | 'manual';
export type ExtensionTheme = 'adaptive' | 'default' | 'dark' | 'high-contrast' | 'custom';
export interface ExtensionSettings {
  mode: Mode; threshold: number; animate: boolean; showTooltips: boolean; emojiReactions: boolean;
  theme: ExtensionTheme; customTheme: Record<string, { background: string; color: string }>;
  respectReducedMotion: boolean; processCode: boolean; processEditable: boolean; preloadPx: number; debug: boolean;
}
export interface SiteSettings { enabled: boolean; threshold?: number }
export interface StoredSettings { settings: ExtensionSettings; sites: Record<string, SiteSettings> }
export const defaults: ExtensionSettings = {
  mode: 'off', threshold: 0.3, animate: true, showTooltips: false, emojiReactions: false, theme: 'adaptive',
  customTheme: {}, respectReducedMotion: true, processCode: false, processEditable: false, preloadPx: 0, debug: false
};
export function validateSettings(value: unknown): ExtensionSettings {
  const input = value && typeof value === 'object' ? value as Partial<ExtensionSettings> : {};
  const settings = { ...defaults, ...input };
  if (!['off', 'auto', 'manual'].includes(settings.mode)) throw new TypeError('Unknown mode');
  if (!['adaptive', 'default', 'dark', 'high-contrast', 'custom'].includes(settings.theme)) throw new TypeError('Unknown theme');
  if (!Number.isFinite(settings.threshold) || settings.threshold < 0 || settings.threshold > 1) throw new RangeError('Threshold must be 0–1');
  if (!Number.isFinite(settings.preloadPx) || settings.preloadPx < 0 || settings.preloadPx > 1000) throw new RangeError('Preload must be 0–1000 pixels');
  for (const key of ['animate', 'showTooltips', 'emojiReactions', 'respectReducedMotion', 'processCode', 'processEditable', 'debug'] as const) if (typeof settings[key] !== 'boolean') throw new TypeError(`Invalid ${key}`);
  const categories = ['positive', 'negative', 'joy', 'anger', 'sadness', 'fear', 'surprise', 'neutral', 'uncertain'];
  if (!settings.customTheme || typeof settings.customTheme !== 'object' || Array.isArray(settings.customTheme)) throw new TypeError('Invalid custom theme');
  for (const [key, color] of Object.entries(settings.customTheme)) {
    if (!categories.includes(key) || !color || !/^#[\da-f]{6}$/i.test(color.background) || !/^#[\da-f]{6}$/i.test(color.color)) throw new TypeError('Custom colors must be six-digit hex');
  }
  return structuredClone(settings);
}
export function effectiveSettings(stored: StoredSettings, hostname: string): ExtensionSettings {
  const site = stored.sites[hostname];
  return { ...stored.settings, mode: site?.enabled === false ? 'off' : stored.settings.mode, threshold: site?.threshold ?? stored.settings.threshold };
}