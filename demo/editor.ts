import { ReactionManager } from '../src/extension/reactions';

/** One native textarea, with a non-interactive highlighted mirror in the same box.
 * The textarea owns selection, caret, undo, paste, and composition; never replace it.
 */
export function connectEditor(input: HTMLTextAreaElement, output: HTMLElement): { sync: () => void; destroy: () => void } {
  const doc = input.ownerDocument;
  const checkbox = doc.querySelector<HTMLInputElement>('#hero-emoji');
  let reactions: ReactionManager | undefined;
  let previous = new Map<string, number>();
  const signature = (span: HTMLElement) => `${span.textContent}\u0000${span.dataset.emotion ?? span.dataset.sentiment}`;
  const syncScroll = () => { output.scrollTop = input.scrollTop; output.scrollLeft = input.scrollLeft; reactions?.requestRefresh(); };
  const sync = () => {
    // Mirror is not a second accessible editor or a collection of keyboard stops.
    for (const span of output.querySelectorAll('[tabindex]')) span.removeAttribute('tabindex');
    // A final newline needs an empty final line in the visual mirror (no text added).
    output.classList.toggle('ends-with-newline', input.value.endsWith('\n'));
    syncScroll();
    const remaining = new Map(previous);
    const next = new Map<string, number>();
    reactions?.prune();
    for (const span of output.querySelectorAll<HTMLElement>('.textheat-highlight')) {
      const key = signature(span), count = remaining.get(key) ?? 0;
      next.set(key, (next.get(key) ?? 0) + 1);
      if (count) { remaining.set(key, count - 1); reactions?.showStatic(span); }
      else reactions?.reveal(span);
    }
    previous = next;
  };
  const toggle = () => {
    reactions?.destroy(); reactions = undefined;
    if (checkbox?.checked) {
      // Mirror is intentionally aria-hidden; emojis never become editor text.
      reactions = new ReactionManager(doc, { emojiReactions: true, animate: true }, '#output .textheat-highlight', true);
      for (const span of output.querySelectorAll<HTMLElement>('.textheat-highlight')) reactions.showStatic(span);
    }
  };
  checkbox?.addEventListener('change', toggle);
  let hovered: HTMLElement | undefined;
  const leave = () => {
    hovered?.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })); hovered = undefined;
  };
  const hover = (event: MouseEvent) => {
    // Pointer stays on the real editor. Forward hover only, never clicks/focus,
    // so explanations cannot steal the native caret or interfere with editing.
    if (event.buttons || doc.getSelection()?.toString()) { leave(); return; }
    const match = [...output.querySelectorAll<HTMLElement>('[data-textheat-tooltip]')].find(span => [...span.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
    if (match === hovered) return;
    leave(); hovered = match;
    hovered?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  };
  input.addEventListener('scroll', syncScroll);
  input.addEventListener('pointermove', hover);
  input.addEventListener('pointerleave', leave);
  input.addEventListener('input', leave);
  input.addEventListener('keydown', leave);
  input.addEventListener('pointerdown', leave);
  return { sync, destroy: () => {
    reactions?.destroy(); reactions = undefined; checkbox?.removeEventListener('change', toggle);
    leave(); input.removeEventListener('scroll', syncScroll);
    input.removeEventListener('pointermove', hover); input.removeEventListener('pointerleave', leave);
    input.removeEventListener('input', leave); input.removeEventListener('keydown', leave); input.removeEventListener('pointerdown', leave);
  } };
}