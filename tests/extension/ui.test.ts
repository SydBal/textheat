// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../extension/shared/settings';
import type { Mode, StoredSettings } from '../../extension/shared/settings';
import type { ExtensionMessage, ExtensionResponse } from '../../extension/shared/messages';

const fixture = readFileSync(resolve(process.cwd(), 'extension/popup/popup.html'), 'utf8');
async function flush(): Promise<void> {
  // All mocked APIs resolve promises; drain initialization and event-handler chains.
  for (let i = 0; i < 80; i++) await Promise.resolve();
}
function control<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function changeMode(mode: Mode): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="mode"][value="${mode}"]`)!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

async function popup(mode: Mode = 'off', url = 'https://example.com/article', sites: StoredSettings['sites'] = {}) {
  let stored: StoredSettings = { settings: structuredClone({ ...defaults, mode }), sites: structuredClone(sites) };
  let connected = false;
  const runtimeMessage = vi.fn(async (message: ExtensionMessage): Promise<ExtensionResponse> => {
    if (message.type === 'SAVE_SETTINGS') stored.settings = { ...stored.settings, ...message.settings };
    if (message.type === 'SAVE_SITE') stored.sites[message.hostname] = structuredClone(message.settings);
    return { ok: true, stored: structuredClone(stored) };
  });
  const tabMessage = vi.fn(async (_id: number, message: ExtensionMessage): Promise<ExtensionResponse> => {
    if (message.type === 'GET_STATE') {
      if (!connected) throw new Error('No receiver');
      return { ok: true, state: { mode: stored.settings.mode, pageEnabled: true, picking: false, highlights: 2, processed: 4 } };
    }
    return { ok: true };
  });
  const chromeMock = {
    runtime: { sendMessage: runtimeMessage, openOptionsPage: vi.fn(async () => undefined) },
    tabs: { query: vi.fn(async () => [{ id: 7, url }]), sendMessage: tabMessage },
    commands: { getAll: vi.fn(async () => [
      { name: 'toggle-page', shortcut: 'Alt+Shift+H' },
      { name: 'pick-text', shortcut: 'Ctrl+Shift+P' },
      { name: 'check-selection', shortcut: '' }
    ]) },
    permissions: { request: vi.fn(async () => true) },
    scripting: {
      insertCSS: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => { connected = true; })
    }
  };
  vi.stubGlobal('chrome', chromeMock);
  await import('../../extension/popup/popup');
  await flush();
  return { ...chromeMock, stored: () => stored, connect: () => { connected = true; } };
}

beforeEach(() => {
  vi.resetModules();
  document.documentElement.innerHTML = fixture;
});
afterEach(async () => {
  window.dispatchEvent(new Event('pagehide'));
  await flush();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.innerHTML = '';
});

describe('popup Chrome integration', () => {
  it('updates actual page counts as content is added or removed, and stops when closed', async () => {
    vi.useFakeTimers();
    const mock = await popup('auto'); mock.connect();
    await vi.advanceTimersByTimeAsync(500);
    expect(control('page-status').textContent).toContain('2 highlights');
    mock.tabs.sendMessage.mockResolvedValue({ ok: true, state: { mode: 'auto', pageEnabled: true, picking: false, highlights: 19, processed: 26 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(control('page-status').textContent).toBe('19 highlights · 26 processed · page on');
    mock.tabs.sendMessage.mockResolvedValue({ ok: true, state: { mode: 'auto', pageEnabled: true, picking: false, highlights: 3, processed: 26 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(control('page-status').textContent).toContain('3 highlights');
    expect(mock.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'GET_STATE' }, { frameId: 0 });
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    const calls = mock.tabs.sendMessage.mock.calls.length;
    window.dispatchEvent(new Event('pagehide')); await vi.advanceTimersByTimeAsync(2000);
    expect(mock.tabs.sendMessage).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not overlap pending count requests or publish their results after close', async () => {
    vi.useFakeTimers();
    const mock = await popup('auto');
    let resolve!: (response: ExtensionResponse) => void;
    mock.tabs.sendMessage.mockImplementationOnce(() => new Promise<ExtensionResponse>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(500);
    const calls = mock.tabs.sendMessage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(mock.tabs.sendMessage).toHaveBeenCalledTimes(calls);
    window.dispatchEvent(new Event('pagehide'));
    const status = control('page-status').textContent;
    resolve({ ok: true, state: { mode: 'auto', pageEnabled: true, picking: false, highlights: 99, processed: 100 } }); await flush();
    expect(control('page-status').textContent).toBe(status);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('switches Off → Auto → Manual → Off, renders manual tools and actual assigned shortcuts', async () => {
    const mock = await popup();
    expect(control('manual-panel').hidden).toBe(true);
    expect(control('shortcut-toggle-page').textContent).toBe('Alt+Shift+H');
    expect(control('shortcut-pick-text').textContent).toBe('Ctrl+Shift+P');
    expect(control('shortcut-check-selection').textContent).toBe('Not assigned');
    changeMode('auto');
    expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PREPARE_AUTO' });
    expect(mock.runtime.sendMessage.mock.invocationCallOrder.at(-1)!).toBeLessThan(mock.permissions.request.mock.invocationCallOrder[0]!);
    expect(mock.permissions.request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] });
    await flush();
    expect(mock.stored().settings.mode).toBe('auto');
    expect(control('manual-panel').hidden).toBe(true);
    changeMode('manual');
    await flush();
    expect(control('manual-panel').hidden).toBe(false);
    expect(control<HTMLButtonElement>('toggle-page').disabled).toBe(false);
    changeMode('off');
    await flush();
    expect(control('manual-panel').hidden).toBe(true);
    expect(control<HTMLButtonElement>('toggle-page').disabled).toBe(true);
    expect(mock.runtime.sendMessage.mock.calls.map(([message]) => message).filter(message => message.type === 'SAVE_SETTINGS'))
      .toEqual(['auto', 'manual', 'off'].map(mode => ({ type: 'SAVE_SETTINGS', settings: { mode } })));
    expect(mock.permissions.request).toHaveBeenCalledTimes(1);
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('restores the previous mode when Auto permission is denied without persisting a mode', async () => {
    const mock = await popup('manual');
    mock.permissions.request.mockResolvedValue(false);
    changeMode('auto');
    await flush();
    expect(mock.runtime.sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['GET_SETTINGS', 'PREPARE_AUTO', 'CANCEL_AUTO']);
    expect(mock.stored().settings.mode).toBe('manual');
    expect(document.querySelector<HTMLInputElement>('input[value="manual"]')!.checked).toBe(true);
    expect(control('manual-panel').hidden).toBe(false);
    expect(control('feedback').textContent).toContain('not granted');
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('injects locally only on an explicit manual action, applies settings before PAGE_ACTION, and reuses a controller', async () => {
    const mock = await popup('manual');
    expect(mock.scripting.insertCSS).not.toHaveBeenCalled();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    mock.tabs.sendMessage.mockClear();
    control<HTMLButtonElement>('check-selection').click();
    await flush();
    expect(mock.scripting.insertCSS).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content/styles.css'] });
    expect(mock.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content/content.js'] });
    expect(mock.scripting.insertCSS.mock.invocationCallOrder[0]!).toBeLessThan(mock.scripting.executeScript.mock.invocationCallOrder[0]!);
    expect(mock.tabs.sendMessage.mock.calls.map(([, message]) => message)).toEqual([
      { type: 'GET_STATE' }, { type: 'APPLY_SETTINGS', settings: { ...defaults, mode: 'manual' } },
      { type: 'PAGE_ACTION', action: 'CHECK_SELECTION' }, { type: 'GET_STATE' }
    ]);
    control<HTMLButtonElement>('clear-page').click();
    await flush();
    expect(mock.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'PAGE_ACTION', action: 'CLEAR_PAGE' });
    expect(mock.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(mock.permissions.request).not.toHaveBeenCalled();
  });

  it('does not send PAGE_ACTION if browser-enforced local injection is rejected', async () => {
    const mock = await popup('manual');
    mock.scripting.insertCSS.mockRejectedValue(new Error('Cannot access protected page'));
    control<HTMLButtonElement>('toggle-page').click();
    await flush();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.tabs.sendMessage.mock.calls.some(([, message]) => message.type === 'PAGE_ACTION')).toBe(false);
    expect(control('feedback').textContent).toContain('does not allow extensions');
    expect(control<HTMLButtonElement>('toggle-page').disabled).toBe(false);
  });

  it('disables tools and never injects on a restricted browser page, even for a dispatched click', async () => {
    const mock = await popup('manual', 'chrome://settings/');
    expect(control('page-status').textContent).toContain('cannot be accessed');
    expect(control<HTMLInputElement>('site-enabled').disabled).toBe(true);
    expect(control<HTMLButtonElement>('toggle-page').disabled).toBe(true);
    control('toggle-page').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(mock.tabs.sendMessage).not.toHaveBeenCalled();
    expect(mock.scripting.insertCSS).not.toHaveBeenCalled();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('disables the current site without changing global Manual mode or dropping its threshold override', async () => {
    const mock = await popup('manual', 'https://example.com/article', { 'example.com': { enabled: true, threshold: 0.65 } });
    const enabled = control<HTMLInputElement>('site-enabled');
    enabled.checked = false;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: false, threshold: 0.65 } });
    expect(mock.stored().settings.mode).toBe('manual');
    expect(enabled.checked).toBe(false);
    expect(control<HTMLInputElement>('threshold').value).toBe('0.65');
    expect(control('site-threshold-note').hidden).toBe(false);
    expect(control<HTMLButtonElement>('check-selection').disabled).toBe(true);
    control('check-selection').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.tabs.sendMessage.mock.calls.some(([, message]) => message.type === 'PAGE_ACTION')).toBe(false);
  });
  it.each(['processCode', 'processEditable', 'emojiReactions', 'roundedCorners'] as const)('exposes and persists the %s menu opt-in', async key => {
    const mock = await popup();
    const checkbox = control<HTMLInputElement>(key);
    expect(checkbox.checked).toBe(false);
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await flush();
    expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'SAVE_SETTINGS', settings: { [key]: true } });
    expect(mock.stored().settings[key]).toBe(true); expect(checkbox.checked).toBe(true);
  });
  it('applies the saved edge preference in the popup without changing it during theme updates', async () => {
    const mock = await popup();
    expect(document.documentElement.dataset.edges).toBe('sharp');
    const checkbox = control<HTMLInputElement>('roundedCorners');
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await flush();
    expect(document.documentElement.dataset.edges).toBe('rounded');
    control<HTMLSelectElement>('theme').value = 'dark';
    control('theme').dispatchEvent(new Event('change', { bubbles: true })); await flush();
    expect(document.documentElement.dataset.edges).toBe('rounded');
    expect(mock.stored().settings.roundedCorners).toBe(true);
  });
  it('marks brief saves busy without changing the selected control before persistence', async () => {
    const mock = await popup();
    let resolve!: (response: ExtensionResponse) => void;
    mock.runtime.sendMessage.mockImplementationOnce(() => new Promise<ExtensionResponse>(done => { resolve = done; }));
    const theme = control<HTMLSelectElement>('theme'); theme.value = 'dark';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('main')!.getAttribute('aria-busy')).toBe('true');
    expect(theme.value).toBe('dark');
    resolve({ ok: true, stored: { settings: { ...defaults, theme: 'dark' }, sites: {} } }); await flush();
    expect(document.querySelector('main')!.getAttribute('aria-busy')).toBe('false');
    expect(theme.value).toBe('dark');
  });
});