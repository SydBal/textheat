// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze } from 'textheat';
import { PageController } from '../../src/extension/controller';
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
  controller = new PageController(document);
});
afterEach(() => { controller.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('progressive extension controller', () => {
  it('preserves Manual tools and existing node identity on identical settings broadcasts', async () => {
    const settings = { ...defaults, mode: 'manual' as const };
    controller.configure(settings); controller.action('TOGGLE_PAGE'); await visible();
    const span = highlights()[0]!;
    controller.action('PICK_TEXT'); controller.configure(structuredClone(settings));
    expect(controller.state().picking).toBe(true); expect(highlights()[0]).toBe(span);
    expect(Observer.instances).toHaveLength(2);
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
    controller.configure({ ...defaults, mode: 'auto' }); await work();
    expect(highlights()).toHaveLength(0);
    expect(Observer.instances[0]!.options!.rootMargin).toBe('300px 0px');
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
});