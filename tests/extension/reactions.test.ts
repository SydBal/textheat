// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactionManager, reactionEmoji } from '../../src/extension/reactions';

let manager: ReactionManager;
let reduced = false;
let motionChanged: (() => void) | undefined;
const cancellations: ReturnType<typeof vi.fn>[] = [];
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const rect = (top = 30, left = 40) => ({ top, left, right: left + 60, bottom: top + 20, width: 60, height: 20 } as DOMRect);
function span(emotion?: string, sentiment = 'positive', top = 30) {
  const element = document.createElement('span');
  element.dataset.textheatExtension = 'highlight';
  element.dataset.textheatAnimationState = 'visible';
  element.dataset.sentiment = sentiment;
  if (emotion) element.dataset.emotion = emotion;
  element.textContent = 'wonderful';
  element.getBoundingClientRect = vi.fn(() => rect(top));
  document.querySelector('article')!.append(element);
  return element;
}
const host = () => document.querySelector<HTMLElement>('.textheat-extension-reactions');
const layers = () => [...(host()?.shadowRoot?.querySelectorAll<HTMLElement>('.anchor') ?? [])];
const badges = () => [...(host()?.shadowRoot?.querySelectorAll<HTMLElement>('.badge') ?? [])];
const particles = () => [...(host()?.shadowRoot?.querySelectorAll('.particle') ?? [])];
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; motionChanged = undefined; cancellations.length = 0;
  document.body.innerHTML = '<article></article>';
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, callback: () => void) => { motionChanged = callback; }, removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(16), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('Animation', class {});
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: vi.fn(() => {
    const cancel = vi.fn(); cancellations.push(cancel); return { cancel } as unknown as Animation;
  }) });
  manager = new ReactionManager(document, { emojiReactions: true, animate: true });
});
afterEach(() => {
  manager.destroy(); document.getSelection()!.removeAllRanges(); document.body.replaceChildren();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('isolated emoji reactions', () => {
  it('refreshes before an explicit first reveal without attaching or consuming its four particles', async () => {
    const source = span('joy');
    manager.refresh(); manager.requestRefresh();
    await vi.advanceTimersByTimeAsync(16);
    expect(host()).toBeNull(); expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    manager.reveal(source);
    expect(particles()).toHaveLength(4); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
  });
  it('keeps an offscreen first reveal available for a later visible burst', () => {
    const source = span('joy', 'positive', -100);
    manager.reveal(source); manager.refresh(); expect(host()).toBeNull();
    source.getBoundingClientRect = () => rect();
    manager.refresh(); expect(particles()).toHaveLength(4);
    manager.reveal(source); manager.reveal(source);
    expect(particles()).toHaveLength(4); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
  });
  it.each(['waiting', 'animating'])('does not consume unknown %s targets during configure transitions', state => {
    const source = span('joy'); source.dataset.textheatAnimationState = state;
    manager.configure({ emojiReactions: true, animate: true });
    manager.configure({ emojiReactions: false, animate: true });
    manager.configure({ emojiReactions: true, animate: true });
    manager.refresh(); expect(host()).toBeNull();
    source.dataset.textheatAnimationState = 'visible'; manager.refresh();
    expect(host()).toBeNull(); manager.reveal(source); expect(particles()).toHaveLength(4);
  });
  it('explicitly shows static text, settles active particles and never replays it', () => {
    const source = span('joy'); manager.showStatic(source);
    expect(badges()).toHaveLength(1); expect(badges()[0]!.hidden).toBe(false);
    manager.reveal(source); expect(particles()).toHaveLength(0);
    const fresh = span('anger'); manager.reveal(fresh); expect(particles()).toHaveLength(4);
    manager.showStatic(fresh); expect(particles()).toHaveLength(0);
    manager.refresh(); manager.reveal(fresh);
    expect(badges()).toHaveLength(2); expect(vi.getTimerCount()).toBe(0);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
  });
  it('remembers explicit static text even while disabled or offscreen', () => {
    manager.configure({ emojiReactions: false, animate: true });
    const source = span('joy', 'positive', -100); manager.showStatic(source);
    manager.configure({ emojiReactions: true, animate: true });
    source.getBoundingClientRect = () => rect(); manager.refresh(); manager.reveal(source);
    expect(badges()).toHaveLength(1); expect(particles()).toHaveLength(0);
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  });
  it('tracks existing geometry each frame for a bounded duration without scanning highlights', () => {
    const frames = new Map<number, FrameRequestCallback>(); let next = 0;
    vi.spyOn(window.performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const runFrame = (time: number) => {
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
    };
    const source = span('joy'); manager.showStatic(source);
    const unknown = span('fear');
    const scan = vi.spyOn(document, 'querySelectorAll');
    manager.trackFor(50); manager.trackFor(50); expect(frames.size).toBe(1);
    source.getBoundingClientRect = () => rect(100, 200); runFrame(16);
    expect(layers()[0]!.style.left).toBe('260px'); expect(layers()[0]!.style.top).toBe('92px');
    source.getBoundingClientRect = () => rect(120, 240); runFrame(32);
    expect(layers()[0]!.style.left).toBe('300px'); expect(layers()[0]!.style.top).toBe('112px');
    runFrame(64); expect(frames.size).toBe(0); expect(scan).not.toHaveBeenCalled();
    scan.mockRestore(); expect(layers()).toHaveLength(1);
    manager.reveal(unknown); expect(particles()).toHaveLength(4);
  });
  it.each(['destroy', 'disabled', 'no-animation', 'hidden', 'reduced'])('cancels tracking on %s', condition => {
    const request = vi.fn(() => 123), cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
    manager.showStatic(span('joy')); manager.trackFor(500);
    expect(request).toHaveBeenCalledOnce();
    if (condition === 'destroy') manager.destroy();
    if (condition === 'disabled') manager.configure({ emojiReactions: false, animate: true });
    if (condition === 'no-animation') manager.configure({ emojiReactions: true, animate: false });
    if (condition === 'hidden') {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
    }
    if (condition === 'reduced') { reduced = true; motionChanged!(); }
    expect(cancel).toHaveBeenCalledWith(123);
    const calls = request.mock.calls.length;
    manager.trackFor(500); expect(request).toHaveBeenCalledTimes(calls);
    manager.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not schedule tracking for invalid durations or retain frames without anchors', () => {
    let frame: FrameRequestCallback | undefined;
    const request = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('requestAnimationFrame', request);
    for (const duration of [0, -1, NaN, Infinity]) manager.trackFor(duration);
    expect(request).not.toHaveBeenCalled();
    manager.trackFor(500); frame!(16); expect(request).toHaveBeenCalledOnce();
  });
  it.each([
    ['joy', 'negative', '😊'], ['anger', 'positive', '😠'], ['sadness', 'positive', '😢'],
    ['fear', 'positive', '😰'], ['surprise', 'negative', '😮'], [undefined, 'positive', '👍'],
    [undefined, 'negative', '👎'], ['unknown', 'negative', '👎'], [undefined, 'neutral', '']
  ])('maps %s / %s to %s without reading source words', (emotion, polarity, expected) => {
    expect(reactionEmoji(span(emotion, polarity))).toBe(expected);
  });
  it('zooms the retained badge immediately alongside the narrow 1600ms particle burst', async () => {
    const source = span('joy'); manager.reveal(source);
    expect(particles().map(particle => particle.textContent)).toEqual(['🎉', '😊', '🎉', '😊']);
    expect(badges()).toHaveLength(1); expect(badges()[0]!.hidden).toBe(false);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls[4]![1]).toMatchObject({ duration: 360 });
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls[0]![1]).toMatchObject({ duration: 1600 });
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls[0]![0]).toEqual([
      { transform: 'translate(-50%, 0) scale(.65)', opacity: 0 },
      { transform: 'translate(calc(-50% + -9px), -24px) scale(1.1)', opacity: 1, offset: .4 },
      { transform: 'translate(calc(-50% + -18px), -32px) scale(.3)', opacity: 0 }
    ]);
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls[1]![0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: 'translate(calc(-50% + -3px), -34px) scale(1.1)' }),
      expect.objectContaining({ transform: 'translate(calc(-50% + -6px), -42px) scale(.3)' })
    ]));
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls[0]![0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ opacity: 0, transform: expect.stringContaining('scale(.3)') })
    ]));
    await vi.advanceTimersByTimeAsync(1599); expect(particles()).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(particles()).toHaveLength(0); expect(badges()[0]!.hidden).toBe(false);
    expect(badges()[0]!.textContent).toBe('😊'); expect(vi.getTimerCount()).toBe(0);
    expect(cancellations.slice(0, 4).every(cancel => cancel.mock.calls.length === 1)).toBe(true);
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls.at(-1)![0]).toEqual([
      { transform: 'translate(-50%,-25%) scale(0)', opacity: 0 },
      { transform: 'translate(-50%,-25%) scale(1)', opacity: 1 }
    ]);
    expect(vi.mocked(HTMLElement.prototype.animate).mock.calls.at(-1)![1]).toMatchObject({ duration: 360 });
  });
  it('never edits source markup, selection, copy payload, native fields or IME tree', async () => {
    const source = span('anger');
    document.querySelector('article')!.insertAdjacentHTML('beforeend', '<div contenteditable="true">editing</div><textarea>native</textarea>');
    const editor = document.querySelector('div')!, input = document.querySelector('textarea')!;
    editor.append(source);
    const range = document.createRange(); range.selectNodeContents(source);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const before = document.body.innerHTML, text = document.body.textContent;
    const anchor = selection.anchorNode, focus = selection.focusNode;
    let copied = '';
    const copy = () => { copied = selection.toString(); };
    document.addEventListener('copy', copy);
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    manager.reveal(source); await vi.advanceTimersByTimeAsync(1600);
    document.dispatchEvent(new Event('copy')); document.removeEventListener('copy', copy);
    expect(document.body.innerHTML).toBe(before); expect(document.body.textContent).toBe(text);
    expect(selection.anchorNode).toBe(anchor); expect(selection.focusNode).toBe(focus);
    expect(copied).toBe('wonderful'); expect(range.cloneContents().textContent).toBe('wonderful');
    expect(input.value).toBe('native'); expect(source.childNodes).toHaveLength(1);
    expect(source.querySelector('*')).toBeNull();
    expect(host()!.parentElement).toBe(document.documentElement);
    expect(host()!.dataset.textheatExtension).toBe('ui'); expect(host()!.getAttribute('aria-hidden')).toBe('true');
    expect(host()!.hasAttribute('inert')).toBe(true); expect(host()!.style.pointerEvents).toBe('none');
    expect(host()!.shadowRoot!.querySelector('style')!.textContent).toContain('pointer-events:none!important');
  });
  it('toggles on existing highlights as static and never rebursts on settings updates', async () => {
    manager.configure({ emojiReactions: false, animate: true });
    const source = span('joy'); manager.reveal(source); expect(host()).toBeNull();
    manager.configure({ emojiReactions: true, animate: true });
    expect(badges()).toHaveLength(1); expect(particles()).toHaveLength(0);
    manager.reveal(source); manager.configure({ emojiReactions: true, animate: true }); manager.reveal(source);
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    manager.configure({ emojiReactions: false, animate: true }); expect(host()).toBeNull();
    manager.configure({ emojiReactions: true, animate: true }); manager.reveal(source);
    expect(particles()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    // A newly revealed span still bursts after opting in.
    manager.reveal(span('surprise')); expect(particles()).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1600);
  });
  it('never repeats a burst after reveal callbacks, offscreen recycling or settings changes', async () => {
    const source = span('joy'); manager.reveal(source); manager.reveal(source);
    expect(particles()).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1600);
    source.getBoundingClientRect = () => rect(-100); manager.refresh(); expect(layers()).toHaveLength(0);
    source.getBoundingClientRect = () => rect(); manager.refresh(); manager.reveal(source);
    manager.configure({ emojiReactions: true, animate: true }); manager.reveal(source);
    expect(badges()).toHaveLength(1); expect(particles()).toHaveLength(0);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
  });
  it.each(['disabled', 'reduced', 'no-raf', 'no-animate'])('retains a static badge with %s animations', condition => {
    if (condition === 'disabled') manager.configure({ emojiReactions: true, animate: false });
    if (condition === 'reduced') reduced = true;
    if (condition === 'no-raf') vi.stubGlobal('requestAnimationFrame', undefined);
    if (condition === 'no-animate') Object.defineProperty(HTMLElement.prototype, 'animate', { value: undefined });
    manager.reveal(span('fear'));
    expect(badges()).toHaveLength(1); expect(badges()[0]!.hidden).toBe(false);
    expect(particles()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('settles immediately if OS reduced motion changes during a burst', () => {
    manager.reveal(span('fear')); expect(particles()).toHaveLength(4);
    reduced = true; motionChanged!();
    expect(particles()).toHaveLength(0); expect(badges()[0]!.hidden).toBe(false);
    expect(cancellations.every(cancel => cancel.mock.calls.length === 1)).toBe(true);
    manager.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans partial animation failures into one settled badge', () => {
    vi.mocked(HTMLElement.prototype.animate).mockImplementationOnce(() => { throw new Error('unsupported'); });
    manager.reveal(span('sadness'));
    expect(particles()).toHaveLength(0); expect(badges()[0]!.hidden).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds simultaneous bursts to 8 / 32 particles and visible anchors to 128', async () => {
    for (let index = 0; index < 200; index++) manager.reveal(span('joy'));
    expect(particles()).toHaveLength(32); expect(layers()).toHaveLength(128); expect(vi.getTimerCount()).toBe(8);
    expect((manager as unknown as { pending: Set<HTMLElement> }).pending.size).toBe(128);
    // Overflow past the pending cap is deferred unconsumed, not dropped.
    expect((manager as unknown as { deferred: Set<HTMLElement> }).deferred.size).toBe(64);
    for (let wave = 0; wave < 26; wave++) {
      await vi.advanceTimersByTimeAsync(1600);
      expect(particles().length).toBeLessThanOrEqual(32);
      expect(layers().length).toBeLessThanOrEqual(128);
    }
    expect(particles()).toHaveLength(0); expect(badges().filter(badge => !badge.hidden)).toHaveLength(128);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(200 * 5);
    expect((manager as unknown as { deferred: Set<HTMLElement> }).deferred.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retries deferred overflow on later passes without another reveal', async () => {
    const sources = Array.from({ length: 137 }, () => span('joy'));
    sources.forEach(source => manager.reveal(source));
    const state = manager as unknown as { pending: Set<HTMLElement>; deferred: Set<HTMLElement> };
    expect(state.pending.size).toBe(128); expect(state.deferred.size).toBe(1);
    expect(state.deferred.has(sources[136]!)).toBe(true);
    // No second reveal call: burst slots free over time and scroll refreshes
    // promote the deferred request until it bursts like any accepted request.
    for (let wave = 0; wave < 18; wave++) {
      await vi.advanceTimersByTimeAsync(1600);
      document.dispatchEvent(new Event('scroll'));
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(state.pending.size).toBe(0); expect(state.deferred.size).toBe(0);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(137 * 5);
    expect(particles()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('drains a second wave without another reveal and preserves active/queued/new targets across appearance settings', async () => {
    const sources = Array.from({ length: 16 }, () => span('joy'));
    sources.forEach(source => manager.reveal(source));
    const activeCancellations = [...cancellations];
    const fresh = span('fear');
    manager.configure({ emojiReactions: true, animate: true });
    expect(activeCancellations.every(cancel => !cancel.mock.calls.length)).toBe(true);
    manager.reveal(fresh);
    expect(particles()).toHaveLength(32); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(40);
    await vi.advanceTimersByTimeAsync(1600);
    expect(particles()).toHaveLength(32); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(80);
    await vi.advanceTimersByTimeAsync(1600);
    expect(particles()).toHaveLength(4); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(85);
    await vi.advanceTimersByTimeAsync(1600);
    sources.forEach(source => manager.reveal(source)); manager.reveal(fresh);
    expect(particles()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('starts an offscreen requested reveal on scroll even after appearance changes and highlight unobserve', async () => {
    const source = span('joy', 'positive', -100);
    source.dataset.textheatAnimationState = 'animating'; manager.reveal(source);
    manager.configure({ emojiReactions: true, animate: true });
    source.dataset.textheatAnimationState = 'visible';
    manager.configure({ emojiReactions: true, animate: true });
    expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    source.getBoundingClientRect = () => rect();
    document.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(16);
    expect(particles()).toHaveLength(4); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1600);
    document.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(16);
    expect(particles()).toHaveLength(0); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(5);
  });
  it('bounds offscreen references, prunes removed requests, and defers rejected overflow without consuming it', () => {
    const sources = Array.from({ length: 129 }, () => span('joy', 'positive', -100));
    sources.forEach(source => manager.reveal(source));
    const state = manager as unknown as { pending: Set<HTMLElement>; deferred: Set<HTMLElement> };
    expect(state.pending.size).toBe(128); expect(state.pending.has(sources[128]!)).toBe(false);
    expect(state.deferred.size).toBe(1); expect(state.deferred.has(sources[128]!)).toBe(true);
    expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    sources[0]!.remove(); manager.prune();
    // The freed slot promotes the deferred request into pending. It is still
    // offscreen, so nothing attaches or bursts, and it was never consumed.
    expect(state.pending.size).toBe(128); expect(state.pending.has(sources[128]!)).toBe(true);
    expect(state.deferred.size).toBe(0); expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    sources[128]!.getBoundingClientRect = () => rect(); manager.reveal(sources[128]!);
    expect(particles()).toHaveLength(4);
    manager.destroy(); expect(state.pending.size).toBe(0); expect(state.deferred.size).toBe(0);
    expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps an accepted request eligible when it scrolls offscreen while waiting for a slot', async () => {
    const sources = Array.from({ length: 9 }, () => span('joy'));
    sources.forEach(source => manager.reveal(source));
    sources[8]!.getBoundingClientRect = () => rect(-100); manager.refresh();
    await vi.advanceTimersByTimeAsync(1600); expect(particles()).toHaveLength(0);
    sources[8]!.getBoundingClientRect = () => rect(); manager.refresh();
    expect(particles()).toHaveLength(4); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(45);
  });
  it.each(['static', 'reset', 'removed', 'disabled', 'no-motion', 'reduced', 'destroy'])('cancels queued requests deterministically on %s', async condition => {
    const sources = Array.from({ length: 9 }, () => span('joy'));
    sources.forEach(source => manager.reveal(source));
    const queued = sources[8]!;
    if (condition === 'static') manager.showStatic(queued);
    if (condition === 'reset') manager.reset(queued);
    if (condition === 'removed') { queued.remove(); manager.prune(); }
    if (condition === 'disabled') manager.configure({ emojiReactions: false, animate: true });
    if (condition === 'no-motion') manager.configure({ emojiReactions: true, animate: false });
    if (condition === 'reduced') { reduced = true; motionChanged!(); }
    if (condition === 'destroy') manager.destroy();
    expect((manager as unknown as { pending: Set<HTMLElement> }).pending.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1600);
    expect(particles()).toHaveLength(0); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(40);
    if (condition === 'static' || condition === 'disabled' || condition === 'no-motion' || condition === 'reduced') {
      reduced = false; manager.configure({ emojiReactions: true, animate: true }); manager.reveal(queued);
      expect(particles()).toHaveLength(0);
    }
    if (condition === 'reset') { manager.reveal(queued); expect(particles()).toHaveLength(4); }
    manager.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it('drains slots freed by active cancellation/removal without requiring a timer', () => {
    const sources = Array.from({ length: 10 }, () => span('joy'));
    sources.forEach(source => manager.reveal(source));
    manager.reset(sources[0]!); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(45);
    sources[1]!.remove(); manager.prune(); expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(50);
    expect(particles()).toHaveLength(32); expect(vi.getTimerCount()).toBe(8);
  });
  it('iteratively drains queued partial animation failures without leaking slots, particles or timers', async () => {
    const sources = Array.from({ length: 32 }, () => span('joy'));
    sources.forEach(source => manager.reveal(source));
    let attempts = 0;
    vi.mocked(HTMLElement.prototype.animate).mockImplementation(() => {
      if (++attempts % 2 === 0) throw new Error('partial animation failure');
      const cancel = vi.fn(); cancellations.push(cancel); return { cancel } as unknown as Animation;
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(attempts).toBe(48); expect(particles()).toHaveLength(0); expect(badges()).toHaveLength(32);
    expect((manager as unknown as { pending: Set<HTMLElement> }).pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0); expect(cancellations.every(cancel => cancel.mock.calls.length === 1)).toBe(true);
    vi.mocked(HTMLElement.prototype.animate).mockImplementation(() => ({ cancel: vi.fn() } as unknown as Animation));
    manager.reveal(span('fear')); expect(particles()).toHaveLength(4);
  });
  it('recycles offscreen anchors and fills the cap with visible static reactions on scroll', async () => {
    manager.configure({ emojiReactions: false, animate: true });
    const sources = Array.from({ length: 150 }, () => span('joy'));
    manager.configure({ emojiReactions: true, animate: true }); expect(layers()).toHaveLength(128);
    for (const source of sources.slice(0, 100)) source.getBoundingClientRect = () => rect(-100);
    document.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(16);
    expect(layers()).toHaveLength(50); expect(particles()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    document.querySelector('article')!.replaceChildren(); manager.prune(); expect(layers()).toHaveLength(0);
  });
  it('prunes disconnected bursts immediately and cleans pending frames on disable/destroy', () => {
    const source = span('joy'); manager.reveal(source); source.remove(); manager.prune();
    expect(layers()).toHaveLength(0); expect(particles()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    manager.reveal(span('anger')); manager.requestRefresh();
    manager.configure({ emojiReactions: false, animate: true });
    expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    manager.configure({ emojiReactions: true, animate: true }); manager.reveal(span('joy')); manager.requestRefresh();
    manager.destroy(); expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    document.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize'));
    expect(vi.getTimerCount()).toBe(0); expect(host()).toBeNull();
  });
  it('throttles captured scroll/resize positioning and refreshes appearance without moving source', async () => {
    const source = span('joy'); manager.configure({ emojiReactions: true, animate: false });
    source.getBoundingClientRect = () => rect(100, 200);
    source.style.setProperty('--textheat-bg', '#123456');
    document.querySelector('article')!.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize'));
    expect(vi.getTimerCount()).toBe(1); await vi.advanceTimersByTimeAsync(16);
    expect(layers()[0]!.style.left).toBe('260px'); expect(layers()[0]!.style.top).toBe('92px');
    expect(badges()[0]!.style.background).toBe('transparent');
    expect(source.style.position).toBe(''); expect(vi.getTimerCount()).toBe(0);
  });
  it('excludes offscreen, hidden, manual-panel and native-control highlights', () => {
    manager.reveal(span('joy', 'positive', -100));
    const panelSpan = span('joy'), nativeSpan = span('joy'), hiddenSpan = span('joy');
    const panel = document.createElement('div'); panel.dataset.textheatExtension = 'ui'; panel.append(panelSpan); document.body.append(panel);
    const textarea = document.createElement('textarea'); textarea.append(nativeSpan); document.body.append(textarea);
    const hidden = document.createElement('p'); hidden.hidden = true; hidden.append(hiddenSpan); document.body.append(hidden);
    for (const source of [panelSpan, nativeSpan, hiddenSpan]) manager.reveal(source);
    expect(host()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});