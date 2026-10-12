import { effectiveSettings, validateSettings } from '../shared/settings';
import type { ExtensionSettings, SiteSettings, StoredSettings } from '../shared/settings';
import type { ExtensionMessage, ExtensionResponse, PageAction } from '../shared/messages';
import { readStored, writeStored } from '../shared/storage';

const AUTO_SCRIPT = 'textheat-auto';
const SCRIPT = 'content/content.js';
const STYLES = 'content/styles.css';
// Short-lived UI intent, not a preference: a permission prompt can close its popup.
let autoIntentUntil = 0;
// Serialize read/modify/write AND reconciliation, including permission events.
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const next = pending.then(job, job);
  pending = next.catch(() => undefined);
  return next;
}

function httpURL(value?: string): URL | undefined {
  try {
    const url = new URL(value ?? '');
    return /^https?:$/.test(url.protocol) ? url : undefined;
  } catch { return undefined; }
}

const injections = new Map<number, Promise<void>>();
async function ensureContent(tabId: number): Promise<void> {
  const existing = injections.get(tabId);
  if (existing) return existing;
  const operation = (async () => {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' });
      if (result?.ok && result.state) return;
    } catch { /* No receiver yet. Browser permission checks remain authoritative. */ }
    await chrome.scripting.insertCSS({ target: { tabId }, files: [STYLES] });
    await chrome.scripting.executeScript({ target: { tabId }, files: [SCRIPT] });
  })();
  injections.set(tabId, operation);
  try { await operation; } finally { injections.delete(tabId); }
}

async function registerAuto(stored: StoredSettings): Promise<void> {
  const permissions = await chrome.permissions.getAll();
  const matches = [...new Set((permissions.origins ?? []).flatMap(origin =>
    origin === '<all_urls>' ? ['http://*/*', 'https://*/*'] : /^https?:\/\//.test(origin) ? [origin] : []
  ))].sort();
  const existing = (await chrome.scripting.getRegisteredContentScripts({ ids: [AUTO_SCRIPT] }))[0];
  if (stored.settings.mode !== 'auto' || !matches.length) {
    if (existing) await chrome.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT] });
    return;
  }
  if (existing && JSON.stringify([...(existing.matches ?? [])].sort()) === JSON.stringify(matches)) return;
  if (existing) await chrome.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT] });
  await chrome.scripting.registerContentScripts([{
    id: AUTO_SCRIPT, matches, js: [SCRIPT], css: [STYLES],
    runAt: 'document_idle', allFrames: false, persistAcrossSessions: true
  }]);
}

async function updateTabs(stored: StoredSettings): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async tab => {
    if (tab.id === undefined) return;
    const url = httpURL(tab.url);
    // A hidden URL is not evidence of access. Never inject, but an existing
    // controller can still be told to stop (for example after access is revoked).
    if (!url) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_SETTINGS', settings: { ...stored.settings, mode: 'off' } });
      } catch { /* No controller, or an internal page. */ }
      return;
    }
    const settings = effectiveSettings(stored, url.hostname);
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_SETTINGS', settings });
      if (response?.ok) return;
    } catch { /* Try a permitted injection below. */ }
    if (settings.mode === 'off') return;
    try {
      // executeScript/insertCSS enforce granted hosts or temporary activeTab access,
      // including protected HTTP pages such as the Chrome Web Store.
      await ensureContent(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_SETTINGS', settings });
    } catch { /* Restricted, closed, or navigated tabs are expected. */ }
  }));
}

