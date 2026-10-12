import { defaults, validateSettings } from '../shared/settings';
import type { ExtensionSettings, SiteSettings, StoredSettings } from '../shared/settings';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing settings control: ${id}`);
  return value as T;
}
const booleans = ['animate', 'showTooltips', 'emojiReactions', 'roundedCorners', 'respectReducedMotion', 'processCode', 'processEditable', 'debug'] as const;
let stored: StoredSettings = { settings: structuredClone(defaults), sites: {} };
let busy = true;
let saveWarning = '';
const feedback = element('feedback');
const form = element<HTMLFormElement>('settings-form');

async function request(message: ExtensionMessage): Promise<StoredSettings> {
  const response: ExtensionResponse = await chrome.runtime.sendMessage(message);
  if (!response?.ok || !response.stored) throw new Error(response?.error ?? 'Could not load or save settings.');
  saveWarning = response.error ?? '';
  return response.stored;
}

function lock(value: boolean): void {
  busy = value;
  element<HTMLFieldSetElement>('settings-controls').disabled = value;
  element<HTMLFieldSetElement>('site-controls').disabled = value;
  for (const button of element('site-list').querySelectorAll<HTMLButtonElement>('button')) button.disabled = value;
}

async function work(job: () => Promise<void>): Promise<void> {
  if (busy) return;
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const hostname = focused?.dataset.hostname;
  const siteAction = focused?.dataset.siteAction;
  lock(true);
  feedback.textContent = '';
  try { await job(); }
  catch (error) { feedback.textContent = error instanceof Error ? error.message : 'Could not save preferences.'; }
  finally {
    lock(false);
    // Restore only lost focus; never pull it back from a control the user moved to.
    if (document.activeElement === document.body) {
      const replacement = hostname && siteAction
        ? Array.from(element('site-list').querySelectorAll<HTMLButtonElement>('button'))
          .find(button => button.dataset.hostname === hostname && button.dataset.siteAction === siteAction)
        : focused;
      if (replacement?.isConnected) replacement.focus();
    }
  }
}

function customColors(): ExtensionSettings['customTheme'] {
  const raw: unknown = JSON.parse(element<HTMLTextAreaElement>('customTheme').value || '{}');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Custom colors must be a JSON object.');
  for (const colors of Object.values(raw)) {
    if (!colors || typeof colors !== 'object' || Array.isArray(colors)
      || typeof colors.background !== 'string' || typeof colors.color !== 'string') {
      throw new TypeError('Each category needs background and color strings in six-digit hex format.');
    }
  }
  // Validate before assigning any user-entered CSS colors to preview elements.
  return validateSettings({ ...defaults, customTheme: raw }).customTheme;
}

function preview(): void {
  const container = element('palette-preview');
  container.replaceChildren();
  element('custom-editor').hidden = element<HTMLSelectElement>('theme').value !== 'custom';
  if (element('custom-editor').hidden) {
    element('custom-status').textContent = '';
    element<HTMLTextAreaElement>('customTheme').removeAttribute('aria-invalid');
    return;
  }
  try {
    const colors = customColors();
    for (const [category, color] of Object.entries(colors)) {
      const chip = document.createElement('span');
      chip.textContent = category;
      chip.style.backgroundColor = color.background;
      chip.style.color = color.color;
      container.append(chip);
    }
    element('custom-status').textContent = Object.keys(colors).length ? 'Valid palette. Choose readable foreground/background pairs.' : 'No custom overrides — standard category colors will be used.';
    element<HTMLTextAreaElement>('customTheme').setAttribute('aria-invalid', 'false');
  } catch (error) {
    element('custom-status').textContent = error instanceof Error ? error.message : 'Invalid JSON colors.';
    element<HTMLTextAreaElement>('customTheme').setAttribute('aria-invalid', 'true');
  }
}

function fill(): void {
  const settings = stored.settings;
  document.documentElement.dataset.edges = settings.roundedCorners ? 'rounded' : 'sharp';
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) radio.checked = radio.value === settings.mode;
  element<HTMLInputElement>('threshold').value = String(settings.threshold);
  element<HTMLOutputElement>('threshold-value').value = settings.threshold.toFixed(2);
  element<HTMLSelectElement>('theme').value = settings.theme;
  element<HTMLTextAreaElement>('customTheme').value = JSON.stringify(settings.customTheme, null, 2);
  element<HTMLInputElement>('preloadPx').value = String(settings.preloadPx);
  for (const key of booleans) element<HTMLInputElement>(key).checked = settings[key];
  preview();
  renderSites();
}

function renderSites(): void {
  const list = element('site-list');
  list.replaceChildren();
  const entries = Object.entries(stored.sites).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = 'No saved site preferences. Your global settings apply everywhere you permit.';
    list.append(empty);
  }
  for (const [hostname, site] of entries) {
    const row = document.createElement('div');
    row.className = 'site-row';
    const info = document.createElement('div');
    info.className = 'site-info';
    const name = document.createElement('strong');
    name.textContent = hostname;
    const details = document.createElement('small');
    details.textContent = `${site.enabled ? 'Enabled' : 'Disabled'} · ${site.threshold === undefined ? 'global sensitivity' : `threshold ${site.threshold.toFixed(2)}`}`;
    info.append(name, details);
    const actions = document.createElement('div');
    actions.className = 'site-actions';
    for (const [label, siteAction, action] of [
      ['Edit', 'edit', () => {
        element<HTMLInputElement>('site-hostname').value = hostname;
        element<HTMLInputElement>('site-enabled').checked = site.enabled;
        element<HTMLInputElement>('site-threshold').value = site.threshold === undefined ? '' : String(site.threshold);
        element('site-hostname').focus();
      }],
      [site.enabled ? 'Disable' : 'Enable', 'toggle', () => { void saveSite(hostname, { ...site, enabled: !site.enabled }); }],
      ['Reset', 'reset', () => { void saveSite(hostname, { enabled: true }); }]
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = label;
      button.setAttribute('aria-label', `${label} ${hostname}`);
      button.dataset.hostname = hostname;
      button.dataset.siteAction = siteAction;
      button.disabled = busy;
      button.addEventListener('click', action);
      actions.append(button);
    }
    row.append(info, actions);
    list.append(row);
  }
}

function saveSite(hostname: string, settings: SiteSettings): Promise<void> {
  return work(async () => {
    stored = await request({ type: 'SAVE_SITE', hostname, settings });
    renderSites();
    feedback.textContent = saveWarning || `Site preferences saved for ${hostname}.`;
  });
}

async function permissionStatus(): Promise<boolean> {
  const granted = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
  element('permission-status').textContent = granted
    ? 'Website access granted. Auto can run on ordinary HTTP and HTTPS pages.'
    : 'Full website access is not granted. Enable Auto in the toolbar popup to request it.';
  return granted;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  void work(async () => {
    const mode = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value;
    if (mode === 'auto' && !await permissionStatus()) throw new Error('Open the textheat toolbar popup and select Auto to grant website access first. Nothing was saved.');
    const theme = element<HTMLSelectElement>('theme').value;
    const settings = validateSettings({
      ...stored.settings, mode,
      threshold: Number(element<HTMLInputElement>('threshold').value),
      theme,
      customTheme: theme === 'custom' ? customColors() : stored.settings.customTheme,
      preloadPx: Number(element<HTMLInputElement>('preloadPx').value),
      ...Object.fromEntries(booleans.map(key => [key, element<HTMLInputElement>(key).checked]))
    });
    stored = await request({ type: 'SAVE_SETTINGS', settings });
    fill();
    feedback.textContent = saveWarning || 'Preferences saved. Accessible open pages have been updated.';
  });
});

element<HTMLFormElement>('site-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!element<HTMLFormElement>('site-form').reportValidity()) return;
  const hostInput = element<HTMLInputElement>('site-hostname').value.trim();
  let hostname: string;
  try {
    if (/[\s/?#@\\]/.test(hostInput) || !hostInput
      || (hostInput.startsWith('[') ? !hostInput.endsWith(']') : hostInput.includes(':'))) throw new Error();
    const url = new URL(`https://${hostInput}/`);
    if (url.port || url.username || url.password) throw new Error();
    hostname = url.hostname;
  } catch { feedback.textContent = 'Enter a hostname such as example.com, without a URL, port, or path.'; return; }
  const settings: SiteSettings = { enabled: element<HTMLInputElement>('site-enabled').checked };
  const threshold = element<HTMLInputElement>('site-threshold').value;
  if (threshold !== '') settings.threshold = Number(threshold);
  void saveSite(hostname, settings);
});
element<HTMLInputElement>('threshold').addEventListener('input', () => {
  element<HTMLOutputElement>('threshold-value').value = Number(element<HTMLInputElement>('threshold').value).toFixed(2);
});
element<HTMLSelectElement>('theme').addEventListener('change', preview);
element<HTMLTextAreaElement>('customTheme').addEventListener('input', preview);

async function initialize(): Promise<void> {
  try {
    stored = await request({ type: 'GET_SETTINGS' });
    fill();
    await permissionStatus();
    feedback.textContent = '';
    lock(false);
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : 'Could not load preferences. Reopen settings to try again.';
  }
}
void initialize();