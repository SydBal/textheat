import { PageController } from '../../src/extension/controller';
import { effectiveSettings, validateSettings } from '../shared/settings';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';
const scope = globalThis as typeof globalThis & { __textheatController?: PageController };
if (!scope.__textheatController) {
  const controller = new PageController(); scope.__textheatController = controller;
  let revision = 0;
  let active = true;
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !active) return false;
    try {
      if (message.type === 'APPLY_SETTINGS') { revision++; controller.configure(message.settings); }
      else if (message.type === 'PAGE_ACTION') controller.action(message.action);
      else if (message.type !== 'GET_STATE') return false;
      respond({ ok: true, state: controller.state() } satisfies ExtensionResponse);
    } catch { respond({ ok: false, error: 'Page settings could not be applied.' }); }
    return false;
  });
  async function restoreSettings(): Promise<void> {
    const requestRevision = ++revision;
    try {
      const response: ExtensionResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!active || requestRevision !== revision) return;
      if (!response.ok || !response.stored) { controller.destroy(); return; }
      controller.configure(validateSettings(effectiveSettings(response.stored, location.hostname)));
    } catch {
      // Also clean up a partially initialized controller, but never a newer settings update.
      if (active && requestRevision === revision) controller.destroy();
    }
  }
  void restoreSettings();
  addEventListener('pagehide', () => {
    active = false;
    revision++;
    controller.destroy();
  });
  addEventListener('pageshow', event => {
    if (!(event as PageTransitionEvent).persisted) return;
    active = true;
    void restoreSettings();
  });
}