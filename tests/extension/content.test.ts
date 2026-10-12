// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../extension/shared/settings';
import type { ExtensionSettings, StoredSettings } from '../../extension/shared/settings';
import type { ExtensionMessage, ExtensionResponse, PageState } from '../../extension/shared/messages';

const controller = vi.hoisted(() => ({
  configure: vi.fn<(settings: ExtensionSettings) => void>(),
  destroy: vi.fn<() => void>(),
  action: vi.fn(),
  state: vi.fn<() => PageState>(),
  construct: vi.fn()
}));
vi.mock('../../src/extension/controller', () => ({
  PageController: class {
    constructor() { controller.construct(); }
    configure = controller.configure;
    destroy = controller.destroy;
    action = controller.action;
    state = controller.state;
  }
}));

type MessageListener = (message: ExtensionMessage, sender: chrome.runtime.MessageSender, respond: (response: ExtensionResponse) => void) => boolean | void;
type LifecycleEvent = { persisted: boolean };
function deferred() {
  let resolve!: (response: ExtensionResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ExtensionResponse>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function stored(settings: Partial<ExtensionSettings> = {}, sites: StoredSettings['sites'] = {}): ExtensionResponse {
  return { ok: true, stored: { settings: { ...defaults, mode: 'auto', ...settings }, sites } };
}
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

function setup() {
  const requests: ReturnType<typeof deferred>[] = [];
  const listeners: MessageListener[] = [];
  const lifecycle = new Map<string, ((event: LifecycleEvent) => void)[]>();
  let enabled = false;
  controller.configure.mockImplementation(settings => { enabled = settings.mode === 'auto'; });
  controller.destroy.mockImplementation(() => { enabled = false; });
  controller.state.mockImplementation(() => ({ mode: 'off', pageEnabled: enabled, picking: false, highlights: 0, processed: 0 }));
  const sendMessage = vi.fn((_message: ExtensionMessage) => {
    const request = deferred(); requests.push(request); return request.promise;
  });
  vi.stubGlobal('chrome', { runtime: {
    id: 'textheat-test', sendMessage,
    onMessage: { addListener: vi.fn((listener: MessageListener) => { listeners.push(listener); }) }
  } });
  vi.stubGlobal('location', { hostname: 'example.com' });
  const addEventListener = vi.fn((type: string, listener: (event: LifecycleEvent) => void) => {
    const list = lifecycle.get(type) ?? []; list.push(listener); lifecycle.set(type, list);
  });
  vi.stubGlobal('addEventListener', addEventListener);
  return {
    requests, sendMessage, listeners, addEventListener, enabled: () => enabled,
    event(type: 'pageshow' | 'pagehide', persisted = false) {
      for (const listener of lifecycle.get(type) ?? []) listener({ persisted });
    },
    message(message: ExtensionMessage, sender: chrome.runtime.MessageSender = { id: 'textheat-test' }) {
      const respond = vi.fn();
      const result = listeners[0]!(message, sender, respond);
      return { result, respond };
    }
  };
}
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });
afterEach(async () => {
  await flush();
  delete (globalThis as typeof globalThis & { __textheatController?: unknown }).__textheatController;
  vi.unstubAllGlobals();
});

