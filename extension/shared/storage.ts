import { defaults, validateSettings } from './settings';
import type { StoredSettings } from './settings';
export async function readStored(): Promise<StoredSettings> {
  const data = await chrome.storage.local.get(['settings', 'sites']);
  let settings;
  try { settings = validateSettings(data.settings); } catch { settings = structuredClone(defaults); }
  const sites = Object.create(null) as StoredSettings['sites'];
  if (data.sites && typeof data.sites === 'object') for (const [hostname, value] of Object.entries(data.sites)) {
    if (value && typeof value === 'object' && typeof value.enabled === 'boolean') {
      sites[hostname] = { enabled: value.enabled };
      if (typeof value.threshold === 'number' && Number.isFinite(value.threshold) && value.threshold >= 0 && value.threshold <= 1) sites[hostname]!.threshold = value.threshold;
    }
  }
  return { settings, sites };
}
export async function writeStored(stored: StoredSettings): Promise<void> {
  await chrome.storage.local.set(stored);
}