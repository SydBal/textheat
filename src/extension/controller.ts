import { analyze, getTheme, renderDOM } from 'textheat/browser';
import type { ExtensionSettings } from '../../extension/shared/settings';
import { defaults, validateSettings } from '../../extension/shared/settings';
import type { PageAction, PageState } from '../../extension/shared/messages';
import { eligibleElement, eligibleText } from './exclusions';
import { extensionTheme, marker, recolorHighlights, replaceText, restoreWrapper } from './renderer';
import type { Replacement } from './renderer';

/** Progressive, bounded page jobs. No page text ever leaves this document. */
export class PageController {
  private settings = structuredClone(defaults);
  private active = false;
  private picking = false;
  private processed = new WeakMap<Text, string>();
  private originals = new WeakMap<Element, Replacement>();
  private seen = new WeakSet<Element>();
  private generated = new WeakSet<Node>();
  private visible = new WeakSet<Element>();
  private roots: Node[] = [];
  private queuedRoots = new WeakSet<Node>();
  private walker?: TreeWalker;
  private jobs: Element[] = [];
  private queuedJobs = new WeakSet<Element>();
  private idle?: number;
  private idleKind: 'idle' | 'timeout' = 'timeout';
  private near?: IntersectionObserver;
  private animation?: IntersectionObserver;
  private mutations?: MutationObserver;
  private panel?: HTMLElement;
  private pickHint?: HTMLElement;
  private previousFocus?: HTMLElement;
  private count = 0;
  private processedCount = 0;
  private animationFrames = new Set<number>();
  private colorScheme?: MediaQueryList;
  private refreshPalette = () => { this.queuePalettes(this.doc.documentElement); };
  constructor(private doc: Document = document) {}

