import type { ExtensionSettings } from '../../extension/shared/settings';
const excluded = 'script,style,noscript,template,textarea,input,select,option,button,svg,math,canvas,iframe,[data-textheat-extension], [hidden], [inert], [aria-hidden="true"]';
export function eligibleElement(element: Element, settings: ExtensionSettings): boolean {
  if (element.ownerDocument.designMode?.toLowerCase() === 'on' || !element.isConnected || element.closest(excluded) || !settings.processCode && element.closest('code,pre')) return false;
  const editable = element.closest('[contenteditable]');
  if (editable && editable.getAttribute('contenteditable')?.toLowerCase() !== 'false') return false;
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