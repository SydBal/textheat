// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../extension/shared/settings';
import type { ExtensionSettings, StoredSettings } from '../../extension/shared/settings';
import type { ExtensionMessage, ExtensionResponse } from '../../extension/shared/messages';

const fixture = readFileSync(resolve(process.cwd(), 'extension/options/options.html'), 'utf8');
const booleanKeys = ['animate', 'showTooltips', 'emojiReactions', 'roundedCorners', 'respectReducedMotion', 'processCode', 'processEditable', 'debug'] as const;
const palette = { positive: { background: '#ABCDEF', color: '#012ABC' } };

async function flush(): Promise<void> {
  // Drain mocked API promises, initialization, and async submit handlers.
  for (let i = 0; i < 80; i++) await Promise.resolve();
}
function control<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function submit(id: string): void {
  control(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
function theme(value: ExtensionSettings['theme']): void {
  control<HTMLSelectElement>('theme').value = value;
  control('theme').dispatchEvent(new Event('change', { bubbles: true }));
}
function draft(value: string): void {
  control<HTMLTextAreaElement>('customTheme').value = value;
  control('customTheme').dispatchEvent(new Event('input', { bubbles: true }));
}
function button(label: string): HTMLButtonElement {
  const value = Array.from(control('site-list').querySelectorAll('button'))
    .find(candidate => candidate.getAttribute('aria-label') === label);
  if (!value) throw new Error(`Missing site action: ${label}`);
  return value;
}

async function options({ settings = {}, sites = {}, granted = true, loadError, permissionError }: {
  settings?: Partial<ExtensionSettings>;
  sites?: StoredSettings['sites'];
  granted?: boolean;
  loadError?: string;
  permissionError?: string;
} = {}) {
  const stored: StoredSettings = {
    settings: structuredClone({ ...defaults, ...settings }), sites: structuredClone(sites)
  };
  const runtimeMessage = vi.fn(async (message: ExtensionMessage): Promise<ExtensionResponse> => {
    if (message.type === 'GET_SETTINGS' && loadError) return { ok: false, error: loadError };
    if (message.type === 'SAVE_SETTINGS') stored.settings = { ...stored.settings, ...message.settings };
    if (message.type === 'SAVE_SITE') stored.sites[message.hostname] = structuredClone(message.settings);
    return { ok: true, stored: structuredClone(stored) };
  });
  const chromeMock = {
    runtime: { sendMessage: runtimeMessage },
    permissions: {
      contains: vi.fn(async () => {
        if (permissionError) throw new Error(permissionError);
        return granted;
      }),
      request: vi.fn(async () => true)
    }
  };
  vi.stubGlobal('chrome', chromeMock);
  await import('../../extension/options/options');
  await flush();
  return { ...chromeMock, stored: () => structuredClone(stored) };
}

beforeEach(() => {
  vi.resetModules();
  document.documentElement.innerHTML = fixture;
});
afterEach(async () => {
  await flush();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.innerHTML = '';
});

describe('options settings integration', () => {
  it('loads all controls, a safe custom preview, sorted sites, and permission status', async () => {
    const settings: ExtensionSettings = {
      ...defaults, mode: 'manual', theme: 'custom', customTheme: palette, threshold: 0.67,
      preloadPx: 812, animate: false, showTooltips: true, respectReducedMotion: false,
      processCode: true, debug: true
    };
    const mock = await options({ settings, sites: {
      'z.example': { enabled: false, threshold: 0.8 }, 'a.example': { enabled: true }
    } });
    expect(mock.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'GET_SETTINGS' });
    expect(document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value).toBe('manual');
    expect(control<HTMLInputElement>('threshold').value).toBe('0.67');
    expect(control<HTMLOutputElement>('threshold-value').value).toBe('0.67');
    expect(control<HTMLSelectElement>('theme').value).toBe('custom');
    expect(JSON.parse(control<HTMLTextAreaElement>('customTheme').value)).toEqual(palette);
    expect(control<HTMLInputElement>('preloadPx').value).toBe('812');
    for (const key of booleanKeys) expect(control<HTMLInputElement>(key).checked).toBe(settings[key]);
    expect(control('custom-editor').hidden).toBe(false);
    expect(control('customTheme').getAttribute('aria-invalid')).toBe('false');
    const chip = control('palette-preview').firstElementChild as HTMLElement;
    expect(chip.textContent).toBe('positive');
    expect(chip.style.backgroundColor).toBe('rgb(171, 205, 239)');
    expect(chip.style.color).toBe('rgb(1, 42, 188)');
    expect(Array.from(control('site-list').querySelectorAll('strong'), node => node.textContent))
      .toEqual(['a.example', 'z.example']);
    expect(control('site-list').textContent).toContain('Disabled · threshold 0.80');
    expect(control('site-list').textContent).toContain('global sensitivity');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(false);
    expect(control<HTMLFieldSetElement>('site-controls').disabled).toBe(false);
    expect(button('Enable z.example').disabled).toBe(false);
    expect(mock.permissions.contains).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] });
    expect(control('permission-status').textContent).toContain('Website access granted');
    expect(control('feedback').textContent).toBe('');
  });

  it('shows the empty site state and saves every boolean, preload, threshold, and mode', async () => {
    const mock = await options();
    expect(document.documentElement.dataset.edges).toBe('sharp');
    expect(control('site-list').textContent).toContain('No saved site preferences');
    for (const key of booleanKeys) control<HTMLInputElement>(key).checked = !defaults[key];
    document.querySelector<HTMLInputElement>('input[name="mode"][value="manual"]')!.checked = true;
    control<HTMLInputElement>('threshold').value = '0.72';
    control('threshold').dispatchEvent(new Event('input', { bubbles: true }));
    expect(control<HTMLOutputElement>('threshold-value').value).toBe('0.72');
    control<HTMLInputElement>('preloadPx').value = '999';
    theme('dark');
    const validity = vi.spyOn(control<HTMLFormElement>('settings-form'), 'reportValidity');
    submit('settings-form');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(true);
    expect(control<HTMLFieldSetElement>('site-controls').disabled).toBe(true);
    await flush();
    expect(document.documentElement.dataset.edges).toBe('rounded');
    const expected = {
      ...defaults, mode: 'manual', theme: 'dark', threshold: 0.72, preloadPx: 999,
      animate: false, showTooltips: true, emojiReactions: true, roundedCorners: true, respectReducedMotion: false, processCode: true, processEditable: true, debug: true
    };
    expect(validity).toHaveBeenCalledOnce();
    expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'SAVE_SETTINGS', settings: expected });
    expect(mock.stored().settings).toEqual(expected);
    expect(control('feedback').textContent).toContain('Preferences saved');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(false);
    expect(mock.permissions.request).not.toHaveBeenCalled();
  });

  it('blocks a programmatic global submission with an invalid required numeric control', async () => {
    const mock = await options();
    control<HTMLInputElement>('preloadPx').value = '1001';
    const validity = vi.spyOn(control<HTMLFormElement>('settings-form'), 'reportValidity');
    submit('settings-form');
    await flush();
    expect(validity).toHaveReturnedWith(false);
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('accepts uppercase six-digit hex custom colors and persists them unchanged', async () => {
    const mock = await options();
    theme('custom');
    draft(JSON.stringify(palette));
    expect(control('custom-status').textContent).toContain('Valid palette');
    submit('settings-form');
    await flush();
    expect(mock.stored().settings.customTheme).toEqual(palette);
    expect(mock.stored().settings.theme).toBe('custom');
    expect(control('feedback').textContent).toContain('Preferences saved');
  });

  it.each([
    '{', 'null', '[]', '{"positive":{}}',
    '{"positive":{"background":"url(javascript:alert(1))","color":"#000000"}}',
    '{"positive":{"background":"#ffffff","color":"url(https://evil.example/pixel)"}}',
    '{"<img src=x onerror=alert(1)>":{"background":"#ffffff","color":"#000000"}}'
  ])('rejects invalid or unsafe visible custom JSON without rendering or saving: %s', async value => {
    const mock = await options({ settings: { customTheme: palette } });
    theme('custom');
    draft(value);
    expect(control('customTheme').getAttribute('aria-invalid')).toBe('true');
    expect(control('custom-status').textContent).not.toBe('');
    expect(control('palette-preview').children).toHaveLength(0);
    expect(control('palette-preview').querySelector('img')).toBeNull();
    submit('settings-form');
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.stored().settings.customTheme).toEqual(palette);
    expect(control('feedback').textContent).not.toBe('');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(false);
  });

  it.each(['adaptive', 'default', 'dark', 'high-contrast'] as const)(
    'saves unrelated changes with %s without parsing an invalid hidden draft or losing the stored palette', async value => {
      const mock = await options({ settings: { theme: 'custom', customTheme: palette } });
      draft('{');
      expect(control('customTheme').getAttribute('aria-invalid')).toBe('true');
      theme(value);
      expect(control('custom-editor').hidden).toBe(true);
      expect(control('custom-status').textContent).toBe('');
      expect(control('customTheme').hasAttribute('aria-invalid')).toBe(false);
      // Input events on the hidden editor must not surface preview errors either.
      draft('{still invalid');
      expect(control('custom-status').textContent).toBe('');
      expect(control('palette-preview').children).toHaveLength(0);
      control<HTMLInputElement>('debug').checked = true;
      submit('settings-form');
      await flush();
      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith({
        type: 'SAVE_SETTINGS', settings: { ...defaults, theme: value, customTheme: palette, debug: true }
      });
      expect(mock.stored().settings.customTheme).toEqual(palette);
      expect(control('feedback').textContent).toContain('Preferences saved');
    }
  );

  it('validates an invalid draft again when the custom editor is shown again', async () => {
    const mock = await options();
    draft('{');
    expect(control('custom-status').textContent).toBe('');
    theme('custom');
    expect(control('customTheme').getAttribute('aria-invalid')).toBe('true');
    submit('settings-form');
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('warns about missing Auto permission without saving or automatically requesting permission', async () => {
    const mock = await options({ granted: false });
    expect(control('permission-status').textContent).toContain('toolbar popup');
    document.querySelector<HTMLInputElement>('input[name="mode"][value="auto"]')!.checked = true;
    submit('settings-form');
    await flush();
    expect(mock.permissions.contains).toHaveBeenCalledTimes(2);
    expect(mock.permissions.request).not.toHaveBeenCalled();
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.stored().settings.mode).toBe('off');
    expect(control('feedback').textContent).toContain('toolbar popup');
    expect(control('feedback').textContent).toContain('Nothing was saved');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(false);
  });

  it('saves Auto after verifying existing permission', async () => {
    const mock = await options();
    document.querySelector<HTMLInputElement>('input[name="mode"][value="auto"]')!.checked = true;
    submit('settings-form');
    await flush();
    expect(mock.stored().settings.mode).toBe('auto');
    expect(mock.permissions.contains).toHaveBeenCalledTimes(2);
    expect(mock.permissions.request).not.toHaveBeenCalled();
  });

  it.each(['load', 'permission'] as const)('keeps controls locked when initial %s fails', async failure => {
    const mock = await options({
      ...(failure === 'load' ? { loadError: 'Storage unavailable' } : { permissionError: 'Permission lookup failed' }),
      sites: { 'example.com': { enabled: true } }
    });
    expect(control('feedback').textContent).toContain(failure === 'load' ? 'Storage unavailable' : 'Permission lookup failed');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(true);
    expect(control<HTMLFieldSetElement>('site-controls').disabled).toBe(true);
    for (const action of control('site-list').querySelectorAll<HTMLButtonElement>('button')) expect(action.disabled).toBe(true);
    submit('settings-form');
    control<HTMLInputElement>('site-hostname').value = 'example.com';
    submit('site-form');
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['settings-form', 'site-form'])('surfaces failed saves and unlocks controls for %s', async form => {
    const mock = await options();
    control<HTMLInputElement>('site-hostname').value = 'example.com';
    mock.runtime.sendMessage.mockResolvedValueOnce({ ok: false, error: 'Storage write failed' });
    submit(form);
    await flush();
    expect(control('feedback').textContent).toBe('Storage write failed');
    expect(control<HTMLFieldSetElement>('settings-controls').disabled).toBe(false);
    expect(control<HTMLFieldSetElement>('site-controls').disabled).toBe(false);
    expect(mock.stored()).toEqual({ settings: defaults, sites: {} });
  });

  it('surfaces rejected API calls and successful-save warnings rather than overwriting them', async () => {
    const mock = await options();
    mock.runtime.sendMessage.mockRejectedValueOnce(new Error('Extension disconnected'));
    submit('settings-form');
    await flush();
    expect(control('feedback').textContent).toBe('Extension disconnected');
    mock.runtime.sendMessage.mockResolvedValueOnce({ ok: true, stored: mock.stored(), error: 'Some open pages could not update' });
    submit('settings-form');
    await flush();
    expect(control('feedback').textContent).toBe('Some open pages could not update');
  });
});

describe('options site preferences', () => {
  it.each([
    ['  EXAMPLE.COM  ', 'example.com'], ['BÜCHER.de', 'xn--bcher-kva.de'],
    ['[2001:0DB8:0:0:0:0:0:1]', '[2001:db8::1]']
  ])('normalizes %s to %s when saving a site', async (input, hostname) => {
    const mock = await options();
    control<HTMLInputElement>('site-hostname').value = input;
    control<HTMLInputElement>('site-enabled').checked = false;
    control<HTMLInputElement>('site-threshold').value = '0.61';
    submit('site-form');
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: 'SAVE_SITE', hostname, settings: { enabled: false, threshold: 0.61 }
    });
    expect(control('site-list').querySelector('strong')!.textContent).toBe(hostname);
    expect(control('feedback').textContent).toContain(`Site preferences saved for ${hostname}`);
  });

  it.each(['', '-0.01', '1.01', '0.005'])('checks native site validity before messaging (threshold %s)', async value => {
    const mock = await options();
    control<HTMLInputElement>('site-hostname').value = value === '' ? '' : 'example.com';
    control<HTMLInputElement>('site-threshold').value = value;
    const validity = vi.spyOn(control<HTMLFormElement>('site-form'), 'reportValidity');
    submit('site-form');
    await flush();
    expect(validity).toHaveReturnedWith(false);
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(control('feedback').textContent).toBe('');
  });

  it.each(['https://example.com', 'example.com/path', 'example.com:443', 'user@example.com',
    'example.com?query', 'example.com#hash', 'two hosts.com', 'example.com\\path', '[not-ipv6]'])
    ('rejects a non-hostname %s without messaging', async input => {
      const mock = await options();
      control<HTMLInputElement>('site-hostname').value = input;
      submit('site-form');
      await flush();
      expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(control('feedback').textContent).toContain('without a URL, port, or path');
    });

  it('edits and saves an override without trapping or losing hostname focus', async () => {
    const mock = await options({ sites: { 'example.com': { enabled: false, threshold: 0.64 } } });
    button('Edit example.com').click();
    const host = control<HTMLInputElement>('site-hostname');
    expect(document.activeElement).toBe(host);
    expect(host.value).toBe('example.com');
    expect(control<HTMLInputElement>('site-enabled').checked).toBe(false);
    expect(control<HTMLInputElement>('site-threshold').value).toBe('0.64');
    control<HTMLInputElement>('site-threshold').value = '';
    submit('site-form');
    // jsdom does not blur a focused input when its ancestor fieldset is disabled;
    // explicitly model that browser focus loss during the async save.
    host.blur();
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: false }
    });
    expect(document.activeElement).toBe(host);
    control('theme').focus();
    expect(document.activeElement).toBe(control('theme'));
  });

  it('clears a previous threshold when editing a site that uses global sensitivity', async () => {
    await options({ sites: { 'a.example': { enabled: false, threshold: 0.9 }, 'b.example': { enabled: true } } });
    button('Edit a.example').click();
    button('Edit b.example').click();
    expect(control<HTMLInputElement>('site-hostname').value).toBe('b.example');
    expect(control<HTMLInputElement>('site-enabled').checked).toBe(true);
    expect(control<HTMLInputElement>('site-threshold').value).toBe('');
  });

  it('restores the corresponding toggle button after replacement and preserves its threshold', async () => {
    const mock = await options({ settings: { mode: 'manual' }, sites: {
      'a.example': { enabled: true }, 'z.example': { enabled: true, threshold: 0.8 }
    } });
    const original = button('Disable z.example');
    original.focus();
    original.click();
    expect(original.disabled).toBe(true);
    await flush();
    expect(original.isConnected).toBe(false);
    expect(document.activeElement).toBe(button('Enable z.example'));
    expect(mock.stored().sites['z.example']).toEqual({ enabled: false, threshold: 0.8 });
    button('Enable z.example').click();
    await flush();
    expect(document.activeElement).toBe(button('Disable z.example'));
    expect(mock.stored().sites['z.example']).toEqual({ enabled: true, threshold: 0.8 });
    expect(mock.stored().settings.mode).toBe('manual');
  });

  it('restores reset focus, enables the site, and removes the threshold without changing global mode', async () => {
    const mock = await options({ settings: { mode: 'manual' }, sites: { 'example.com': { enabled: false, threshold: 0.9 } } });
    const original = button('Reset example.com');
    original.focus();
    original.click();
    await flush();
    expect(original.isConnected).toBe(false);
    expect(document.activeElement).toBe(button('Reset example.com'));
    expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: true }
    });
    expect(mock.stored().settings.mode).toBe('manual');
    expect(control('site-list').textContent).toContain('Enabled · global sensitivity');
  });

  it('does not steal focus moved elsewhere while saving or send duplicate saves while busy', async () => {
    const mock = await options({ sites: { 'example.com': { enabled: true } } });
    let finish!: (response: ExtensionResponse) => void;
    mock.runtime.sendMessage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const original = button('Disable example.com');
    original.focus();
    original.click();
    original.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    submit('settings-form');
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenCalledTimes(2);
    // A focusable control outside the locked fieldsets represents user navigation.
    const feedback = control('feedback');
    feedback.tabIndex = 0;
    feedback.focus();
    finish({ ok: true, stored: { settings: defaults, sites: { 'example.com': { enabled: false } } } });
    await flush();
    expect(document.activeElement).toBe(feedback);
    expect(button('Enable example.com').disabled).toBe(false);
  });
});