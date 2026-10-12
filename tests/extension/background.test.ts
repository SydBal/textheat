// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../extension/shared/settings';
import type { Mode, StoredSettings } from '../../extension/shared/settings';
import type { ExtensionMessage, ExtensionResponse } from '../../extension/shared/messages';

type MessageListener = (message: ExtensionMessage, sender: chrome.runtime.MessageSender, respond: (response: ExtensionResponse) => void) => boolean | void;
function event<T>() {
  const listeners: T[] = [];
  return { listeners, addListener: vi.fn((listener: T) => { listeners.push(listener); }) };
}
async function flush(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function background(mode: Mode = 'off', origins: string[] = []) {
  let data: StoredSettings = { settings: structuredClone({ ...defaults, mode }), sites: {} };
  const onMessage = event<MessageListener>();
  const onCommand = event<(command: string) => void>();
  const onInstalled = event<() => void>();
  const onStartup = event<() => void>();
  const onAdded = event<() => void>();
  const onRemoved = event<() => void>();
  const onChanged = event<(changes: Record<string, unknown>, area: string) => void>();
  const sync = {
    get: vi.fn(async (_keys: string[]) => { throw new Error('Sync access forbidden'); }),
    set: vi.fn(async (_stored: StoredSettings) => { throw new Error('Sync access forbidden'); })
  };
  const local = {
    get: vi.fn(async (_keys: string[]) => structuredClone(data)),
    set: vi.fn(async (stored: StoredSettings) => { data = structuredClone(stored); })
  };
  const chromeMock = {
    runtime: { id: 'textheat-test', onMessage, onInstalled, onStartup },
    commands: { onCommand },
    permissions: { getAll: vi.fn(async () => ({ origins })), onAdded, onRemoved },
    storage: { sync, local, onChanged },
    tabs: {
      query: vi.fn(async (_query: unknown) => [{ id: 7, url: 'https://example.com/article' }]),
      sendMessage: vi.fn(async (_id: number, _message: ExtensionMessage): Promise<ExtensionResponse> => ({ ok: true }))
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async (_filter: unknown): Promise<chrome.scripting.RegisteredContentScript[]> => []),
      unregisterContentScripts: vi.fn(async (_filter: unknown) => undefined),
      registerContentScripts: vi.fn(async (_scripts: chrome.scripting.RegisteredContentScript[]) => undefined),
      insertCSS: vi.fn(async (_details: unknown) => undefined),
      executeScript: vi.fn(async (_details: unknown) => [])
    }
  };
  vi.stubGlobal('chrome', chromeMock);
  await import('../../extension/background/service-worker');
  // The worker reconciles immediately on import, before any lifecycle event.
  await flush();
  function message(message: ExtensionMessage, sender: chrome.runtime.MessageSender = { id: 'textheat-test' }) {
    return new Promise<ExtensionResponse>(respond => { onMessage.listeners[0]!(message, sender, respond); });
  }
  return { ...chromeMock, message, data: () => data };
}

