import { defaults, effectiveSettings } from '../shared/settings';
import type { ExtensionSettings, Mode, StoredSettings } from '../shared/settings';
import type { ExtensionMessage, ExtensionResponse, PageAction } from '../shared/messages';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing popup control: ${id}`);
  return value as T;
}
let stored: StoredSettings = { settings: structuredClone(defaults), sites: {} };
let tabId: number | undefined;
let hostname = '';
let supported = false;
let busy = true;
let closed = false;
let stateRevision = 0;
let stateTimer: number | undefined;
const modes = [...document.querySelectorAll<HTMLInputElement>('input[name="mode"]')];
const feedback = element('feedback');
const status = element('page-status');

async function request(message: ExtensionMessage): Promise<ExtensionResponse> {
  const response: ExtensionResponse = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error ?? 'The extension could not respond. Try reopening the popup.');
  return response;
}

function lock(value: boolean): void {
  busy = value;
  document.querySelector('main')?.setAttribute('aria-busy', String(value));
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('main input, main select, main button')) control.disabled = value;
  element<HTMLInputElement>('site-enabled').disabled = value || !supported;
  for (const id of ['toggle-page', 'pick-text', 'check-selection', 'clear-page']) {
    element<HTMLButtonElement>(id).disabled = value || !supported || effectiveSettings(stored, hostname).mode !== 'manual';
  }
}

function render(): void {
  const settings = effectiveSettings(stored, hostname);
  for (const radio of modes) radio.checked = radio.value === stored.settings.mode;
  element('manual-panel').hidden = stored.settings.mode !== 'manual';
  element('mode-description').textContent = {
    off: 'No page text is processed. Existing highlights are removed.',
    auto: 'Emotional language appears as you read on permitted sites.',
    manual: 'Use a tool or keyboard shortcut. Nothing starts on its own.'
  }[stored.settings.mode];
  element<HTMLInputElement>('site-enabled').checked = stored.sites[hostname]?.enabled !== false;
  element<HTMLInputElement>('threshold').value = String(settings.threshold);
  element<HTMLOutputElement>('threshold-value').value = settings.threshold.toFixed(2);
  element('site-threshold-note').hidden = stored.sites[hostname]?.threshold === undefined;
  element<HTMLSelectElement>('theme').value = settings.theme;
  for (const key of ['animate', 'showTooltips', 'processCode', 'processEditable'] as const) element<HTMLInputElement>(key).checked = settings[key];
  lock(busy);
}

async function refreshState(): Promise<void> {
  const revision = ++stateRevision;
  if (!supported || tabId === undefined) {
    status.textContent = 'This page cannot be accessed. Open a normal HTTP or HTTPS webpage.';
    return;
  }
  const settings = effectiveSettings(stored, hostname);
  try {
    const result: ExtensionResponse = await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' }, { frameId: 0 });
    if (closed || revision !== stateRevision) return;
    if (!result?.ok || !result.state) throw new Error('No controller');
    const state = result.state;
    const next = state.mode === 'off' ? 'Off — no active highlighting.' : state.picking
      ? `${state.highlights} highlights · Click text to check it. Escape cancels.`
      : `${state.highlights} highlights · ${state.processed} processed${state.pageEnabled ? ' · page on' : ' · page off'}`;
    if (status.textContent !== next) status.textContent = next;
  } catch {
    if (closed || revision !== stateRevision) return;
    const next = settings.mode === 'off' ? 'Off — no page access needed.' : settings.mode === 'manual'
      ? 'Ready when you are. Choose a Manual tool to access this page.'
      : 'No page connection. This may be a protected page; try reloading a permitted site.';
    if (status.textContent !== next) status.textContent = next;
  }
}

function scheduleStateRefresh(): void {
  if (closed || !supported || tabId === undefined) return;
  // Only while this popup exists. Await each sample: no overlapping polling,
  // no page injection, analysis, settings writes, or background timer.
  stateTimer = window.setTimeout(async () => {
    stateTimer = undefined;
    if (closed) return;
    try { if (!busy) await refreshState(); }
    finally { scheduleStateRefresh(); }
  }, 500);
}
window.addEventListener('pagehide', () => {
  closed = true; stateRevision++;
  if (stateTimer !== undefined) window.clearTimeout(stateTimer);
}, { once: true });

async function save(message: ExtensionMessage): Promise<void> {
  const response = await request(message);
  if (response.stored) stored = response.stored;
  if (response.error) feedback.textContent = response.error;
  render();
  await refreshState();
}

async function work(job: () => Promise<void>): Promise<void> {
  if (busy) return;
  stateRevision++; // Ignore a pre-save count response that arrives afterward.
  lock(true);
  feedback.textContent = '';
  try { await job(); }
  catch (error) { feedback.textContent = error instanceof Error ? error.message : 'Could not complete this action.'; }
  finally { lock(false); render(); }
}

for (const radio of modes) radio.addEventListener('change', () => {
  if (!radio.checked || busy) return;
  const mode = radio.value as Mode;
  // Send the explicit intent BEFORE the dialog: its focus change can destroy
  // this popup and its awaited continuation. The worker finishes on onAdded.
  const prepared = mode === 'auto' ? request({ type: 'PREPARE_AUTO' }) : Promise.resolve({ ok: true });
  // Attach a handler immediately so a closed popup does not leave a rejection.
  void prepared.catch(() => undefined);
  // Request immediately inside the click/change gesture, before any awaited work.
  const permission = mode === 'auto'
    ? chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] })
    : Promise.resolve(true);
  void work(async () => {
    let granted: boolean;
    try { granted = await permission; await prepared; }
    catch (error) {
      if (mode === 'auto') await request({ type: 'CANCEL_AUTO' }).catch(() => undefined);
      throw error;
    }
    if (!granted) {
      await request({ type: 'CANCEL_AUTO' });
      feedback.textContent = 'Website access was not granted. Your previous mode is unchanged.';
      return;
    }
    await save({ type: 'SAVE_SETTINGS', settings: { mode } });
  });
});

element<HTMLInputElement>('threshold').addEventListener('input', event => {
  element<HTMLOutputElement>('threshold-value').value = Number((event.target as HTMLInputElement).value).toFixed(2);
});
element<HTMLInputElement>('threshold').addEventListener('change', () => {
  const threshold = Number(element<HTMLInputElement>('threshold').value);
  void work(() => stored.sites[hostname]?.threshold !== undefined
    ? save({ type: 'SAVE_SITE', hostname, settings: { enabled: stored.sites[hostname]!.enabled, threshold } })
    : save({ type: 'SAVE_SETTINGS', settings: { threshold } }));
});
element<HTMLSelectElement>('theme').addEventListener('change', () => {
  const theme = element<HTMLSelectElement>('theme').value as ExtensionSettings['theme'];
  void work(() => save({ type: 'SAVE_SETTINGS', settings: { theme } }));
});
for (const key of ['animate', 'showTooltips', 'processCode', 'processEditable'] as const) element<HTMLInputElement>(key).addEventListener('change', () => {
  const checked = element<HTMLInputElement>(key).checked;
  void work(() => save({ type: 'SAVE_SETTINGS', settings: { [key]: checked } }));
});
element<HTMLInputElement>('site-enabled').addEventListener('change', () => {
  const enabled = element<HTMLInputElement>('site-enabled').checked;
  void work(() => save({ type: 'SAVE_SITE', hostname, settings: { ...stored.sites[hostname], enabled } }));
});

async function pageAction(action: PageAction): Promise<void> {
  if (tabId === undefined || !supported || effectiveSettings(stored, hostname).mode !== 'manual') return;
  let connected = false;
  try {
    const response: ExtensionResponse = await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' });
    connected = !!(response?.ok && response.state);
  } catch { /* First explicit action grants temporary activeTab access. */ }
  if (!connected) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/styles.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
    } catch { throw new Error('This page does not allow extensions. Try a normal webpage instead.'); }
  }
  const applied: ExtensionResponse = await chrome.tabs.sendMessage(tabId, { type: 'APPLY_SETTINGS', settings: effectiveSettings(stored, hostname) });
  if (!applied?.ok) throw new Error(applied?.error ?? 'Could not apply page settings.');
  const response: ExtensionResponse = await chrome.tabs.sendMessage(tabId, { type: 'PAGE_ACTION', action });
  if (!response?.ok) throw new Error(response?.error ?? 'Could not check this page.');
  await refreshState();
  if (action === 'PICK_TEXT') window.close();
}
for (const [id, action] of Object.entries({
  'toggle-page': 'TOGGLE_PAGE', 'pick-text': 'PICK_TEXT', 'check-selection': 'CHECK_SELECTION', 'clear-page': 'CLEAR_PAGE'
} as const)) element(id).addEventListener('click', () => { void work(() => pageAction(action)); });
element('options').addEventListener('click', () => { void chrome.runtime.openOptionsPage().catch(() => { feedback.textContent = 'Could not open settings.'; }); });

async function initialize(): Promise<void> {
  lock(true);
  try {
    const [response, tabs, commands] = await Promise.all([
      request({ type: 'GET_SETTINGS' }), chrome.tabs.query({ active: true, currentWindow: true }), chrome.commands.getAll()
    ]);
    if (response.stored) stored = response.stored;
    const tab = tabs[0];
    tabId = tab?.id;
    try {
      const url = new URL(tab?.url ?? '');
      supported = /^https?:$/.test(url.protocol);
      if (supported) hostname = url.hostname;
    } catch { /* Browser-internal pages need no injection. */ }
    element('hostname').textContent = hostname || 'Unavailable page';
    element('hostname').title = hostname;
    for (const command of commands) {
      const label = document.getElementById(`shortcut-${command.name}`);
      if (label) label.textContent = command.shortcut || 'Not assigned';
    }
    render();
    await refreshState();
    lock(false);
    scheduleStateRefresh();
  } catch (error) {
    status.textContent = 'Could not load extension settings.';
    feedback.textContent = error instanceof Error ? error.message : 'Reopen the popup to try again.';
  }
}
void initialize();