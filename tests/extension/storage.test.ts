import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../extension/shared/settings';
import type { StoredSettings } from '../../extension/shared/settings';
import { readStored, writeStored } from '../../extension/shared/storage';
afterEach(() => vi.unstubAllGlobals());
function storage(initial: Record<string, unknown> = {}) {
  let data = structuredClone(initial);
  const api = {
    sync: {
      get: vi.fn(async () => ({ settings: { ...defaults, mode: 'auto' }, sites: { 'old.example': { enabled: false } } })),
      set: vi.fn(async (_stored: StoredSettings) => undefined)
    },
    local: {
      get: vi.fn(async (_keys: string[]) => structuredClone(data)),
      set: vi.fn(async (stored: StoredSettings) => { data = { ...data, ...structuredClone(stored) }; })
    }
  };
  vi.stubGlobal('chrome', { storage: api });
  return api;
}
describe('local-only extension storage', () => {
  it('roundtrips settings and site preferences locally without accessing sync', async () => {
    const api = storage();
    const stored: StoredSettings = {
      settings: { ...defaults, mode: 'manual', threshold: 0.7, theme: 'custom', animate: false,
        customTheme: { positive: { background: '#d1fae5', color: '#065f46' } } },
      sites: { 'example.com': { enabled: false }, 'other.example': { enabled: true, threshold: 0 } }
    };
    await writeStored(stored);
    expect(await readStored()).toEqual(stored);
    expect(api.local.get).toHaveBeenCalledWith(['settings', 'sites']);
    expect(api.local.set).toHaveBeenCalledExactlyOnceWith(stored);
    stored.settings.mode = 'off';
    stored.sites['other.example'] = { enabled: true, threshold: 1 };
    await writeStored(stored);
    expect(await readStored()).toEqual(stored);
    expect(api.sync.get).not.toHaveBeenCalled();
    expect(api.sync.set).not.toHaveBeenCalled();
  });

  it('uses defaults when local storage is empty, ignoring old synchronized settings', async () => {
    const api = storage();
    expect(await readStored()).toEqual({ settings: defaults, sites: {} });
    expect(api.sync.get).not.toHaveBeenCalled();
    expect(api.sync.set).not.toHaveBeenCalled();
  });

  it('preserves local validation and safe site parsing regardless of the old fallback marker', async () => {
    const api = storage({ storageFallback: false, settings: { ...defaults, threshold: 2 }, sites: {
      'example.com': { enabled: false, threshold: 0.5, ignored: true },
      'bad.example': { enabled: 'yes' },
      'invalid-threshold.example': { enabled: true, threshold: 2 },
      'nan.example': { enabled: true, threshold: NaN },
      'infinite.example': { enabled: true, threshold: Infinity },
      'string.example': { enabled: true, threshold: '0.5' },
      '__proto__': null
    } });
    const stored = await readStored();
    expect(stored.settings).toEqual(defaults);
    expect(Object.getPrototypeOf(stored.sites)).toBeNull();
    expect(stored.sites).toEqual({
      'example.com': { enabled: false, threshold: 0.5 },
      'invalid-threshold.example': { enabled: true },
      'nan.example': { enabled: true },
      'infinite.example': { enabled: true },
      'string.example': { enabled: true }
    });
    expect(api.sync.get).not.toHaveBeenCalled();
    expect(api.sync.set).not.toHaveBeenCalled();
  });

  it('propagates local storage failures instead of falling back to sync', async () => {
    const api = storage();
    api.local.get.mockRejectedValueOnce(new Error('Local read failed'));
    await expect(readStored()).rejects.toThrow('Local read failed');
    api.local.set.mockRejectedValueOnce(new Error('Local write failed'));
    await expect(writeStored({ settings: defaults, sites: {} })).rejects.toThrow('Local write failed');
    expect(api.sync.get).not.toHaveBeenCalled();
    expect(api.sync.set).not.toHaveBeenCalled();
  });
});