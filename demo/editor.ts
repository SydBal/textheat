/** One native textarea, with a non-interactive highlighted mirror in the same box.
 * The textarea owns selection, caret, undo, paste, and composition; never replace it.
 */
export function connectEditor(input: HTMLTextAreaElement, output: HTMLElement): { sync: () => void; destroy: () => void } {
  const doc = input.ownerDocument;
  const syncScroll = () => { output.scrollTop = input.scrollTop; output.scrollLeft = input.scrollLeft; };
  const sync = () => {
    // Mirror is not a second accessible editor or a collection of keyboard stops.
    for (const span of output.querySelectorAll('[tabindex]')) span.removeAttribute('tabindex');
    // A final newline needs an empty final line in the visual mirror (no text added).
    output.classList.toggle('ends-with-newline', input.value.endsWith('\n'));
    syncScroll();
  };
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
    leave(); input.removeEventListener('scroll', syncScroll);
    input.removeEventListener('pointermove', hover); input.removeEventListener('pointerleave', leave);
    input.removeEventListener('input', leave); input.removeEventListener('keydown', leave); input.removeEventListener('pointerdown', leave);
  } };
}