async function reconcile(stored: StoredSettings): Promise<void> {
  // A registration error must never prevent Off from cleaning existing pages.
  try { await registerAuto(stored); }
  finally { await updateTabs(stored); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object');
  return value as Record<string, unknown>;
}

function settingsPatch(value: unknown): Partial<ExtensionSettings> {
  const input = object(value);
  const allowed = ['mode', 'threshold', 'animate', 'showTooltips', 'emojiReactions', 'roundedCorners', 'theme', 'customTheme',
    'respectReducedMotion', 'processCode', 'processEditable', 'preloadPx', 'debug'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new TypeError(`Unknown setting: ${key}`);
  if ('customTheme' in input) {
    for (const value of Object.values(object(input.customTheme))) {
      const colors = object(value);
      if (typeof colors.background !== 'string' || typeof colors.color !== 'string') throw new TypeError('Invalid custom colors');
    }
  }
  return input as Partial<ExtensionSettings>;
}

function sitePatch(host: unknown, value: unknown): { hostname: string; settings: SiteSettings } {
  if (typeof host !== 'string' || !host || host.length > 253 || /[\s/?#@\\]/.test(host)) throw new TypeError('Invalid hostname');
  const url = httpURL(`https://${host}/`);
  if (!url || url.hostname !== host.toLowerCase() || url.port || ['__proto__', 'constructor', 'prototype'].includes(host.toLowerCase())) {
    throw new TypeError('Use a hostname without a port or path');
  }
  const input = object(value);
  if (Object.keys(input).some(key => !['enabled', 'threshold'].includes(key)) || typeof input.enabled !== 'boolean') throw new TypeError('Invalid site settings');
  const settings: SiteSettings = { enabled: input.enabled };
  if ('threshold' in input) {
    if (typeof input.threshold !== 'number' || !Number.isFinite(input.threshold) || input.threshold < 0 || input.threshold > 1) throw new RangeError('Site threshold must be 0–1');
    settings.threshold = input.threshold;
  }
  return { hostname: url.hostname, settings };
}

async function handle(message: ExtensionMessage): Promise<ExtensionResponse> {
  const stored = await readStored();
  if (message.type === 'GET_SETTINGS') return { ok: true, stored };
  if (message.type === 'SAVE_SETTINGS') {
    stored.settings = validateSettings({ ...stored.settings, ...settingsPatch(message.settings) });
  } else if (message.type === 'SAVE_SITE') {
    const site = sitePatch(message.hostname, message.settings);
    // Define an own property even if storage originally returned a plain object.
    Object.defineProperty(stored.sites, site.hostname, { value: site.settings, enumerable: true, configurable: true, writable: true });
  } else return { ok: false, error: 'Unsupported background message' };
  await writeStored(stored);
  try { await reconcile(stored); }
  catch { return { ok: true, stored, error: 'Preferences saved, but automatic registration or open-page updates failed. Try reopening the extension.' }; }
  return { ok: true, stored };
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, respond) => {
  if (!message || !['GET_SETTINGS', 'SAVE_SETTINGS', 'SAVE_SITE', 'PREPARE_AUTO', 'CANCEL_AUTO'].includes(message.type)) return false;
  // Content scripts may bootstrap settings, but only extension UI may mutate them.
  // An options page opened as a full tab also has sender.tab. Authenticate its
  // browser-provided document URL rather than treating all tab senders as websites.
  let ownUI = false;
  try {
    const url = new URL(sender.url ?? '');
    ownUI = url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id
      && ['/options/options.html', '/popup/popup.html'].includes(url.pathname);
  } catch { /* Missing/malformed URL cannot authorize a tab-based writer. */ }
  if (sender.id !== chrome.runtime.id || (message.type !== 'GET_SETTINGS' && sender.tab && !ownUI)) {
    respond({ ok: false, error: 'Not authorized' });
    return false;
  }
  if (message.type === 'PREPARE_AUTO') {
    autoIntentUntil = Date.now() + 120000;
    respond({ ok: true });
    return false;
  }
  if (message.type === 'CANCEL_AUTO') {
    autoIntentUntil = 0;
    respond({ ok: true });
    return false;
  }
  if (message.type === 'SAVE_SETTINGS' && message.settings?.mode !== undefined) autoIntentUntil = 0;
  if (message.type === 'GET_SETTINGS') {
    // Never wait behind injection: a freshly injected controller may need this
    // bootstrap response before executeScript can finish. Only mutations need
    // the read/modify/write lock; the following APPLY_SETTINGS settles any race.
    void readStored().then(stored => respond({ ok: true, stored }), () => respond({ ok: false, error: 'Could not load settings' }));
    return true;
  }
  void serialize(() => handle(message)).then(respond, error => respond({
    ok: false, error: error instanceof Error ? error.message : 'Could not save settings'
  }));
  return true;
});

const actions: Record<string, PageAction> = {
  'toggle-page': 'TOGGLE_PAGE', 'pick-text': 'PICK_TEXT', 'check-selection': 'CHECK_SELECTION'
};
chrome.commands.onCommand.addListener(command => {
  const action = actions[command];
  if (!action) return;
  void serialize(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = httpURL(tab?.url);
    if (tab?.id === undefined || !url) return;
    const settings = effectiveSettings(await readStored(), url.hostname);
    if (settings.mode !== 'manual') return;
    await ensureContent(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_SETTINGS', settings });
    await chrome.tabs.sendMessage(tab.id, { type: 'PAGE_ACTION', action });
  }).catch(() => undefined);
});

function refresh(): void {
  void serialize(async () => reconcile(await readStored())).catch(() => undefined);
}
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.permissions.onAdded.addListener(() => {
  void serialize(async () => {
    const intent = autoIntentUntil;
    const permissions = intent > Date.now() ? await chrome.permissions.getAll() : undefined;
    const origins = permissions?.origins ?? [];
    if (intent && intent === autoIntentUntil && intent > Date.now()
      && (origins.includes('<all_urls>') || origins.includes('http://*/*') && origins.includes('https://*/*'))) {
      autoIntentUntil = 0;
      await handle({ type: 'SAVE_SETTINGS', settings: { mode: 'auto' } });
    } else await reconcile(await readStored());
  }).catch(() => undefined);
});
chrome.permissions.onRemoved.addListener(refresh);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.sites)) refresh();
});
// Also reconcile after a worker restart, not just a browser startup.
refresh();