describe('content script lifecycle', () => {
  it('keeps duplicate injection a singleton and does not fetch again on normal pageshow', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    vi.resetModules();
    await import('../../extension/content/content');
    mock.event('pageshow');
    expect(controller.construct).toHaveBeenCalledTimes(1);
    expect(mock.listeners).toHaveLength(1);
    expect(mock.addEventListener.mock.calls.map(([type]) => type)).toEqual(['pagehide', 'pageshow']);
    expect(mock.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'GET_SETTINGS' });
    mock.requests[0]!.resolve(stored({}, { 'example.com': { enabled: true, threshold: 0.7 } }));
    await flush();
    expect(controller.configure).toHaveBeenCalledExactlyOnceWith({ ...defaults, mode: 'auto', threshold: 0.7 });
    expect(mock.enabled()).toBe(true);
  });

  it('does not let pending bootstrap settings override newer APPLY_SETTINGS', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    const settings = { ...defaults, threshold: 0.9 };
    expect(mock.message({ type: 'APPLY_SETTINGS', settings }).respond).toHaveBeenCalledWith({ ok: true, state: controller.state() });
    mock.requests[0]!.resolve(stored());
    await flush();
    expect(controller.configure).toHaveBeenCalledExactlyOnceWith(settings);
    expect(mock.enabled()).toBe(false);
  });

  it('restores persisted pages with validated hostname overrides', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    mock.requests[0]!.resolve(stored()); await flush();
    mock.event('pagehide', true);
    expect(mock.enabled()).toBe(false);
    mock.event('pageshow', true);
    expect(mock.sendMessage).toHaveBeenCalledTimes(2);
    mock.requests[1]!.resolve(stored({ threshold: 0.8 }, { 'example.com': { enabled: false, threshold: 0.6 } }));
    await flush();
    expect(controller.configure).toHaveBeenLastCalledWith({ ...defaults, mode: 'off', threshold: 0.6 });
    expect(mock.enabled()).toBe(false);
  });

  it('does not let persisted restore override newer APPLY_SETTINGS', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    mock.requests[0]!.resolve(stored()); await flush();
    mock.event('pagehide', true); mock.event('pageshow', true);
    const settings = { ...defaults, mode: 'manual' as const, threshold: 0.9 };
    mock.message({ type: 'APPLY_SETTINGS', settings });
    mock.requests[1]!.resolve(stored()); await flush();
    expect(controller.configure).toHaveBeenCalledTimes(2);
    expect(controller.configure).toHaveBeenLastCalledWith(settings);
  });

  it.each(['bootstrap', 'restore'] as const)('invalidates pending %s responses on pagehide and ignores messages while hidden', async phase => {
    const mock = setup();
    await import('../../extension/content/content');
    if (phase === 'restore') {
      mock.requests[0]!.resolve(stored()); await flush();
      mock.event('pagehide', true); mock.event('pageshow', true);
    }
    controller.configure.mockClear();
    mock.event('pagehide', true);
    for (const message of [
      { type: 'APPLY_SETTINGS', settings: { ...defaults, mode: 'auto' } },
      { type: 'PAGE_ACTION', action: 'TOGGLE_PAGE' }
    ] satisfies ExtensionMessage[]) expect(mock.message(message).respond).not.toHaveBeenCalled();
    mock.requests.at(-1)!.resolve(stored()); await flush();
    expect(controller.configure).not.toHaveBeenCalled();
    expect(controller.action).not.toHaveBeenCalled();
    expect(mock.enabled()).toBe(false);
  });

  it('keeps an old bootstrap stale even after the page becomes active again', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    mock.event('pagehide', true); mock.event('pageshow', true);
    mock.requests[1]!.resolve(stored({ threshold: 0.8 })); await flush();
    mock.requests[0]!.resolve(stored({ threshold: 0.1 })); await flush();
    expect(controller.configure).toHaveBeenCalledExactlyOnceWith({ ...defaults, mode: 'auto', threshold: 0.8 });
  });

  it.each(['bootstrap', 'restore'] as const)('stays safely off after rejected %s requests without retrying', async phase => {
    const mock = setup();
    await import('../../extension/content/content');
    if (phase === 'restore') {
      mock.requests[0]!.resolve(stored()); await flush();
      mock.event('pagehide', true); mock.event('pageshow', true);
    }
    controller.configure.mockClear();
    mock.requests.at(-1)!.reject(new Error('Extension context invalidated')); await flush();
    expect(controller.configure).not.toHaveBeenCalled();
    expect(mock.enabled()).toBe(false);
    expect(mock.sendMessage).toHaveBeenCalledTimes(phase === 'bootstrap' ? 1 : 2);
  });

  it('handles synchronous sendMessage errors safely', async () => {
    const mock = setup();
    mock.sendMessage.mockImplementation(() => { throw new Error('Extension context invalidated'); });
    await import('../../extension/content/content'); await flush();
    expect(mock.enabled()).toBe(false);
    expect(controller.destroy).toHaveBeenCalledTimes(1);
    expect(mock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['bootstrap', 'restore'] as const)('cleans up partial controller initialization on %s errors', async phase => {
    const mock = setup();
    await import('../../extension/content/content');
    if (phase === 'restore') {
      mock.requests[0]!.resolve(stored()); await flush();
      mock.event('pagehide', true); mock.event('pageshow', true);
    }
    const configure = controller.configure.getMockImplementation()!;
    controller.configure.mockImplementationOnce(settings => { configure(settings); throw new Error('Initialization failed'); });
    mock.requests.at(-1)!.resolve(stored()); await flush();
    expect(mock.enabled()).toBe(false);
    expect(controller.destroy).toHaveBeenCalledTimes(phase === 'bootstrap' ? 1 : 2);
  });

  it.each([
    { ok: false, error: 'Unavailable', ...{ stored: stored().stored } },
    { ok: true },
    stored({ threshold: NaN }),
    stored({}, { 'example.com': { enabled: true, threshold: 2 } })
  ])('does not configure invalid or unsuccessful restore responses %#', async response => {
    const mock = setup();
    await import('../../extension/content/content');
    mock.requests[0]!.resolve(stored()); await flush();
    mock.event('pagehide', true); mock.event('pageshow', true);
    controller.configure.mockClear();
    mock.requests[1]!.resolve(response); await flush();
    expect(controller.configure).not.toHaveBeenCalled();
    expect(mock.enabled()).toBe(false);
  });

  it('does not tear down newer applied settings when an old request rejects', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    mock.message({ type: 'APPLY_SETTINGS', settings: { ...defaults, mode: 'auto' } });
    mock.requests[0]!.reject(new Error('Unavailable')); await flush();
    expect(mock.enabled()).toBe(true);
    expect(controller.destroy).not.toHaveBeenCalled();
  });

  it('rejects foreign and missing sender IDs without responding or mutating state', async () => {
    const mock = setup();
    await import('../../extension/content/content');
    for (const sender of [{ id: 'foreign-extension' }, {}]) {
      for (const message of [
        { type: 'APPLY_SETTINGS', settings: { ...defaults, mode: 'auto' } },
        { type: 'PAGE_ACTION', action: 'TOGGLE_PAGE' },
        { type: 'GET_STATE' }
      ] satisfies ExtensionMessage[]) {
        const result = mock.message(message, sender);
        expect(result.result).toBe(false);
        expect(result.respond).not.toHaveBeenCalled();
      }
    }
    expect(controller.configure).not.toHaveBeenCalled();
    expect(controller.action).not.toHaveBeenCalled();
    expect(controller.state).not.toHaveBeenCalled();
    mock.requests[0]!.resolve(stored()); await flush();
    expect(mock.enabled()).toBe(true);
    expect(mock.message({ type: 'PAGE_ACTION', action: 'CLEAR_PAGE' }).respond).toHaveBeenCalledWith({ ok: true, state: controller.state() });
    expect(controller.action).toHaveBeenCalledWith('CLEAR_PAGE');
    expect(mock.message({ type: 'GET_STATE' }).respond).toHaveBeenCalledWith({ ok: true, state: controller.state() });
  });
});