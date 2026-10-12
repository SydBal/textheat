import type { ExtensionSettings } from '../../extension/shared/settings';
const excluded = 'script,style,noscript,template,textarea,input,select,option,button,svg,math,canvas,iframe,[data-textheat-extension], [hidden], [inert], [aria-hidden="true"]';
/** Resolve actual inherited editing state, including invalid/inherited attributes. */
export function editingRoot(element: Element): Element | undefined {
  let root: Element | undefined;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const value = current.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return root;
    if (value === '' || value === 'true' || value === 'plaintext-only') root = current;
  }
  return element.ownerDocument.designMode?.toLowerCase() === 'on' ? element.ownerDocument.body : root;
}
/** Native fields are read-only analysis sources, never inline rendering targets. */
export function eligibleField(element: Element, settings: ExtensionSettings): element is HTMLInputElement | HTMLTextAreaElement {
  if (!settings.processEditable || !element.matches('input,textarea')) return false;
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  if (field.matches(':disabled') || element.localName === 'input' && !['text', 'search', 'email', 'url', 'tel'].includes((field as HTMLInputElement).type)) return false;
  return eligibleElement(element, settings, true);
}
export function eligibleElement(element: Element, settings: ExtensionSettings, nativeField = false): boolean {
  const blocked = nativeField ? excluded.replace('textarea,input,', '') : excluded;
  if (!element.isConnected || element.closest(blocked) || !settings.processCode && element.closest('code,pre')) return false;
  if (!settings.processEditable && (element.ownerDocument.designMode?.toLowerCase() === 'on' || editingRoot(element))) return false;
  const win = element.ownerDocument.defaultView;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = win?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.contentVisibility === 'hidden') return false;
  }
  // Closed details expose only their summary, even if descendants report default styles.
  const details = element.closest('details:not([open])');
  if (details && !element.closest('summary')) return false;
  return true;
}
export function eligibleText(node: Text, settings: ExtensionSettings): boolean {
  return !!node.parentElement && /\S/u.test(node.data) && eligibleElement(node.parentElement, settings);
}