  state(): PageState { return { mode: this.settings.mode, pageEnabled: this.active, picking: this.picking, highlights: this.doc.querySelectorAll('[data-textheat-extension="highlight"]').length, processed: this.processedCount }; }
  configure(value: ExtensionSettings): void {
    const wasActive = this.active && this.settings.mode === 'manual';
    const settings = validateSettings(value);
    // Storage notifications and save reconciliation can deliver the same update
    // twice. Never cancel Manual tools or rebuild the DOM for a no-op update.
    if (JSON.stringify(settings) === JSON.stringify(this.settings)) return;
    this.disable(); this.settings = settings;
    if (settings.mode === 'auto' || settings.mode === 'manual' && wasActive) this.enable();
  }
  enable(): void {
    if (this.active || this.settings.mode === 'off') return;
    this.active = true;
    const win = this.doc.defaultView!;
    if (typeof win.IntersectionObserver === 'function') {
      this.near = new win.IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          this.visible.add(entry.target); this.queueJob(entry.target);
        } else this.visible.delete(entry.target);
      }, { rootMargin: `${this.settings.preloadPx}px 0px`, threshold: 0 });
      this.animation = new win.IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) this.reveal(entry.target as HTMLElement);
      }, { threshold: 0 });
    }
    this.mutations = new win.MutationObserver(records => this.changed(records));
    this.colorScheme = win.matchMedia?.('(prefers-color-scheme: dark)');
    this.colorScheme?.addEventListener?.('change', this.refreshPalette);
    // Observing the document supports body replacement without patching SPA internals.
    this.mutations.observe(this.doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'inert', 'open', 'class', 'style', 'aria-hidden', 'contenteditable'] });
    this.enqueueRoot(this.doc.body);
  }
  disable(): void {
    this.active = false; this.cancelPick(); this.closePanel();
    this.near?.disconnect(); this.animation?.disconnect(); this.mutations?.disconnect();
    this.near = undefined; this.animation = undefined; this.mutations = undefined;
    this.colorScheme?.removeEventListener?.('change', this.refreshPalette); this.colorScheme = undefined;
    const win = this.doc.defaultView!;
    if (this.idle !== undefined) {
      if (this.idleKind === 'idle') win.cancelIdleCallback(this.idle); else win.clearTimeout(this.idle);
      this.idle = undefined;
    }
    for (const frame of this.animationFrames) win.cancelAnimationFrame(frame);
    this.animationFrames.clear();
    this.roots = []; this.jobs = []; this.walker = undefined;
    for (const wrapper of this.doc.querySelectorAll(marker)) restoreWrapper(wrapper, this.originals.get(wrapper));
    this.processed = new WeakMap(); this.originals = new WeakMap(); this.seen = new WeakSet();
    this.generated = new WeakSet(); this.visible = new WeakSet(); this.queuedRoots = new WeakSet(); this.queuedJobs = new WeakSet();
    this.count = 0; this.processedCount = 0;
  }
  destroy(): void { this.disable(); }
  action(action: PageAction): void {
    if (this.settings.mode === 'off') return;
    if (action === 'CLEAR_PAGE') { this.disable(); return; }
    if (this.settings.mode !== 'manual') return;
    if (action === 'TOGGLE_PAGE') { if (this.active) this.disable(); else this.enable(); }
    if (action === 'PICK_TEXT') { if (this.picking) this.cancelPick(); else this.startPick(); }
    if (action === 'CHECK_SELECTION') {
      const selected = this.doc.getSelection();
      const value = selected && this.readSelection(selected);
      if (value?.trim()) this.showPanel(value);
      else this.showPanel('', 'Select non-editable page text first, then use the selection shortcut.');
    }
  }

  private enqueueRoot(root: Node | null): void {
    if (!root || !root.isConnected || this.queuedRoots.has(root)) return;
    this.queuedRoots.add(root); this.roots.push(root); this.schedule();
  }
  private queueJob(element: Element): void {
    if (!this.active || this.queuedJobs.has(element)) return;
    this.queuedJobs.add(element); this.jobs.push(element); this.schedule();
  }
  private schedule(): void {
    if (!this.active || this.idle !== undefined) return;
    const win = this.doc.defaultView!;
    if (typeof win.requestIdleCallback === 'function') {
      this.idleKind = 'idle'; this.idle = win.requestIdleCallback(() => this.flush(), { timeout: 200 });
    } else { this.idleKind = 'timeout'; this.idle = win.setTimeout(() => this.flush(), 16); }
  }
  private flush(): void {
    this.idle = undefined;
    if (!this.active) return;
    const start = performance.now();
    let steps = 0;
    while (steps++ < 150 && performance.now() - start < 8) {
      const job = this.jobs.shift();
      if (job) { this.queuedJobs.delete(job); this.processElement(job); continue; }
      if (!this.walker) {
        const root = this.roots.shift(); if (!root) break;
        this.queuedRoots.delete(root);
        if (!root.isConnected) continue;
        if (root.nodeType === 3) { this.discover(root as Text); continue; }
        if (root.nodeType === 1 && (root as Element).closest('[data-textheat-extension]')) continue;
        this.walker = this.doc.createTreeWalker(root, 4);
      }
      const node = this.walker.nextNode();
      if (node) this.discover(node as Text); else this.walker = undefined;
    }
    if (this.jobs.length || this.roots.length || this.walker) this.schedule();
    if (this.settings.debug) console.debug('textheat local work', { processed: this.processedCount, highlights: this.count, elapsedMs: performance.now() - start });
  }
  private discover(node: Text): void {
    if (!eligibleText(node, this.settings)) return;
    const parent = node.parentElement!;
    if (!this.seen.has(parent)) { this.seen.add(parent); this.near?.observe(parent); }
    if (this.processed.get(node) === node.data) return;
    if (!this.near || this.visible.has(parent)) this.queueJob(parent);
  }
  private processElement(element: Element): void {
    if (!eligibleElement(element, this.settings)) {
      // A page may become hidden/editable after it was highlighted. Undo our
      // direct wrappers before its editor starts handling the subtree.
      for (const child of [...element.children]) if (child.matches(marker)) {
        for (const span of child.querySelectorAll('[data-textheat-extension="highlight"]')) this.animation?.unobserve(span);
        const original = this.originals.get(child);
        if (original) this.processed.delete(original.original);
        restoreWrapper(child, original);
      }
      return;
    }
    const palette = getTheme(extensionTheme(this.settings, element));
    if (this.settings.theme === 'adaptive') {
      for (const child of element.children) if (child.matches(marker)) recolorHighlights(child, palette);
    }
    // Only direct text children: never duplicate traversal/analysis of a giant container.
    for (const child of [...element.childNodes]) {
      if (child.nodeType !== 3) continue;
      const node = child as Text;
      if (!eligibleText(node, this.settings) || this.processed.get(node) === node.data) continue;
      // Huge single nodes remain unchanged instead of monopolizing the main thread.
      if (node.data.length > 24000) { this.processed.set(node, node.data); continue; }
      const value = node.data;
      try {
        const replacement = replaceText(node, this.settings, palette);
        this.processed.set(node, value); this.processedCount++;
        if (!replacement.wrapper) continue;
        this.originals.set(replacement.wrapper, { original: node, value });
        this.generated.add(replacement.wrapper);
        for (const child of replacement.wrapper.childNodes) this.generated.add(child);
        for (const span of replacement.highlights) {
          this.count++;
          if (!this.animation || this.reducedMotion() || !this.settings.animate) this.reveal(span);
          else this.animation.observe(span);
        }
      } catch (error) { if (this.settings.debug) console.debug('textheat skipped node', error); }
    }
  }
  private reducedMotion(): boolean { return this.settings.respectReducedMotion && !!this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  private reveal(span: HTMLElement): void {
    if (span.dataset.textheatAnimationState !== 'waiting') return;
    this.animation?.unobserve(span);
    if (!this.settings.animate || this.reducedMotion()) { span.dataset.textheatAnimationState = 'visible'; return; }
    span.dataset.textheatAnimationState = 'animating';
    const frame = this.doc.defaultView!.requestAnimationFrame(() => {
      this.animationFrames.delete(frame);
      if (span.isConnected && this.active) span.dataset.textheatAnimationState = 'visible';
    });
    this.animationFrames.add(frame);
  }
  private queuePalettes(root: Element): void {
    // Also reevaluate eligibility for static themes when an ancestor changes.
    for (const wrapper of root.querySelectorAll(marker)) if (wrapper.parentElement) this.queueJob(wrapper.parentElement);
  }
  private changed(records: MutationRecord[]): void {
    const refresh = new Set<Element>();
    for (const record of records) {
      const parent = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      const owner = parent?.closest(marker);
      if (owner) {
        // Animation attributes are filtered out; genuine page edits need unwrapping/reanalysis.
        if (record.type !== 'attributes' || record.target === owner) refresh.add(owner);
        continue;
      }
      if (parent?.closest('[data-textheat-extension]')) continue;
      if (record.type === 'characterData') this.enqueueRoot(record.target);
      if (record.type === 'attributes') {
        this.enqueueRoot(record.target);
        if (parent) this.queuePalettes(parent);
      }
      // Inline stylesheet edits and newly attached stylesheet links may change any surface.
      if (parent?.closest('style') || [...record.addedNodes].some(node => node.nodeType === 1 && ((node as Element).matches('style,link[rel="stylesheet"]') || (node as Element).querySelector('style,link[rel="stylesheet"]')))) this.refreshPalette();
      for (const removed of record.removedNodes) {
        if (removed.nodeType === 1) {
          const removedHighlights = (removed as Element).matches('[data-textheat-extension="highlight"]') ? 1 : (removed as Element).querySelectorAll('[data-textheat-extension="highlight"]').length;
          this.count = Math.max(0, this.count - removedHighlights);
          this.near?.unobserve(removed as Element); this.animation?.unobserve(removed as Element);
          for (const element of (removed as Element).querySelectorAll('*')) { this.near?.unobserve(element); this.animation?.unobserve(element); }
          this.seen.delete(removed as Element); this.visible.delete(removed as Element);
          for (const element of (removed as Element).querySelectorAll('*')) { this.seen.delete(element); this.visible.delete(element); }
        }
      }
      for (const added of record.addedNodes) if (!this.generated.has(added)) this.enqueueRoot(added);
    }
    for (const wrapper of refresh) {
      const parent = wrapper.parentElement;
      this.count = Math.max(0, this.count - wrapper.querySelectorAll('[data-textheat-extension="highlight"]').length);
      for (const span of wrapper.querySelectorAll('[data-textheat-extension="highlight"]')) this.animation?.unobserve(span);
      restoreWrapper(wrapper); this.enqueueRoot(parent);
    }
  }

  private pickClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (target?.closest?.('a,button,input,select,textarea,[data-textheat-extension="ui"]')) return;
    const element = (event.target as Element | null)?.closest?.('p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th,figcaption') ?? event.target as Element;
    if (!element || !eligibleElement(element, this.settings) || element.closest('a,button,input,select,textarea')) return;
    event.preventDefault(); event.stopPropagation(); this.cancelPick();
    const text = this.readEligible(element, 12000);
    this.showPanel(text, text ? undefined : 'No eligible readable text in this element.');
  };
  private escapePick = (event: KeyboardEvent) => { if (event.key === 'Escape') { this.cancelPick(); this.closePanel(); } };
  private startPick(): void {
    this.picking = true;
    this.doc.addEventListener('click', this.pickClick, true);
    this.doc.addEventListener('keydown', this.escapePick);
    const hint = this.doc.createElement('div'); hint.dataset.textheatExtension = 'ui'; hint.className = 'textheat-extension-pick-hint';
    hint.textContent = 'textheat: click readable text to check it · Escape to cancel · links and forms remain interactive';
    this.doc.body.append(hint); this.pickHint = hint;
  }
  private cancelPick(): void {
    this.picking = false; this.doc.removeEventListener('click', this.pickClick, true);
    if (!this.panel) this.doc.removeEventListener('keydown', this.escapePick);
    this.pickHint?.remove(); this.pickHint = undefined;
  }
  private readEligible(element: Element, limit: number): string {
    const walker = this.doc.createTreeWalker(element, 4);
    let value = '', steps = 0, node;
    while ((node = walker.nextNode()) && steps++ < 1000) {
      const parent = node.parentElement;
      const wrapper = parent?.closest(marker);
      if (eligibleText(node as Text, this.settings) || wrapper?.parentElement && eligibleElement(wrapper.parentElement, this.settings)) value += (node as Text).data;
      if (value.length >= limit) break;
    }
    return value.slice(0, limit);
  }
  private readSelection(selection: Selection): string {
    if (!selection.rangeCount) return '';
    const range = selection.getRangeAt(0);
    const walker = this.doc.createTreeWalker(range.commonAncestorContainer, 4);
    let node: Node | null = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer : walker.nextNode();
    let value = '', steps = 0;
    while (node && steps++ < 2000) {
      if (range.intersectsNode(node)) {
        const parent = node.parentElement;
        const source = parent?.closest(marker)?.parentElement ?? parent;
        // Reject mixed editable/hidden/control selections, rather than reading
        // protected text simply because the selection starts in an eligible node.
        if (!source || !eligibleElement(source, this.settings)) return '';
        const start = range.startContainer === node ? range.startOffset : 0;
        const end = range.endContainer === node ? range.endOffset : (node as Text).length;
        value += (node as Text).data.slice(start, end);
        if (value.length >= 12000) return value.slice(0, 12000);
      }
      node = walker.nextNode();
    }
    return steps >= 2000 ? '' : value;
  }
  private closePanel(): void {
    const hadFocus = !!this.panel?.shadowRoot?.activeElement;
    this.panel?.remove(); this.panel = undefined;
    if (hadFocus && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = undefined;
    if (!this.picking) this.doc.removeEventListener('keydown', this.escapePick);
  }
  private showPanel(input: string, notice?: string): void {
    this.closePanel();
    this.previousFocus = this.doc.activeElement instanceof this.doc.defaultView!.HTMLElement ? this.doc.activeElement as HTMLElement : undefined;
    const host = this.doc.createElement('div'); host.dataset.textheatExtension = 'ui'; host.className = 'textheat-extension-panel';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = this.doc.createElement('style');
    style.textContent = ':host{all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));font:14px/1.6 system-ui;color:#252823}section{background:#fff;border:1px solid #ddd;border-radius:12px;padding:18px;box-shadow:0 8px 36px #0003;max-height:65vh;overflow:auto}header{display:flex;justify-content:space-between;align-items:center}button{background:#f2f2ec;border:1px solid #ddd;border-radius:6px;cursor:pointer;padding:4px 8px}p{overflow-wrap:anywhere;white-space:pre-wrap}small{color:#666}h2{font-size:16px;margin:0}button:focus-visible{outline:2px solid #c45b3e}';
    const section = this.doc.createElement('section'); section.setAttribute('role', 'dialog'); section.setAttribute('aria-label', 'textheat text analysis');
    const header = this.doc.createElement('header'); const title = this.doc.createElement('h2'); title.textContent = 'textheat · selected text';
    const close = this.doc.createElement('button'); close.textContent = 'Close'; close.addEventListener('click', () => this.closePanel()); header.append(title, close);
    const result = analyze(input, { threshold: this.settings.threshold });
    const output = this.doc.createElement('p');
    const status = this.doc.createElement('p'); status.textContent = notice ?? `${result.sentiment.label} · ${result.highlights.length} highlights · ${result.aspects.length} opinion targets`;
    const explanation = this.doc.createElement('small'); explanation.textContent = 'Local English rules, not calibrated probabilities. Text may be limited to 12,000 characters. No page text is sent anywhere.';
    const evidence = this.doc.createElement('ul');
    for (const prediction of result.highlights) {
      const item = this.doc.createElement('li'); item.textContent = `${prediction.text}: ${prediction.sentiment}${prediction.emotion ? ` / ${prediction.emotion}` : ''}, importance ${prediction.importance.toFixed(2)}. ${prediction.explanation}`; evidence.append(item);
    }
    section.append(header, status, output, evidence, explanation); shadow.append(style, section); this.doc.body.append(host); this.panel = host;
    renderDOM(output, input, result, { threshold: this.settings.threshold, theme: extensionTheme(this.settings, output) });
    this.doc.addEventListener('keydown', this.escapePick); close.focus();
  }
}