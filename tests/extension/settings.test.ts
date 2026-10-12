import { describe, expect, it } from 'vitest';
import { defaults, effectiveSettings, validateSettings } from '../../extension/shared/settings';
import { readFileSync } from 'node:fs';
describe('extension settings and permission contract', () => {
  it('defaults Off, isolates settings, and applies per-site disabling', () => {
    const settings = validateSettings({ mode: 'auto' }); settings.customTheme.positive = { background: '#000000', color: '#FFFFFF' };
    expect(defaults.customTheme).toEqual({});
    expect(effectiveSettings({ settings, sites: { 'example.com': { enabled: false } } }, 'example.com').mode).toBe('off');
    expect(effectiveSettings({ settings, sites: { 'example.com': { enabled: true, threshold: 0.8 } } }, 'example.com').threshold).toBe(0.8);
  });
  it.each([{ mode: 'bad' }, { threshold: NaN }, { threshold: 2 }, { preloadPx: -1 }, { animate: 'yes' }, { customTheme: { positive: { background: 'url(x)', color: '#FFFFFF' } } }])('rejects unsafe settings %#', input => {
    expect(() => validateSettings(input)).toThrow();
  });
  it('uses MV3 with explicit hotkeys and optional—not required—site access', () => {
    const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting']);
    expect(Object.keys(manifest.commands)).toEqual(['toggle-page', 'pick-text', 'check-selection']);
  });
});