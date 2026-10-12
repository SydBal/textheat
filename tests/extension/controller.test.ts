// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze } from 'textheat';
import { PageController } from '../../src/extension/controller';
import { ReactionManager } from '../../src/extension/reactions';
import { defaults } from '../../extension/shared/settings';

class Observer {
  static instances: Observer[] = [];
  targets = new Set<Element>();
  disconnected = false;
  constructor(private callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) { Observer.instances.push(this); }
  observe = (element: Element) => this.targets.add(element);
  unobserve = (element: Element) => this.targets.delete(element);
  disconnect = () => { this.targets.clear(); this.disconnected = true; };
  trigger(element: Element, visible = true) {
    this.callback([{ target: element, isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  all() { for (const element of [...this.targets]) this.trigger(element); }
}
let controller: PageController;
async function work() { await vi.advanceTimersByTimeAsync(100); }
async function visible() { await work(); Observer.instances.at(-2)!.all(); await work(); Observer.instances.at(-1)!.all(); await work(); }
const highlights = () => Array.from(document.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]'));
beforeEach(() => {
  vi.useFakeTimers(); Observer.instances = [];
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  document.body.innerHTML = '<article><h1>Amazing product</h1><p id="review">I love this wonderful product, but the service is terrible. 🧡</p></article>';
  document.getSelection()!.removeAllRanges();
  controller = new PageController(document);
});
afterEach(() => { controller.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('progressive extension controller', () => {
  it('bursts newly inserted text only on actual reveal after refresh and appearance updates, without replaying unchanged text', async () => {
    document.body.innerHTML = '<article><p>wonderful</p></article>';
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 30, left: 40, right: 100, bottom: 50, width: 60, height: 20 } as DOMRect);
    const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const settings = { ...defaults, mode: 'auto' as const, emojiReactions: true };
      controller.configure(settings); await visible(); await vi.advanceTimersByTimeAsync(1600);
      const original = highlights()[0]!; expect(animate).toHaveBeenCalledTimes(5);
      const paragraph = document.createElement('p'); paragraph.textContent = 'terrible';
      document.querySelector('article')!.append(paragraph);
      await work(); Observer.instances[0]!.trigger(paragraph); await work();
      const fresh = paragraph.querySelector<HTMLElement>('[data-textheat-extension="highlight"]')!;
      expect(fresh.dataset.textheatAnimationState).toBe('waiting');
      controller.configure({ ...settings, theme: 'dark' });
      document.dispatchEvent(new Event('scroll')); await work();
      const overlay = document.querySelector('.textheat-extension-reactions')!.shadowRoot!;
      expect(overlay.querySelectorAll('.badge')).toHaveLength(1);
      expect(animate).toHaveBeenCalledTimes(5);
      Observer.instances[1]!.trigger(fresh);
      expect(overlay.querySelectorAll('.particle')).toHaveLength(4);
      expect(animate).toHaveBeenCalledTimes(10);
      await work(); Observer.instances[1]!.trigger(fresh); Observer.instances[1]!.trigger(original);
      Observer.instances[0]!.all(); await work();
      expect(highlights()[0]).toBe(original); expect(animate).toHaveBeenCalledTimes(10);
      await vi.advanceTimersByTimeAsync(1600); expect(overlay.querySelectorAll('.particle')).toHaveLength(0);
      controller.destroy(); expect(vi.getTimerCount()).toBe(0);
    } finally {
      geometry.mockRestore();
      if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
  it('preserves capped bursts through appearance updates and drains the second wave after highlight unobserve', async () => {
    document.body.innerHTML = `<article>${'<p>wonderful</p>'.repeat(9)}</article>`;
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 30, left: 40, right: 100, bottom: 50, width: 60, height: 20 } as DOMRect);
    const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const settings = { ...defaults, mode: 'auto' as const, emojiReactions: true };
      controller.configure(settings); await visible();
      const overlay = document.querySelector('.textheat-extension-reactions')!.shadowRoot!;
      expect(highlights()).toHaveLength(9); expect(Observer.instances[1]!.targets.size).toBe(0);
      expect(overlay.querySelectorAll('.particle')).toHaveLength(32); expect(animate).toHaveBeenCalledTimes(40);
      controller.configure({ ...settings, theme: 'dark', showTooltips: false });
      expect(overlay.querySelectorAll('.particle')).toHaveLength(32); expect(animate).toHaveBeenCalledTimes(40);
      await vi.advanceTimersByTimeAsync(1600);
      expect(overlay.querySelectorAll('.particle')).toHaveLength(4); expect(animate).toHaveBeenCalledTimes(45);
      await vi.advanceTimersByTimeAsync(1600);
      expect(overlay.querySelectorAll('.particle')).toHaveLength(0); expect(overlay.querySelectorAll('.badge')).toHaveLength(9);
      controller.destroy(); expect(vi.getTimerCount()).toBe(0);
    } finally {
      geometry.mockRestore();
      if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
  it('keeps an offscreen reaction requested by the highlight observer eligible after unobserve until scroll', async () => {
    document.body.innerHTML = '<article><p>wonderful</p></article>';
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: -100, left: 40, right: 100, bottom: -80, width: 60, height: 20 } as DOMRect);
    const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const settings = { ...defaults, mode: 'auto' as const, emojiReactions: true };
      controller.configure(settings); await visible();
      expect(Observer.instances[1]!.targets.size).toBe(0);
      expect(highlights()[0]!.dataset.textheatAnimationState).toBe('visible');
      controller.configure({ ...settings, theme: 'dark' }); await work();
      expect(document.querySelector('.textheat-extension-reactions')).toBeNull(); expect(animate).not.toHaveBeenCalled();
      geometry.mockReturnValue({ top: 30, left: 40, right: 100, bottom: 50, width: 60, height: 20 } as DOMRect);
      document.dispatchEvent(new Event('scroll')); await work();
      const overlay = document.querySelector('.textheat-extension-reactions')!.shadowRoot!;
      expect(overlay.querySelectorAll('.particle')).toHaveLength(4); expect(animate).toHaveBeenCalledTimes(5);
      await vi.advanceTimersByTimeAsync(1600);
      document.dispatchEvent(new Event('scroll')); await work();
      expect(overlay.querySelectorAll('.particle')).toHaveLength(0); expect(animate).toHaveBeenCalledTimes(5);
      controller.destroy(); expect(vi.getTimerCount()).toBe(0);
    } finally {
      geometry.mockRestore();
      if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
  it.each([true, false])('uses explicit static registration only for synchronous rebuilds (animate=%s)', async animate => {
    document.body.innerHTML = '<p>wonderful</p>';
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 30, left: 40, right: 100, bottom: 50, width: 60, height: 20 } as DOMRect);
    const showStatic = vi.spyOn(ReactionManager.prototype, 'showStatic');
    const reveal = vi.spyOn(ReactionManager.prototype, 'reveal');
    try {
      const settings = { ...defaults, mode: 'auto' as const, emojiReactions: true, animate };
      controller.configure(settings); await visible();
      expect(reveal).toHaveBeenCalled(); expect(showStatic).not.toHaveBeenCalled();
      const original = highlights()[0]!; reveal.mockClear();
      controller.configure({ ...settings, threshold: .1 });
      const rebuilt = highlights()[0]!;
      expect(rebuilt).not.toBe(original); expect(rebuilt.dataset.textheatAnimationState).toBe('visible');
      expect(showStatic).toHaveBeenCalledWith(rebuilt); expect(reveal).not.toHaveBeenCalled();
      const overlay = document.querySelector('.textheat-extension-reactions')!.shadowRoot!;
      expect(overlay.querySelectorAll('.badge')).toHaveLength(1);
      expect(overlay.querySelectorAll('.particle')).toHaveLength(0);
    } finally { geometry.mockRestore(); showStatic.mockRestore(); reveal.mockRestore(); }
  });
  it('opts into static existing reactions without changing highlights or selection, and cleans on Off', async () => {
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 30, left: 40, right: 100, bottom: 50, width: 60, height: 20 } as DOMRect);
    try {
      const settings = { ...defaults, mode: 'auto' as const };
      controller.configure(settings); await visible();
      expect(document.querySelector('.textheat-extension-reactions')).toBeNull();
      const spans = highlights(), source = document.querySelector('article')!, html = source.innerHTML;
      const selection = document.getSelection()!, range = document.createRange();
      range.selectNodeContents(spans[0]!); selection.addRange(range);
      const selected = selection.toString(), anchor = selection.anchorNode;
      controller.configure({ ...settings, emojiReactions: true });
      const host = document.querySelector('.textheat-extension-reactions')!;
      expect(host.shadowRoot!.querySelectorAll('.badge')).toHaveLength(spans.length);
      expect(host.shadowRoot!.querySelectorAll('.particle')).toHaveLength(0);
      expect(source.innerHTML).toBe(html); expect(highlights()).toEqual(spans);
      expect(selection.toString()).toBe(selected); expect(selection.anchorNode).toBe(anchor);
      controller.configure({ ...settings, emojiReactions: true, theme: 'dark' });
      expect(host.shadowRoot!.querySelectorAll('.particle')).toHaveLength(0);
      expect((host.shadowRoot!.querySelector('.badge') as HTMLElement).style.background).toBe('transparent');
      controller.configure({ ...settings, emojiReactions: true, threshold: .9 });
      expect(host.shadowRoot!.querySelectorAll('.badge')).toHaveLength(highlights().length);
      expect(host.shadowRoot!.querySelectorAll('.particle')).toHaveLength(0);
      controller.configure({ ...settings, emojiReactions: true, mode: 'off' }); await work();
      expect(document.querySelector('.textheat-extension-reactions')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    } finally { geometry.mockRestore(); }
  });
  it('bursts only new revealed spans and ignores respectReducedMotion opt-out for emoji accessibility', async () => {
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 30, left: 40, right: 100, bottom: 50, width: 60, height: 20 } as DOMRect);
    const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const settings = { ...defaults, mode: 'auto' as const, emojiReactions: true, respectReducedMotion: false };
      controller.configure(settings); await visible();
      const host = document.querySelector('.textheat-extension-reactions')!;
      expect(host.shadowRoot!.querySelectorAll('.particle').length).toBeGreaterThan(0);
      const calls = animate.mock.calls.length;
      for (const span of highlights()) Observer.instances[1]!.trigger(span);
      expect(animate).toHaveBeenCalledTimes(calls);
      controller.configure({ ...settings, animate: false });
      expect(host.shadowRoot!.querySelectorAll('.particle')).toHaveLength(0);
      controller.disable(); await work(); expect(vi.getTimerCount()).toBe(0);
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      animate.mockClear(); controller.configure({ ...settings, theme: 'dark' }); await visible();
      const reducedHost = document.querySelector('.textheat-extension-reactions')!;
      expect(reducedHost.shadowRoot!.querySelectorAll('.badge').length).toBeGreaterThan(0);
      expect(reducedHost.shadowRoot!.querySelectorAll('.particle')).toHaveLength(0);
      expect(animate).not.toHaveBeenCalled();
      document.querySelector('article')!.remove(); await work();
      expect(reducedHost.shadowRoot!.querySelectorAll('.badge')).toHaveLength(0);
      controller.destroy(); expect(document.querySelector('.textheat-extension-reactions')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      geometry.mockRestore();
      if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
  it('does not add emoji UI to Off, inactive Manual or selection panels/native fields', async () => {
    controller.configure({ ...defaults, emojiReactions: true }); await work();
    expect(document.querySelector('.textheat-extension-reactions')).toBeNull();
    controller.configure({ ...defaults, mode: 'manual', emojiReactions: true });
    document.body.innerHTML = '<textarea>wonderful</textarea>';
    document.querySelector('textarea')!.focus(); controller.action('CHECK_SELECTION'); await work();
    expect(document.querySelector('.textheat-extension-panel')).not.toBeNull();
    expect(document.querySelector('.textheat-extension-reactions')).toBeNull();
    expect(document.querySelector('textarea')!.value).toBe('wonderful');
  });
  it('resumes Auto after page lifecycle teardown even when restored settings are identical', async () => {
    const settings = { ...defaults, mode: 'auto' as const };
    controller.configure(settings); await visible();
    expect(highlights().length).toBeGreaterThan(0);
    controller.destroy(); expect(highlights()).toHaveLength(0);
    controller.configure(structuredClone(settings)); await visible();
    expect(controller.state().pageEnabled).toBe(true);
    expect(highlights().length).toBeGreaterThan(0);
    controller.action('CLEAR_PAGE');
    controller.configure(structuredClone(settings)); await work();
    expect(controller.state().pageEnabled).toBe(false);
    expect(highlights()).toHaveLength(0);
  });
  it('does not restore an active Manual page automatically after lifecycle teardown', async () => {
    const settings = { ...defaults, mode: 'manual' as const };
    controller.configure(settings); controller.action('TOGGLE_PAGE'); await visible();
    controller.destroy(); controller.configure(structuredClone(settings)); await work();
    expect(controller.state().mode).toBe('manual');
    expect(controller.state().pageEnabled).toBe(false);
    controller.action('TOGGLE_PAGE'); await visible();
    expect(highlights().length).toBeGreaterThan(0);
  });
  it('preserves Manual tools and existing node identity on identical settings broadcasts', async () => {
    const settings = { ...defaults, mode: 'manual' as const };
    controller.configure(settings); controller.action('TOGGLE_PAGE'); await visible();
    const span = highlights()[0]!;
    controller.action('PICK_TEXT'); controller.configure(structuredClone(settings));
    expect(controller.state().picking).toBe(true); expect(highlights()[0]).toBe(span);
    expect(Observer.instances).toHaveLength(2);
  });
  it('updates presentation in place without replacing observers, spans or reveal state', async () => {
    const NativeMutationObserver = window.MutationObserver;
    let mutationObservers = 0;
    vi.stubGlobal('MutationObserver', class extends NativeMutationObserver {
      constructor(callback: MutationCallback) { super(callback); mutationObservers++; }
    });
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    let settings = { ...defaults, mode: 'auto' as const };
    controller.configure(settings); await visible();
    const spans = highlights(), wrappers = spans.map(span => span.parentElement);
    const processed = controller.state().processed;
    const apply = (change: Partial<typeof settings>) => {
      settings = { ...settings, ...change }; controller.configure(settings);
      expect(highlights()).toEqual(spans);
      spans.forEach((span, index) => {
        expect(highlights()[index]).toBe(span); expect(span.parentElement).toBe(wrappers[index]);
        expect(span.dataset.textheatAnimationState).toBe('visible');
      });
      expect(Observer.instances).toHaveLength(2); expect(mutationObservers).toBe(1);
      expect(controller.state().processed).toBe(processed);
    };
    apply({ theme: 'dark' });
    expect(spans.find(span => span.textContent === 'love')!.style.getPropertyValue('--textheat-bg')).toBe('#78350F');
    apply({ theme: 'custom', customTheme: { joy: { background: '#ABCDEF', color: '#123456' } } });
    expect(spans.find(span => span.textContent === 'love')!.style.getPropertyValue('--textheat-bg')).toBe('#ABCDEF');
    apply({ customTheme: { joy: { background: '#FEDCBA', color: '#654321' } } });
    expect(spans.find(span => span.textContent === 'love')!.style.getPropertyValue('--textheat-bg')).toBe('#FEDCBA');
    apply({ showTooltips: true });
    const titles = spans.map(span => span.title);
    expect(titles.every(title => title.includes('uncalibrated heuristic'))).toBe(true);
    apply({ showTooltips: false }); expect(spans.every(span => !span.hasAttribute('title'))).toBe(true);
    apply({ showTooltips: true }); expect(spans.map(span => span.title)).toEqual(titles);
    apply({ animate: false }); apply({ animate: true });
    apply({ respectReducedMotion: false }); apply({ respectReducedMotion: true });
    apply({ debug: true }); await work();
    expect(highlights()[0]).toBe(spans[0]); expect(vi.getTimerCount()).toBe(0);
    debug.mockRestore();
  });
  it('preserves waiting and animating spans on appearance updates and never replays settled reveals', async () => {
    let settings = { ...defaults, mode: 'auto' as const };
    controller.configure(settings); await work(); Observer.instances[0]!.all(); await work();
    const spans = highlights(), span = spans[0]!;
    expect(span.dataset.textheatAnimationState).toBe('waiting');
    settings = { ...settings, theme: 'dark', showTooltips: true, debug: true };
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    controller.configure(settings);
    expect(span.dataset.textheatAnimationState).toBe('waiting');
    Observer.instances[1]!.trigger(span); expect(span.dataset.textheatAnimationState).toBe('animating');
    controller.configure({ ...settings, theme: 'default' });
    expect(span.dataset.textheatAnimationState).toBe('animating');
    controller.configure({ ...settings, animate: false });
    expect(spans.every(item => item.dataset.textheatAnimationState === 'visible')).toBe(true);
    expect(Observer.instances[1]!.targets.size).toBe(0);
    controller.configure(settings); await work(); Observer.instances[1]!.all();
    expect(highlights()[0]).toBe(span); expect(span.dataset.textheatAnimationState).toBe('visible');
    expect(Observer.instances).toHaveLength(2); debug.mockRestore();
  });
  it('settles existing reveals when reduced motion becomes respected without replay on opt-out', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const settings = { ...defaults, mode: 'auto' as const, respectReducedMotion: false };
    controller.configure(settings); await work(); Observer.instances[0]!.all(); await work();
    const span = highlights()[0]!; expect(span.dataset.textheatAnimationState).toBe('waiting');
    controller.configure({ ...settings, respectReducedMotion: true });
    expect(span.dataset.textheatAnimationState).toBe('visible');
    controller.configure(settings); expect(span.dataset.textheatAnimationState).toBe('visible');
    expect(highlights()[0]).toBe(span); expect(Observer.instances).toHaveLength(2);
  });
  it.each([false, true])('preserves Manual picking, panel identity and focus on settings changes (active=%s)', async active => {
    const settings = { ...defaults, mode: 'manual' as const };
    controller.configure(settings);
    if (active) { controller.action('TOGGLE_PAGE'); await visible(); }
    controller.action('CHECK_SELECTION');
    const panel = document.querySelector('.textheat-extension-panel')!, focus = panel.shadowRoot!.activeElement;
    controller.action('PICK_TEXT');
    const hint = document.querySelector('.textheat-extension-pick-hint'), spans = highlights();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    controller.configure({ ...settings, theme: 'dark', showTooltips: true, animate: false, debug: true, preloadPx: 250 });
    expect(controller.state().picking).toBe(true); expect(controller.state().pageEnabled).toBe(active);
    expect(document.querySelector('.textheat-extension-panel')).toBe(panel);
    expect(document.querySelector('.textheat-extension-pick-hint')).toBe(hint);
    expect(panel.shadowRoot!.activeElement).toBe(focus); expect(document.activeElement).toBe(panel);
    spans.forEach((span, index) => expect(highlights()[index]).toBe(span));
    controller.configure({ ...settings, threshold: 0.9 });
    expect(controller.state().picking).toBe(true); expect(document.querySelector('.textheat-extension-panel')).toBe(panel);
    expect(panel.shadowRoot!.activeElement).toBe(focus); debug.mockRestore();
  });
  it('reconstructs only the preload observer with wrapper parents and neutral targets, pruning removed subtrees', async () => {
    document.body.innerHTML = '<article><p id="emotion">wonderful</p><p id="neutral">A factual sentence.</p><p id="removed">ordinary text</p></article>';
    const settings = { ...defaults, mode: 'auto' as const };
    controller.configure(settings); await visible();
    const span = highlights()[0]!, near = Observer.instances[0]!, animation = Observer.instances[1]!;
    const emotion = document.querySelector('#emotion')!, neutral = document.querySelector('#neutral')!, removed = document.querySelector('#removed')!;
    removed.remove();
    controller.configure({ ...settings, preloadPx: 400 });
    const replacement = Observer.instances[2]!;
    expect(Observer.instances).toHaveLength(3); expect(near.disconnected).toBe(true); expect(animation.disconnected).toBe(false);
    expect(replacement.options!.rootMargin).toBe('400px 0px');
    expect([...replacement.targets]).toEqual(expect.arrayContaining([emotion, neutral]));
    expect(replacement.targets.has(removed)).toBe(false); expect(highlights()[0]).toBe(span);
    expect(span.dataset.textheatAnimationState).toBe('visible');
    near.trigger(neutral, false); // A stale callback must not alter visibility.
    neutral.firstChild!.textContent = 'terrible'; await work(); replacement.all(); await work(); animation.all(); await work();
    expect(highlights().map(item => item.textContent)).toEqual(['wonderful', 'terrible']);
    controller.configure({ ...settings, preloadPx: 600 }); expect(Observer.instances[3]!.targets.has(removed)).toBe(false);
    controller.disable(); expect(Observer.instances.every(observer => observer.disconnected)).toBe(true);
  });
  it('rebuilds threshold results synchronously as visible and progressively discovers newly eligible code', async () => {
    document.body.innerHTML = '<p id="p">good terrible wonderful</p><code>excellent</code>';
    const paragraph = document.querySelector('#p')!, text = paragraph.textContent!;
    const settings = { ...defaults, mode: 'auto' as const };
    controller.configure(settings); await visible();
    const span = highlights()[0]!;
    controller.configure({ ...settings, threshold: 0.9, processCode: true });
    expect(highlights().map(item => item.textContent)).toEqual(analyze(text, { threshold: 0.9 }).highlights.map(item => item.text));
    expect(highlights().every(item => item.dataset.textheatAnimationState === 'visible')).toBe(true);
    expect(span.isConnected).toBe(false); expect(document.querySelector('code [data-textheat-extension]')).toBeNull();
    expect(Observer.instances).toHaveLength(2);
    controller.configure({ ...settings, processCode: true });
    expect(paragraph.querySelectorAll('[data-textheat-extension="highlight"]').length).toBe(analyze(text).highlights.length);
    expect(highlights().every(item => item.dataset.textheatAnimationState === 'visible')).toBe(true);
    await visible(); expect(document.querySelector('code [data-textheat-extension="highlight"]')!.textContent).toBe('excellent');
    controller.configure(settings); expect(document.querySelector('code [data-textheat-extension]')).toBeNull();
    expect(highlights().every(item => item.dataset.textheatAnimationState === 'visible')).toBe(true);
    await work(); expect(vi.getTimerCount()).toBe(0);
  });
  it('immediately reanalyzes previously processed nodes with no highlights when lowering the threshold', async () => {
    document.body.innerHTML = '<p>good terrible wonderful</p>';
    const settings = { ...defaults, mode: 'auto' as const, threshold: 1 };
    controller.configure(settings); await visible(); expect(highlights()).toHaveLength(0);
    Observer.instances[0]!.trigger(document.querySelector('p')!, false);
    controller.configure({ ...settings, threshold: defaults.threshold });
    expect(highlights().map(span => span.textContent)).toEqual(analyze(document.body.textContent!).highlights.map(item => item.text));
    expect(highlights().every(span => span.dataset.textheatAnimationState === 'visible')).toBe(true);
  });
  it('preserves backward editor selection offsets during synchronous threshold and eligibility updates', async () => {
    document.body.innerHTML = '<div contenteditable="true"><p>wonderful <b>terrible</b> product</p></div>';
    const editor = document.querySelector('div')!, bold = editor.querySelector('b')!, selection = document.getSelection()!;
    const settings = { ...defaults, mode: 'auto' as const, processEditable: true };
    controller.configure(settings); await visible();
    selection.setBaseAndExtent(editor.querySelector('p')!.lastChild!, 4, highlights()[0]!.firstChild!, 2);
    const selected = selection.toString();
    const offset = (node: Node, position: number) => {
      const range = document.createRange(); range.selectNodeContents(editor); range.setEnd(node, position); return range.toString().length;
    };
    const anchor = offset(selection.anchorNode!, selection.anchorOffset), focus = offset(selection.focusNode!, selection.focusOffset);
    for (const change of [{ threshold: 0.9 }, { threshold: 0.3 }, { processEditable: false }]) {
      controller.configure({ ...settings, ...change });
      expect(selection.toString()).toBe(selected);
      expect(offset(selection.anchorNode!, selection.anchorOffset)).toBe(anchor);
      expect(offset(selection.focusNode!, selection.focusOffset)).toBe(focus);
      expect(editor.querySelector('b')).toBe(bold);
      expect(highlights().every(span => span.dataset.textheatAnimationState === 'visible')).toBe(true);
    }
    expect(highlights()).toHaveLength(0);
  });
  it('defers presentation and synchronous rebuilds during IME while updating outside text immediately', async () => {
    document.body.innerHTML = '<div contenteditable="true">wonderful product</div><p>good terrible</p>';
    const editor = document.querySelector('div')!, settings = { ...defaults, mode: 'auto' as const, processEditable: true };
    controller.configure(settings); await visible();
    const wrapper = editor.firstChild, span = editor.querySelector<HTMLElement>('[data-textheat-extension="highlight"]')!, style = span.getAttribute('style');
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    span.firstChild!.textContent = 'terrible';
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(span.firstChild!, 3, span.firstChild!, 3);
    const updated = { ...settings, threshold: 0.9, theme: 'dark' as const, showTooltips: true, animate: false };
    controller.configure(updated);
    expect(editor.firstChild).toBe(wrapper); expect(span.getAttribute('style')).toBe(style); expect(span.title).toBe('');
    expect(highlights().filter(item => !editor.contains(item)).map(item => item.textContent)).toEqual(analyze('good terrible', { threshold: 0.9 }).highlights.map(item => item.text));
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(editor.firstChild).not.toBe(wrapper);
    expect(editor.textContent).toBe('terrible product'); expect(selection.isCollapsed).toBe(true); expect(selection.anchorOffset).toBe(3);
    expect([...editor.querySelectorAll('[data-textheat-extension="highlight"]')].map(item => item.textContent)).toEqual(analyze('terrible product', { threshold: 0.9 }).highlights.map(item => item.text));
    expect([...editor.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]')].every(item => item.dataset.textheatAnimationState === 'visible' && item.title.includes('uncalibrated heuristic'))).toBe(true);
    await work(); expect(Observer.instances).toHaveLength(2); expect(vi.getTimerCount()).toBe(0);
  });
  it('applies deferred appearance without replacing the composing wrapper after compositionend', async () => {
    document.body.innerHTML = '<div contenteditable="true">wonderful</div>';
    const editor = document.querySelector('div')!, settings = { ...defaults, mode: 'auto' as const, processEditable: true };
    controller.configure(settings); await visible();
    const span = highlights()[0]!, wrapper = span.parentElement, style = span.getAttribute('style');
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    controller.configure({ ...settings, theme: 'dark', showTooltips: true, animate: false });
    expect(span.getAttribute('style')).toBe(style); expect(span.title).toBe('');
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await work();
    expect(highlights()[0]).toBe(span); expect(span.parentElement).toBe(wrapper);
    expect(span.getAttribute('style')).not.toBe(style); expect(span.title).toContain('uncalibrated heuristic');
    expect(span.dataset.textheatAnimationState).toBe('visible');
  });
  it('retains exclusion cleanup after in-place updates and removes all Manual tools when switched Off', async () => {
    const settings = { ...defaults, mode: 'manual' as const };
    controller.configure(settings); controller.action('TOGGLE_PAGE'); await visible();
    controller.action('CHECK_SELECTION'); controller.action('PICK_TEXT');
    controller.configure({ ...settings, showTooltips: true, theme: 'dark' });
    document.querySelector('article')!.setAttribute('inert', ''); await work(); expect(highlights()).toHaveLength(0);
    controller.configure({ ...settings, mode: 'off' });
    expect(controller.state().pageEnabled).toBe(false); expect(controller.state().picking).toBe(false);
    expect(document.querySelectorAll('[data-textheat-extension]')).toHaveLength(0);
    expect(Observer.instances.every(observer => observer.disconnected)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('does no scanning or observer setup while Off or inactive Manual', async () => {
    controller.configure(defaults); await work();
    expect(Observer.instances).toHaveLength(0); expect(highlights()).toHaveLength(0);
    controller.configure({ ...defaults, mode: 'manual' }); await work();
    expect(Observer.instances).toHaveLength(0);
    controller.action('TOGGLE_PAGE'); await visible();
    expect(highlights().length).toBeGreaterThan(0);
    controller.action('TOGGLE_PAGE'); expect(highlights()).toHaveLength(0);
  });
  it('waits for near visibility, animates once on actual visibility, and matches core analysis', async () => {
    const original = document.querySelector('#review')!.textContent!;
    controller.configure({ ...defaults, mode: 'auto', preloadPx: 0 }); await work();
    expect(highlights()).toHaveLength(0);
    expect(Observer.instances[0]!.options!.rootMargin).toBe('0px 0px');
    Observer.instances[0]!.trigger(document.querySelector('#review')!); await work();
    expect(highlights().map(p => p.textContent)).toEqual(analyze(original).highlights.map(p => p.text));
    expect(highlights()[0]!.dataset.textheatAnimationState).toBe('waiting');
    const span = highlights()[0]!;
    Observer.instances[1]!.trigger(span); await work();
    expect(span.dataset.textheatAnimationState).toBe('visible');
    Observer.instances[1]!.trigger(span); Observer.instances[0]!.trigger(document.querySelector('#review')!); await work();
    expect(span.dataset.textheatAnimationState).toBe('visible');
    expect(highlights().map(p => p.textContent)).toEqual(analyze(original).highlights.map(p => p.text));
    expect(document.querySelector('[data-textheat-extension="highlight"] [data-textheat-extension="highlight"]')).toBeNull();
  });
  it('preserves parent identity, links/listeners, form values, whitespace, copying and original text node', async () => {
    document.body.innerHTML = '<p id="p" data-page="original"><a id="link" href="#target">I love\t this 🧡 product!</a>\n  awful service</p><input value="wonderful"><button>good</button>';
    const parent = document.querySelector('#p')!, link = document.querySelector<HTMLAnchorElement>('#link')!, node = link.firstChild!;
    const input = document.querySelector('input')!; input.value = 'user edited';
    const original = parent.textContent;
    const click = vi.fn(); link.addEventListener('click', click);
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    expect(document.querySelector('#p')).toBe(parent); expect(parent.getAttribute('data-page')).toBe('original');
    link.click(); expect(click).toHaveBeenCalledOnce();
    expect(input.value).toBe('user edited'); expect(document.querySelector('button')!.children).toHaveLength(0);
    const range = document.createRange(); range.selectNodeContents(parent);
    document.getSelection()!.addRange(range); expect(document.getSelection()!.toString()).toBe(original);
    controller.disable(); expect(parent.textContent).toBe(original); expect(link.firstChild).toBe(node);
    expect(document.querySelectorAll('[data-textheat-extension]')).toHaveLength(0);
  });
  it('excludes hidden, editable, code and controls, supports explicitly enabled code', async () => {
    document.body.innerHTML = '<p hidden>love</p><div style="display:none"><p>awful</p></div><p style="visibility:hidden">excellent</p><pre>good</pre><code>bad</code><button>wonderful</button><textarea>terrible</textarea><div contenteditable="true"><p>love</p></div><details><p>great</p></details><p>fantastic</p>';
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    expect(highlights().map(p => p.textContent)).toEqual(['fantastic']);
    controller.configure({ ...defaults, mode: 'auto', processCode: true }); await visible();
    expect(highlights().map(p => p.textContent)).toEqual(['good', 'bad', 'fantastic']);
  });
  it('handles inserted content, changed neutral text, expansions, and SPA body replacement', async () => {
    document.body.innerHTML = '<p id="neutral">A factual sentence.</p><div id="hidden" hidden>awful</div>';
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    expect(highlights()).toHaveLength(0);
    document.querySelector('#neutral')!.firstChild!.textContent = 'excellent';
    const paragraph = document.createElement('p'); paragraph.textContent = 'wonderful'; document.body.append(paragraph);
    document.querySelector('#hidden')!.removeAttribute('hidden');
    await visible(); expect(highlights().map(p => p.textContent).sort()).toEqual(['awful', 'excellent', 'wonderful']);
    const body = document.createElement('body'); body.innerHTML = '<main><p>terrible</p></main>'; document.body.replaceWith(body);
    await visible(); expect(highlights().map(p => p.textContent)).toEqual(['terrible']);
    expect(controller.state().highlights).toBe(1);
  });
  it('preserves page edits to extension-owned text instead of restoring stale text', async () => {
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    const span = highlights().find(p => p.textContent === 'love')!;
    span.textContent = 'hate'; await visible();
    expect(document.querySelector('#review')!.textContent).toContain('hate');
    controller.disable(); expect(document.querySelector('#review')!.textContent).toContain('hate');
    expect(document.querySelector('#review')!.textContent).not.toContain('love');
  });
  it('respects reduced motion, avoids ARIA duplication/focus stops and shows opt-in accurate explanations', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    controller.configure({ ...defaults, mode: 'auto', showTooltips: true }); await visible();
    expect(highlights().every(p => p.dataset.textheatAnimationState === 'visible')).toBe(true);
    expect(highlights().every(p => !p.hasAttribute('tabindex') && !p.hasAttribute('aria-label'))).toBe(true);
    expect(highlights()[0]!.title).toContain('uncalibrated heuristic');
    expect(highlights()[0]!.hasAttribute('data-confidence')).toBe(false);
  });
  it('uses core thresholds and themes and cleans queued work and observers', async () => {
    const expected = analyze(document.body.textContent!, { threshold: 0.9 }).highlights.map(p => p.text);
    controller.configure({ ...defaults, mode: 'auto', threshold: 0.9, theme: 'dark' }); await visible();
    expect(highlights().map(p => p.textContent)).toEqual(expected);
    controller.configure({ ...defaults, mode: 'auto', theme: 'dark' }); await visible();
    expect(highlights().find(p => p.textContent === 'love')!.style.getPropertyValue('--textheat-bg')).toBe('#78350F');
    controller.destroy(); await work();
    expect(Observer.instances.every(observer => observer.disconnected)).toBe(true);
    expect(document.querySelectorAll('[data-textheat-extension]')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('switches existing highlight corners between sharp default and rounded preference', async () => {
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    const span = highlights().find(p => p.textContent === 'love')!;
    expect(defaults.roundedCorners).toBe(false);
    expect(span.style.getPropertyValue('--textheat-radius')).toBe('0px');
    controller.configure({ ...defaults, mode: 'auto', roundedCorners: true });
    expect(span.style.getPropertyValue('--textheat-radius')).toBe('3px');
    controller.configure({ ...defaults, mode: 'auto', roundedCorners: false });
    expect(span.style.getPropertyValue('--textheat-radius')).toBe('0px');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('adapts to different local surfaces and recolors on ancestor theme changes without changing text', async () => {
    document.body.innerHTML = '<article style="background:#ffffff"><p id="light">good</p><p id="dark" style="background:#111111">good</p></article>';
    const original = document.body.textContent;
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    const light = document.querySelector<HTMLElement>('#light [data-textheat-extension="highlight"]')!;
    const dark = document.querySelector<HTMLElement>('#dark [data-textheat-extension="highlight"]')!;
    const before = light.style.getPropertyValue('--textheat-bg');
    expect(before).not.toBe(dark.style.getPropertyValue('--textheat-bg'));
    document.querySelector('article')!.style.backgroundColor = '#111111'; await work();
    expect(light.style.getPropertyValue('--textheat-bg')).toBe(dark.style.getPropertyValue('--textheat-bg'));
    expect(light.style.getPropertyValue('--textheat-bg')).not.toBe(before);
    expect(document.body.textContent).toBe(original); expect(highlights()).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    controller.disable(); expect(document.body.textContent).toBe(original);
  });
  it('renders HTML-looking webpage text safely and does not execute supplied markup', async () => {
    const p = document.querySelector('#review')!;
    p.textContent = 'I love <img src=x onerror=alert(1)> & wonderful <script>alert(1)</script>.';
    const original = p.textContent;
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    expect(p.textContent).toBe(original); expect(p.querySelector('img,script')).toBeNull();
    expect(p.querySelector('[onerror]')).toBeNull();
    controller.disable(); expect(p.textContent).toBe(original);
  });
  it('supports Manual click-to-check and selected-text panels without changing the target', async () => {
    controller.configure({ ...defaults, mode: 'manual' });
    const p = document.querySelector('#review')!, original = p.textContent;
    controller.action('PICK_TEXT'); expect(controller.state().picking).toBe(true);
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(controller.state().picking).toBe(false);
    const panel = document.querySelector('[data-textheat-extension="ui"]')!;
    expect(panel.shadowRoot!.textContent).toContain('mixed');
    expect(p.textContent).toBe(original); expect(highlights()).toHaveLength(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[data-textheat-extension="ui"]')).toBeNull();
    const range = document.createRange(); range.selectNodeContents(p); document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    controller.action('CHECK_SELECTION');
    expect(document.querySelector('[data-textheat-extension="ui"]')!.shadowRoot!.textContent).toContain(original);
  });
  it('leaves links and editable controls alone in pick mode and includes highlighted text in checks', async () => {
    document.body.innerHTML = '<p>I love this <a href="#target">wonderful link</a></p><input value="good">';
    controller.configure({ ...defaults, mode: 'manual' }); controller.action('TOGGLE_PAGE'); await visible();
    controller.action('PICK_TEXT');
    const link = document.querySelector('a')!; const event = new MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); expect(controller.state().picking).toBe(true);
    document.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('[data-textheat-extension="ui"]')!.shadowRoot!.textContent).toContain('love');
  });
  it.each(['adaptive', 'default'] as const)('restores a block that becomes editable or inert under %s theme', async theme => {
    document.body.innerHTML = '<article><p id="p">wonderful product</p></article>';
    const paragraph = document.querySelector('#p')!, original = paragraph.firstChild;
    controller.configure({ ...defaults, mode: 'auto', theme }); await visible();
    expect(highlights()).toHaveLength(1);
    document.querySelector('article')!.setAttribute('contenteditable', 'true'); await work();
    expect(highlights()).toHaveLength(0); expect(paragraph.firstChild).toBe(original);
    document.querySelector('article')!.removeAttribute('contenteditable'); await visible();
    expect(highlights()).toHaveLength(1);
    document.querySelector('article')!.setAttribute('inert', ''); await work();
    expect(highlights()).toHaveLength(0);
  });
  it('reobserves moved neutral nodes so subsequent emotional edits are discovered', async () => {
    document.body.innerHTML = '<article id="a"><p id="p">A factual sentence.</p></article><article id="b"></article>';
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    const paragraph = document.querySelector('#p')!;
    document.querySelector('#b')!.append(paragraph); await visible();
    expect(Observer.instances[0]!.targets.has(paragraph)).toBe(true);
    paragraph.firstChild!.textContent = 'wonderful'; await visible();
    expect(highlights().map(p => p.textContent)).toEqual(['wonderful']);
  });
  it('permits click checks inside explicitly noneditable islands but skips designMode', async () => {
    document.body.innerHTML = '<div contenteditable="true"><div contenteditable="false"><p id="p">wonderful product</p></div><p id="edit">terrible</p></div>';
    controller.configure({ ...defaults, mode: 'manual' }); controller.action('PICK_TEXT');
    document.querySelector('#edit')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(controller.state().picking).toBe(true);
    document.querySelector('#p')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('[data-textheat-extension="ui"]')!.shadowRoot!.textContent).toContain('wonderful product');
    controller.disable();
    document.designMode = 'on'; controller.configure({ ...defaults, mode: 'auto' }); await visible();
    expect(highlights()).toHaveLength(0); document.designMode = 'off';
  });
  it('rejects selections spanning editable text and restores page focus after panel dismissal', () => {
    document.body.innerHTML = '<button id="focus">Page action</button><p id="p">wonderful</p><p id="edit" contenteditable="true">private draft</p>';
    controller.configure({ ...defaults, mode: 'manual' });
    const range = document.createRange(); range.setStart(document.querySelector('#p')!.firstChild!, 0); range.setEnd(document.querySelector('#edit')!.firstChild!, 13);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    const focus = document.querySelector<HTMLButtonElement>('#focus')!; focus.focus();
    controller.action('CHECK_SELECTION');
    const panel = document.querySelector('[data-textheat-extension="ui"]')!;
    expect(panel.shadowRoot!.textContent).not.toContain('private draft');
    expect(panel.shadowRoot!.textContent).toContain('Select non-editable');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.activeElement).toBe(focus);
  });
  it('keeps high contrast and custom palette rendering complete and safe for factual text', async () => {
    document.body.innerHTML = '<p>A factual sentence with two ports.</p><p>good terrible love sad</p>';
    controller.configure({ ...defaults, mode: 'auto', theme: 'high-contrast' }); await visible();
    expect(highlights()).toHaveLength(4);
    expect(highlights().every(p => ['#000000', '#FFFFFF'].includes(p.style.getPropertyValue('--textheat-bg')))).toBe(true);
    controller.configure({ ...defaults, mode: 'auto', theme: 'custom', customTheme: { positive: { background: '#ABCDEF', color: '#123456' } } }); await visible();
    expect(highlights().find(p => p.textContent === 'good')!.style.getPropertyValue('--textheat-bg')).toBe('#ABCDEF');
  });

  it('opt-in highlights rich editors without replacing their markup and preserves backward selections through restore', async () => {
    document.body.innerHTML = '<div id="editor" contenteditable><p id="p">wonderful <b id="bold">terrible</b> product</p><span id="island" contenteditable="false">good</span></div>';
    const editor = document.querySelector('#editor')!, paragraph = document.querySelector('#p')!, bold = document.querySelector('#bold')!;
    const first = paragraph.firstChild!, last = paragraph.lastChild!;
    const listener = vi.fn(); bold.addEventListener('click', listener);
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(last, 4, first, 2);
    const selected = selection.toString(), text = editor.textContent;
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
    expect(highlights().map(span => span.textContent)).toEqual(['wonderful', 'terrible', 'good']);
    expect(selection.toString()).toBe(selected);
    const offset = (node: Node, position: number) => {
      const range = document.createRange(); range.selectNodeContents(editor); range.setEnd(node, position); return range.toString().length;
    };
    expect(offset(selection.anchorNode!, selection.anchorOffset)).toBe(22);
    expect(offset(selection.focusNode!, selection.focusOffset)).toBe(2);
    controller.disable();
    expect(selection.toString()).toBe(selected); expect(selection.anchorNode).toBe(last); expect(selection.focusNode).toBe(first);
    expect(document.querySelector('#bold')).toBe(bold); expect(document.querySelector('#p')).toBe(paragraph);
    expect(editor.textContent).toBe(text); bold.dispatchEvent(new MouseEvent('click')); expect(listener).toHaveBeenCalledOnce();
  });

  it('reanalyzes editable text in real time and retains a collapsed caret through wrap and unwrap', async () => {
    document.body.innerHTML = '<div id="editor" contenteditable="plaintext-only">A factual sentence.</div>';
    const editor = document.querySelector('#editor')!, selection = document.getSelection()!;
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
    editor.firstChild!.textContent = 'wonderful product';
    selection.setBaseAndExtent(editor.firstChild!, 4, editor.firstChild!, 4);
    await visible();
    expect(highlights().map(span => span.textContent)).toEqual(['wonderful']);
    expect(selection.isCollapsed).toBe(true); expect(selection.anchorOffset).toBe(4);
    const span = highlights()[0]!; span.firstChild!.textContent = 'terrible';
    selection.setBaseAndExtent(span.firstChild!, 3, span.firstChild!, 3);
    await visible();
    expect(highlights().map(item => item.textContent)).toEqual(['terrible']);
    expect(editor.textContent).toBe('terrible product'); expect(selection.anchorOffset).toBe(3);
    controller.configure({ ...defaults, mode: 'auto', processEditable: false }); await visible();
    expect(highlights()).toHaveLength(0); expect(selection.isCollapsed).toBe(true); expect(selection.anchorOffset).toBe(3);
  });

  it('pauses queued and mutation work inside IME composition until compositionend', async () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true"><b>wonderful</b><p>A factual sentence.</p></div><p id="outside">good</p>';
    const editor = document.querySelector('#editor')!, paragraph = editor.querySelector('p')!, bold = editor.querySelector('b')!;
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
    const wrapper = bold.firstChild!, span = bold.querySelector('[data-textheat-extension="highlight"]')!;
    span.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    span.firstChild!.textContent = 'terrible'; paragraph.firstChild!.textContent = 'excellent';
    document.querySelector('#outside')!.textContent = 'awful';
    await visible();
    expect(bold.firstChild).toBe(wrapper); expect(bold.querySelector('[data-textheat-extension="highlight"]')).toBe(span);
    expect(paragraph.querySelector('[data-textheat-extension]')).toBeNull();
    expect(document.querySelector('#outside [data-textheat-extension="highlight"]')!.textContent).toBe('awful');
    span.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await visible();
    expect(bold).toBe(editor.querySelector('b')); expect(bold.firstChild).not.toBe(wrapper);
    expect(editor.querySelectorAll('[data-textheat-extension="highlight"]')).toHaveLength(2);
    expect(editor.textContent).toBe('terribleexcellent');
  });

  it('defers disabling editable highlighting until the active composition ends', async () => {
    document.body.innerHTML = '<div contenteditable="true">wonderful</div>';
    const editor = document.querySelector('div')!;
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
    const wrapper = editor.firstChild!;
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    controller.configure({ ...defaults, mode: 'auto', processEditable: false }); await visible();
    expect(editor.firstChild).toBe(wrapper);
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await visible();
    expect(editor.querySelector('[data-textheat-extension]')).toBeNull(); expect(editor.textContent).toBe('wonderful');
  });

  it('does not wrap queued editor text or animate existing highlights during composition', async () => {
    document.body.innerHTML = '<div contenteditable="true">wonderful</div>';
    const editor = document.querySelector('div')!;
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await work();
    Observer.instances[0]!.all();
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); await work();
    expect(editor.querySelector('[data-textheat-extension]')).toBeNull();
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await work();
    const span = highlights()[0]!;
    Observer.instances[1]!.trigger(span);
    expect(span.dataset.textheatAnimationState).toBe('animating');
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); await work();
    expect(span.dataset.textheatAnimationState).toBe('animating');
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await work();
    expect(span.dataset.textheatAnimationState).toBe('visible');
  });

  it('handles inherited editable attributes, false islands and designMode only with opt-in', async () => {
    document.body.innerHTML = '<div contenteditable="true"><div contenteditable="invalid"><p id="inherited">wonderful</p></div><div contenteditable="false"><p id="island">terrible</p><div contenteditable="true">excellent</div></div></div>';
    controller.configure({ ...defaults, mode: 'auto' }); await visible();
    expect(highlights().map(span => span.textContent)).toEqual(['terrible']);
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
    expect(highlights().map(span => span.textContent)).toEqual(['wonderful', 'terrible', 'excellent']);
    controller.disable(); document.body.innerHTML = '<p>wonderful</p>'; document.designMode = 'on';
    try {
      controller.configure({ ...defaults, mode: 'auto', processEditable: false }); await visible(); expect(highlights()).toHaveLength(0);
      const node = document.querySelector('p')!.firstChild!, selection = document.getSelection()!;
      selection.setBaseAndExtent(node, 2, node, 2);
      controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
      expect(highlights()).toHaveLength(1); expect(selection.anchorOffset).toBe(2);
      controller.disable(); expect(selection.anchorNode).toBe(node); expect(selection.anchorOffset).toBe(2);
    } finally { document.designMode = 'off'; }
  });

  it.each(['text', 'search', 'email', 'url', 'tel', 'textarea'])('checks opt-in native %s fields manually without inline rendering or value changes', async type => {
    document.body.innerHTML = type === 'textarea' ? '<textarea>good terrible product</textarea>' : `<input type="${type}" value="good terrible product">`;
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')!, value = field.value;
    controller.configure({ ...defaults, mode: 'auto', processEditable: true }); await visible();
    expect(highlights()).toHaveLength(0); expect(field.value).toBe(value);
    controller.configure({ ...defaults, mode: 'manual', processEditable: true }); controller.action('PICK_TEXT');
    field.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(controller.state().picking).toBe(false);
    expect(document.querySelector('[data-textheat-extension="ui"]')!.shadowRoot!.textContent).toContain(value);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    field.focus();
    if (type !== 'email') field.setSelectionRange(5, 13);
    controller.action('CHECK_SELECTION');
    const panel = document.querySelector('[data-textheat-extension="ui"]')!.shadowRoot!;
    if (type === 'email') expect(panel.textContent).toContain('Select non-editable');
    else { expect(panel.querySelector('section > p:nth-of-type(2)')!.textContent).toBe('terrible'); expect(panel.textContent).not.toContain(value); }
    expect(field.value).toBe(value); expect(field.querySelector('[data-textheat-extension]')).toBeNull();
  });

  it.each(['password', 'hidden', 'number', 'date', 'checkbox', 'text" disabled="', 'text" style="display:none'])('never checks protected or unsupported native fields (%s)', type => {
    document.body.innerHTML = `<input type="${type}" value="private wonderful draft"><p>wonderful</p>`;
    const field = document.querySelector('input')!, original = field.value;
    controller.configure({ ...defaults, mode: 'manual', processEditable: true }); controller.action('PICK_TEXT');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true }); field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); expect(controller.state().picking).toBe(true);
    expect(document.querySelector('.textheat-extension-panel')).toBeNull();
    field.focus(); if (field.type === 'password' || field.type === 'text') field.setSelectionRange(0, field.value.length);
    controller.action('CHECK_SELECTION');
    expect(document.querySelector('.textheat-extension-panel')!.shadowRoot!.textContent).not.toContain('private wonderful draft');
    expect(field.value).toBe(original);
  });

  it('allows readonly native text, but rejects native selection and clicks without opt-in', () => {
    document.body.innerHTML = '<textarea readonly>private wonderful draft</textarea>';
    const field = document.querySelector('textarea')!;
    controller.configure({ ...defaults, mode: 'manual' }); controller.action('PICK_TEXT');
    field.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); expect(controller.state().picking).toBe(true);
    field.focus(); field.setSelectionRange(8, 17); controller.action('CHECK_SELECTION');
    expect(document.querySelector('.textheat-extension-panel')!.shadowRoot!.textContent).not.toContain('private wonderful draft');
    controller.configure({ ...defaults, mode: 'manual', processEditable: true });
    field.focus(); field.setSelectionRange(8, 17); controller.action('CHECK_SELECTION');
    expect(document.querySelector('.textheat-extension-panel')!.shadowRoot!.querySelector('section > p:nth-of-type(2)')!.textContent).toBe('wonderful');
    expect(field.value).toBe('private wonderful draft');
  });
});