beforeEach(() => { vi.resetModules(); });
afterEach(async () => {
  await flush();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('background Chrome integration', () => {
  it('reconciles immediately and switching Off unregisters Auto and stops existing pages without injection', async () => {
    const mock = await background('auto', ['https://example.com/*']);
    expect(mock.permissions.getAll).toHaveBeenCalledTimes(1);
    expect(mock.tabs.query).toHaveBeenCalledWith({});
    mock.scripting.getRegisteredContentScripts.mockResolvedValue([{ id: 'textheat-auto', matches: ['https://example.com/*'], js: ['content/content.js'] }]);
    mock.tabs.sendMessage.mockClear();
    const response = await mock.message({ type: 'SAVE_SETTINGS', settings: { mode: 'off' } });
    expect(response.ok).toBe(true);
    expect(mock.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: ['textheat-auto'] });
    expect(mock.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'APPLY_SETTINGS', settings: { ...defaults, mode: 'off' } });
    expect(mock.scripting.insertCSS).not.toHaveBeenCalled();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.storage.local.set).toHaveBeenCalledExactlyOnceWith(mock.data());
    expect(mock.storage.sync.get).not.toHaveBeenCalled();
    expect(mock.storage.sync.set).not.toHaveBeenCalled();
  });

  it('registers only granted HTTP(S) origins and reconciles permission removal, startup and storage events', async () => {
    const mock = await background('auto', ['https://example.com/*', 'file:///*', 'chrome://*/*', 'https://example.com/*', 'http://localhost/*']);
    expect(mock.scripting.registerContentScripts).toHaveBeenCalledExactlyOnceWith([{
      id: 'textheat-auto', matches: ['http://localhost/*', 'https://example.com/*'],
      js: ['content/content.js'], css: ['content/styles.css'], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true
    }]);
    mock.scripting.getRegisteredContentScripts.mockResolvedValue([{ id: 'textheat-auto', matches: ['https://example.com/*'], js: ['content/content.js'] }]);
    mock.permissions.getAll.mockResolvedValue({ origins: [] });
    mock.permissions.onRemoved.listeners[0]!();
    await flush();
    expect(mock.scripting.unregisterContentScripts).toHaveBeenCalledTimes(1);
    expect(mock.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const reads = mock.permissions.getAll.mock.calls.length;
    mock.storage.onChanged.listeners[0]!({ unrelated: {} }, 'sync');
    mock.storage.onChanged.listeners[0]!({ settings: {} }, 'sync');
    mock.storage.onChanged.listeners[0]!({ sites: {} }, 'sync');
    mock.storage.onChanged.listeners[0]!({ unrelated: {} }, 'local');
    mock.storage.onChanged.listeners[0]!({ settings: {} }, 'session');
    await flush();
    expect(mock.permissions.getAll).toHaveBeenCalledTimes(reads);
    mock.runtime.onStartup.listeners[0]!();
    mock.runtime.onInstalled.listeners[0]!();
    mock.permissions.onAdded.listeners[0]!();
    mock.storage.onChanged.listeners[0]!({ sites: {} }, 'local');
    mock.storage.onChanged.listeners[0]!({ settings: {} }, 'local');
    await flush();
    expect(mock.permissions.getAll).toHaveBeenCalledTimes(reads + 5);
    expect(mock.storage.sync.get).not.toHaveBeenCalled();
    expect(mock.storage.sync.set).not.toHaveBeenCalled();
  });

  it('rejects content-script mutations and foreign senders but permits content-script GET_SETTINGS', async () => {
    const mock = await background();
    const contentSender = { id: 'textheat-test', tab: { id: 7 } as chrome.tabs.Tab };
    for (const message of [
      { type: 'SAVE_SETTINGS', settings: { mode: 'auto' } },
      { type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: false } }
    ] satisfies ExtensionMessage[]) {
      expect(await mock.message(message, contentSender)).toEqual({ ok: false, error: 'Not authorized' });
    }
    expect(await mock.message({ type: 'GET_SETTINGS' }, { id: 'foreign-extension' })).toEqual({ ok: false, error: 'Not authorized' });
    expect(await mock.message({ type: 'GET_SETTINGS' }, contentSender)).toEqual({ ok: true, stored: { settings: defaults, sites: {} } });
    expect(mock.storage.local.set).not.toHaveBeenCalled();
    expect(mock.storage.sync.get).not.toHaveBeenCalled();
    expect(mock.storage.sync.set).not.toHaveBeenCalled();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('serializes read-modify-write and reconciliation without losing concurrent updates or blocking bootstrap GET', async () => {
    const mock = await background();
    const gate = deferred();
    const write = mock.storage.local.set.getMockImplementation()!;
    mock.storage.local.set.mockImplementationOnce(async stored => { await gate.promise; await write(stored); });
    const first = mock.message({ type: 'SAVE_SETTINGS', settings: { threshold: 0.8 } });
    const second = mock.message({ type: 'SAVE_SETTINGS', settings: { theme: 'dark' } });
    const third = mock.message({ type: 'SAVE_SITE', hostname: 'EXAMPLE.com', settings: { enabled: false, threshold: 0.6 } });
    await flush();
    try {
      expect(mock.storage.local.set).toHaveBeenCalledTimes(1);
      const bootstrap = await mock.message({ type: 'GET_SETTINGS' }, { id: 'textheat-test', tab: { id: 7 } as chrome.tabs.Tab });
      expect(bootstrap.stored?.settings.threshold).toBe(defaults.threshold);
    } finally { gate.resolve(); }
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect((await third).ok).toBe(true);
    expect(mock.data().settings).toEqual({ ...defaults, threshold: 0.8, theme: 'dark' });
    expect(mock.data().sites).toEqual({ 'example.com': { enabled: false, threshold: 0.6 } });
    expect((await mock.message({ type: 'GET_SETTINGS' })).stored).toEqual(mock.data());
    expect(mock.storage.local.set).toHaveBeenCalledTimes(3);
    expect(mock.storage.sync.get).not.toHaveBeenCalled();
    expect(mock.storage.sync.set).not.toHaveBeenCalled();
    expect(mock.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'APPLY_SETTINGS').map(([, message]) =>
      message.type === 'APPLY_SETTINGS' ? [message.settings.threshold, message.settings.theme] : []
    )).toEqual([[defaults.threshold, defaults.theme], [0.8, defaults.theme], [0.8, 'dark'], [0.6, 'dark']]);
  });

  it('rejects invalid global and site thresholds without writing and accepts both inclusive boundaries', async () => {
    const mock = await background();
    for (const threshold of [-0.01, 1.01, NaN, Infinity, '0.5']) {
      for (const message of [
        { type: 'SAVE_SETTINGS', settings: { threshold } },
        { type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: true, threshold } }
      ]) {
        const result = await mock.message(message as ExtensionMessage);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/threshold/i);
      }
    }
    expect(mock.storage.local.set).not.toHaveBeenCalled();
    for (const threshold of [0, 1]) {
      expect((await mock.message({ type: 'SAVE_SETTINGS', settings: { threshold } })).ok).toBe(true);
      expect((await mock.message({ type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: true, threshold } })).ok).toBe(true);
    }
    expect(mock.data().settings.threshold).toBe(1);
    expect(mock.data().sites['example.com']).toEqual({ enabled: true, threshold: 1 });
    expect(mock.storage.sync.get).not.toHaveBeenCalled();
    expect(mock.storage.sync.set).not.toHaveBeenCalled();
  });

  it('preserves hostname and settings validation before local writes', async () => {
    const mock = await background();
    for (const hostname of ['', 'example.com/path', 'example.com:443', 'user@example.com', 'example.com?query',
      'example.com#fragment', 'example.com\\path', 'example com', '__proto__', 'constructor', 'prototype']) {
      expect((await mock.message({ type: 'SAVE_SITE', hostname, settings: { enabled: true } })).ok).toBe(false);
    }
    for (const settings of [{ unknown: true }, { mode: 'invalid' }, { theme: 'invalid' },
      { customTheme: { positive: { background: 'red', color: '#ffffff' } } }]) {
      expect((await mock.message({ type: 'SAVE_SETTINGS', settings } as ExtensionMessage)).ok).toBe(false);
    }
    expect(mock.storage.local.set).not.toHaveBeenCalled();
    expect((await mock.message({ type: 'SAVE_SITE', hostname: 'EXAMPLE.com', settings: { enabled: true } })).ok).toBe(true);
    expect(mock.data().sites).toEqual({ 'example.com': { enabled: true } });
    expect(mock.storage.sync.get).not.toHaveBeenCalled();
    expect(mock.storage.sync.set).not.toHaveBeenCalled();
  });

  it('guards keyboard actions by mode, site and URL, then injects locally and sends the requested manual action', async () => {
    const mock = await background();
    const command = async (name: string) => { mock.commands.onCommand.listeners[0]!(name); await flush(); };
    await command('toggle-page');
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    await mock.message({ type: 'SAVE_SETTINGS', settings: { mode: 'manual' } });
    await mock.message({ type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: false } });
    await command('pick-text');
    await mock.message({ type: 'SAVE_SITE', hostname: 'example.com', settings: { enabled: true } });
    mock.tabs.query.mockResolvedValue([{ id: 7, url: 'chrome://settings/' }]);
    await command('check-selection');
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.tabs.sendMessage.mock.calls.some(([, message]) => message.type === 'PAGE_ACTION')).toBe(false);
    mock.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/article' }]);
    mock.tabs.sendMessage.mockImplementation(async (_id, message) => {
      if (message.type === 'GET_STATE') throw new Error('No receiver');
      return { ok: true };
    });
    mock.tabs.sendMessage.mockClear();
    for (const [name, action] of [['toggle-page', 'TOGGLE_PAGE'], ['pick-text', 'PICK_TEXT'], ['check-selection', 'CHECK_SELECTION']] as const) {
      await command(name);
      expect(mock.tabs.sendMessage.mock.calls.slice(-3).map(([, message]) => message)).toEqual([
        { type: 'GET_STATE' }, { type: 'APPLY_SETTINGS', settings: { ...defaults, mode: 'manual' } }, { type: 'PAGE_ACTION', action }
      ]);
    }
    expect(mock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(mock.scripting.insertCSS).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content/styles.css'] });
    expect(mock.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content/content.js'] });
    mock.scripting.insertCSS.mockRejectedValue(new Error('Protected HTTP page'));
    mock.tabs.sendMessage.mockClear();
    await command('toggle-page');
    expect(mock.tabs.sendMessage.mock.calls.map(([, message]) => message)).toEqual([{ type: 'GET_STATE' }]);
    const queries = mock.tabs.query.mock.calls.length;
    await command('unknown-command');
    expect(mock.tabs.query).toHaveBeenCalledTimes(queries);
  });
});