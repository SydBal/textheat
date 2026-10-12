let nextId = 0;
/** Delegated, dismissible tooltip. Tap/click, hover and focus are supported. */
export function enhanceTooltips(root: Element): () => void {
  const doc = root.ownerDocument;
  const popup = doc.createElement('div');
  popup.id = `textheat-tooltip-${++nextId}`;
  popup.className = 'textheat-tooltip-popup';
  popup.setAttribute('role', 'tooltip');
  popup.hidden = true;
  doc.body.append(popup);
  root.classList.add('textheat-enhanced');
  let active: HTMLElement | null = null;
  let oldDescription: string | null = null;
  const hide = () => {
    if (active) {
      if (oldDescription === null) active.removeAttribute('aria-describedby');
      else active.setAttribute('aria-describedby', oldDescription);
    }
    active = null; popup.hidden = true;
  };
  const find = (event: Event): HTMLElement | null => {
    const target = event.target as Element | null;
    const match = target?.nodeType === 1 ? target.closest<HTMLElement>('[data-textheat-tooltip]') : null;
    return match && root.contains(match) ? match : null;
  };
  const position = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const width = doc.documentElement.clientWidth || 1024;
    const height = doc.documentElement.clientHeight || 768;
    popup.style.left = `${Math.max(8, Math.min(rect.left, width - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, rect.bottom + popup.offsetHeight + 12 > height ? rect.top - popup.offsetHeight - 8 : rect.bottom + 8)}px`;
  };
  const show = (event: Event) => {
    const target = find(event);
    if (!target) return;
    if (active !== target) {
      hide(); active = target; oldDescription = target.getAttribute('aria-describedby');
      target.setAttribute('aria-describedby', `${oldDescription ? oldDescription + ' ' : ''}${popup.id}`);
    }
    popup.textContent = target.getAttribute('data-textheat-tooltip');
    popup.hidden = false;
    position(target);
  };
  const leave = (event: Event) => {
    const related = (event as MouseEvent).relatedTarget as Node | null;
    if (related && (active?.contains(related) || popup.contains(related))) return;
    // Keep keyboard-focused content open until blur or Escape.
    if (active && doc.activeElement === active && event.type === 'pointerout') return;
    hide();
  };
  const key = (event: Event) => { if ((event as KeyboardEvent).key === 'Escape') hide(); };
  const reposition = () => { if (active) position(active); };
  const outside = (event: Event) => { if (!root.contains(event.target as Node) && !popup.contains(event.target as Node)) hide(); };
  const events: [EventTarget, string, EventListener][] = [
    [root, 'pointerover', show], [root, 'focusin', show], [root, 'click', show],
    [root, 'pointerout', leave], [root, 'focusout', leave], [popup, 'pointerleave', leave],
    [doc, 'keydown', key], [doc, 'click', outside], [doc, 'scroll', reposition]
  ];
  for (const [target, name, listener] of events) target.addEventListener(name, listener);
  return () => { hide(); for (const [target, name, listener] of events) target.removeEventListener(name, listener); popup.remove(); root.classList.remove('textheat-enhanced'); };
}