import { analyze, getTheme, renderDOM } from 'textheat/browser';
import type { Prediction } from 'textheat';
import type { ExtensionSettings } from '../../extension/shared/settings';
import { defaults, validateSettings } from '../../extension/shared/settings';
import type { PageAction, PageState } from '../../extension/shared/messages';
import { editingRoot, eligibleElement, eligibleField, eligibleText } from './exclusions';
import { applyHighlights, extensionTheme, marker, recolorHighlights, replaceText, restoreWrapper, updateTooltips } from './renderer';
import type { Replacement } from './renderer';
import { ReactionManager } from './reactions';

/** Block containers bound merged analysis: their text is a separate reading
 * unit with its own job, never joined to the surrounding container's text.
 */
const blockLevelTags = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL']);

/** Progressive, bounded page jobs. No page text ever leaves this document. */
export class PageController {
  private settings: ExtensionSettings = structuredClone(defaults);
  private reactions?: ReactionManager;
  private active = false;
  private suspended = false;
  private picking = false;
  private processed = new WeakMap<Text, string>();
  private processedParents = new WeakSet<Element>();
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
  private nearTargets = new Set<Element>();
  private animation?: IntersectionObserver;
  private mutations?: MutationObserver;
  private panel?: HTMLElement;
  private pickHint?: HTMLElement;
  private previousFocus?: HTMLElement;
  private count = 0;
  private processedCount = 0;
  private animationFrames = new Set<number>();
  private colorScheme?: MediaQueryList;
  private composing = new Set<Element>();
  private deferredRestore = new Set<Element>();
  private deferredRebuild = new Set<Element>();
  private compositionStart = (event: CompositionEvent) => {
    const target = event.target as Element;
    const root = target?.nodeType === 1 && editingRoot(target);
    if (root) this.composing.add(root);
  };
  private compositionEnd = (event: CompositionEvent) => {
    // Drain final IME records while the composing guard is still in force.
    if (this.mutations) this.changed(this.mutations.takeRecords());
    const target = event.target as Element;
    for (const root of this.composing) if (target?.nodeType === 1 && (root === target || root.contains(target))) {
      this.composing.delete(root);
      for (const wrapper of this.deferredRestore) if (!this.isComposing(wrapper)) {
        this.deferredRestore.delete(wrapper); this.restore(wrapper);
      }
      if (this.active) {
        const parents = [...this.deferredRebuild].filter(parent => !this.isComposing(parent));
        for (const parent of parents) this.deferredRebuild.delete(parent);
        this.rebuild(parents);
        this.updatePresentation();
        this.enqueueRoot(root); this.queuePalettes(root);
        for (const span of root.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]')) {
          if (span.dataset.textheatAnimationState === 'animating') span.dataset.textheatAnimationState = 'waiting';
          this.reveal(span);
        }
      }
    }
    if (!this.active && !this.composing.size) this.removeCompositionListeners();
  };
  private isComposing(node: Node): boolean {
    return [...this.composing].some(root => root.contains(node) || node.contains(root));
  }
  private removeCompositionListeners(): void {
    this.doc.removeEventListener('compositionstart', this.compositionStart, true);
    this.doc.removeEventListener('compositionend', this.compositionEnd, true);
  }
  private restore(wrapper: Element, original?: Replacement): void {
    if (this.isComposing(wrapper)) { this.deferredRestore.add(wrapper); return; }
    for (const span of wrapper.querySelectorAll('[data-textheat-extension="highlight"]')) this.animation?.unobserve(span);
    if (original) this.processed.delete(original.original);
    restoreWrapper(wrapper, original);
    this.reactions?.prune();
  }
  private refreshPalette = () => { this.queuePalettes(this.doc.documentElement); };
  constructor(private doc: Document = document) {}

  private setUiCorners(host?: HTMLElement): void {
    const radius = this.settings.roundedCorners ? '12px' : '0px';
    const targets = host ? [host] : [...this.doc.querySelectorAll<HTMLElement>('[data-textheat-extension="ui"]')];
    for (const target of targets) target.style.setProperty('--textheat-corner-radius', radius);
  }

  state(): PageState { return { mode: this.settings.mode, pageEnabled: this.active, picking: this.picking, highlights: this.doc.querySelectorAll('[data-textheat-extension="highlight"]').length, processed: this.processedCount }; }
  configure(value: ExtensionSettings): void {
    const wasActive = this.active && this.settings.mode === 'manual';
    // The parent owns persistence/UI; absent or invalid opt-in is always Off.
    const settings = validateSettings(value);
    // Storage notifications and save reconciliation can deliver the same update
    // twice. Never cancel Manual tools or rebuild the DOM for a no-op update.
    if (!this.suspended && JSON.stringify(settings) === JSON.stringify(this.settings)) return;
    if (!this.suspended && settings.mode === this.settings.mode) {
      const reanalyze = settings.threshold !== this.settings.threshold || settings.processCode !== this.settings.processCode || settings.processEditable !== this.settings.processEditable;
      const preload = settings.preloadPx !== this.settings.preloadPx;
      // Handle real page edits first, then suppress our synchronous replacement
      // and style records. Reuse the same observer rather than restarting work.
      if (this.mutations) this.changed(this.mutations.takeRecords());
      this.mutations?.disconnect();
      this.settings = settings;
      // A genuine Auto settings change still activates a previously cleared
      // page; identical broadcasts above intentionally leave Clear untouched.
      if (!this.active && settings.mode === 'auto') { this.enable(); return; }
      try {
        if (this.active) {
          if (preload && this.near) this.observeNear();
          if (reanalyze) {
            const parents = new Set<Element>();
            for (const wrapper of this.doc.querySelectorAll(marker)) if (wrapper.parentElement) parents.add(wrapper.parentElement);
            // Previously processed neutral nodes must also get the new threshold.
            for (const parent of this.nearTargets) if (this.processedParents.has(parent)) parents.add(parent);
            this.processed = new WeakMap();
            this.rebuild(parents);
            this.enqueueRoot(this.doc.body);
          }
          this.updatePresentation();
          this.reactions?.configure(this.settings);
        }
      } finally { this.observeMutations(); }
      return;
    }
    this.suspended = false;
    this.disable(); this.settings = settings;
    if (settings.mode === 'auto' || settings.mode === 'manual' && wasActive) this.enable();
  }
  enable(): void {
    if (this.active || this.settings.mode === 'off') return;
    this.active = true;
    this.reactions = new ReactionManager(this.doc, this.settings);
    this.doc.addEventListener('compositionstart', this.compositionStart, true);
    this.doc.addEventListener('compositionend', this.compositionEnd, true);
    const win = this.doc.defaultView!;
    if (typeof win.IntersectionObserver === 'function') {
      this.observeNear();
      this.animation = new win.IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) this.reveal(entry.target as HTMLElement);
      }, { threshold: 0 });
    }
    this.mutations = new win.MutationObserver(records => this.changed(records));
    this.colorScheme = win.matchMedia?.('(prefers-color-scheme: dark)');
    this.colorScheme?.addEventListener?.('change', this.refreshPalette);
    // Observing the document supports body replacement without patching SPA internals.
    this.observeMutations();
    this.enqueueRoot(this.doc.body);
  }
  private observeMutations(): void {
    this.mutations?.observe(this.doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'inert', 'open', 'class', 'style', 'aria-hidden', 'contenteditable'] });
  }
  private observeNear(): void {
    this.near?.disconnect();
    for (const wrapper of this.doc.querySelectorAll(marker)) if (wrapper.parentElement) {
      this.nearTargets.add(wrapper.parentElement); this.seen.add(wrapper.parentElement);
    }
    this.near = new this.doc.defaultView!.IntersectionObserver((entries, observer) => {
      if (!this.active || observer !== this.near) return;
      for (const entry of entries) if (this.nearTargets.has(entry.target)) {
        if (entry.isIntersecting) { this.visible.add(entry.target); this.queueJob(entry.target); }
        else this.visible.delete(entry.target);
      }
    }, { rootMargin: `${this.settings.preloadPx}px 0px`, threshold: 0 });
    for (const target of this.nearTargets) {
      if (target.isConnected) this.near.observe(target);
      else { this.nearTargets.delete(target); this.seen.delete(target); this.visible.delete(target); }
    }
  }
  private updatePresentation(): void {
    this.setUiCorners();
    for (const wrapper of this.doc.querySelectorAll(marker)) {
      if (this.isComposing(wrapper)) continue;
      recolorHighlights(wrapper, getTheme(extensionTheme(this.settings, wrapper.parentElement ?? undefined)), this.settings.roundedCorners);
      updateTooltips(wrapper, this.settings.showTooltips);
      if (!this.settings.animate || this.reducedMotion()) {
        for (const span of wrapper.querySelectorAll<HTMLElement>('[data-textheat-extension="highlight"]')) {
          this.animation?.unobserve(span);
          span.dataset.textheatAnimationState = 'visible';
        }
      }
    }
  }
  private rebuild(parents: Iterable<Element>): void {
    for (const parent of parents) {
      if (!parent.isConnected) { this.deferredRebuild.delete(parent); continue; }
      if (this.isComposing(parent)) { this.deferredRebuild.add(parent); continue; }
      for (const wrapper of [...parent.children]) if (wrapper.matches(marker)) {
        this.count = Math.max(0, this.count - wrapper.querySelectorAll('[data-textheat-extension="highlight"]').length);
        this.restore(wrapper, this.originals.get(wrapper));
      }
      // This entire unwrap/analyze/wrap runs in configure's current task. Text
      // already processed on the page must never return to the reveal queue.
      this.processElement(parent, true);
    }
  }
  disable(): void {
    this.active = false; this.cancelPick(); this.closePanel();
    this.reactions?.destroy(); this.reactions = undefined;
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
    this.nearTargets.clear(); this.deferredRebuild.clear();
    for (const wrapper of this.doc.querySelectorAll(marker)) this.restore(wrapper, this.originals.get(wrapper));
    if (!this.composing.size) this.removeCompositionListeners();
    this.processed = new WeakMap(); this.processedParents = new WeakSet(); this.originals = new WeakMap(); this.seen = new WeakSet();
    this.generated = new WeakSet(); this.visible = new WeakSet(); this.queuedRoots = new WeakSet(); this.queuedJobs = new WeakSet();
    this.count = 0; this.processedCount = 0;
  }
  destroy(): void { this.disable(); this.suspended = true; }
  action(action: PageAction): void {
    if (this.settings.mode === 'off') return;
    if (action === 'CLEAR_PAGE') { this.disable(); return; }
    if (this.settings.mode !== 'manual') return;
    if (action === 'TOGGLE_PAGE') { if (this.active) this.disable(); else this.enable(); }
    if (action === 'PICK_TEXT') { if (this.picking) this.cancelPick(); else this.startPick(); }
    if (action === 'CHECK_SELECTION') {
      const selected = this.doc.getSelection();
      const field = this.doc.activeElement;
      // A native control's value is not represented by document Selection.
      const value = field?.matches('input,textarea')
        ? eligibleField(field, this.settings) ? this.readFieldSelection(field) : ''
        : selected && this.readSelection(selected);
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
    if (!this.seen.has(parent)) { this.seen.add(parent); this.nearTargets.add(parent); this.near?.observe(parent); }
    if (this.processed.get(node) === node.data) return;
    if (!this.near || this.visible.has(parent)) this.queueJob(parent);
  }
  private processElement(element: Element, alreadyPresented = false): void {
    if (this.isComposing(element)) return;
    if (!eligibleElement(element, this.settings)) {
      // A page may become hidden/editable after it was highlighted. Undo our
      // direct wrappers before its editor starts handling the subtree.
      for (const child of [...element.children]) if (child.matches(marker)) {
        const original = this.originals.get(child);
        this.restore(child, original);
      }
      return;
    }
    const palette = getTheme(extensionTheme(this.settings, element));
    if (this.settings.theme === 'adaptive') {
      for (const child of element.children) if (child.matches(marker)) recolorHighlights(child, palette, this.settings.roundedCorners);
    }
    // Text is gathered in inline groups within this block container and
    // analyzed as one string per group, so phrases, negation and modifiers
    // survive inline element splits. Rendering stays per text node.
    for (const group of this.textGroups(element)) {
      const fresh = group.filter(node => this.processed.get(node) !== node.data);
      if (!fresh.length) continue;
      const mergedLength = group.reduce((sum, node) => sum + node.data.length, 0);
      // Bounded merge: every node fresh, a bounded segment count and the same
      // total length budget a single node already had. Anything else keeps the
      // established per-node path, so processed nodes are never double counted.
      if (fresh.length === group.length && group.length > 1 && group.length <= 128 && mergedLength <= 24000) {
        this.processGroup(element, group, palette, alreadyPresented);
      } else {
        for (const node of group) this.processTextNode(element, node, palette, alreadyPresented);
      }
    }
  }
  /** Descendant text nodes in document order, split into groups at block-level
   * elements (their own containers, with their own jobs) and at existing
   * wrappers (already rendered highlights are a hard boundary).
   */
  private textGroups(element: Element): Text[][] {
    const groups: Text[][] = [];
    let current: Text[] = [];
    const flushGroup = () => { if (current.length) { groups.push(current); current = []; } };
    const visit = (parent: Node, depth: number): void => {
      for (const child of parent.childNodes) {
        if (child.nodeType === 3) { current.push(child as Text); continue; }
        if (child.nodeType !== 1) continue;
        const childElement = child as Element;
        if (depth >= 100 || childElement.matches(marker) || blockLevelTags.has(childElement.tagName)) { flushGroup(); continue; }
        visit(childElement, depth + 1);
      }
    };
    visit(element, 0);
    flushGroup();
    return groups;
  }
  /** Analyze one inline group as a single string, then map each prediction
   * back to per-node portions and render those with the usual wrapping. Only
   * eligible nodes are rendered or marked processed; every node's text still
   * contributes context to the merged analysis.
   */
  private processGroup(element: Element, group: Text[], palette: ReturnType<typeof getTheme>, alreadyPresented: boolean): void {
    const segments: Array<{ node: Text; start: number; end: number }> = [];
    let offset = 0;
    for (const node of group) { segments.push({ node, start: offset, end: offset + node.data.length }); offset += node.data.length; }
    const merged = group.map(node => node.data).join('');
    let highlights: Prediction[] = [];
    try { highlights = analyze(merged, { threshold: this.settings.threshold }).highlights; }
    catch (error) { if (this.settings.debug) console.debug('textheat skipped group', error); return; }
    for (const segment of segments) {
      const node = segment.node;
      if (!eligibleText(node, this.settings)) continue;
      const portions: Prediction[] = [];
      for (const prediction of highlights) {
        const start = Math.max(prediction.start, segment.start);
        const end = Math.min(prediction.end, segment.end);
        if (end <= start) continue;
        const text = merged.slice(start, end);
        if (!text.trim()) continue;
        portions.push({ ...prediction, text, start: start - segment.start, end: end - segment.start });
      }
      try {
        const replacement = portions.length ? applyHighlights(node, portions, this.settings, palette) : { highlights: [] };
        this.commitReplacement(element, node, node.data, replacement, alreadyPresented);
      } catch (error) { if (this.settings.debug) console.debug('textheat skipped node', error); }
    }
  }
  private processTextNode(element: Element, node: Text, palette: ReturnType<typeof getTheme>, alreadyPresented: boolean): void {
    if (!eligibleText(node, this.settings) || this.processed.get(node) === node.data) return;
    // Huge single nodes remain unchanged instead of monopolizing the main thread.
    if (node.data.length > 24000) { this.processed.set(node, node.data); return; }
    const value = node.data;
    try {
      const replacement = replaceText(node, this.settings, palette);
      this.commitReplacement(element, node, value, replacement, alreadyPresented);
    } catch (error) { if (this.settings.debug) console.debug('textheat skipped node', error); }
  }
  private commitReplacement(element: Element, node: Text, value: string, replacement: { wrapper?: HTMLSpanElement; highlights: HTMLSpanElement[] }, alreadyPresented: boolean): void {
    this.processedParents.add(element);
    this.processed.set(node, value); this.processedCount++;
    if (!replacement.wrapper) return;
    this.originals.set(replacement.wrapper, { original: node, value });
    this.generated.add(replacement.wrapper);
    for (const child of replacement.wrapper.childNodes) this.generated.add(child);
    for (const span of replacement.highlights) {
      this.count++;
      if (alreadyPresented) {
        span.dataset.textheatAnimationState = 'visible';
        this.reactions?.showStatic(span);
      }
      else if (!this.animation || this.reducedMotion() || !this.settings.animate) this.reveal(span);
      else this.animation.observe(span);
    }
  }
  private reducedMotion(): boolean { return this.settings.respectReducedMotion && !!this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  private reveal(span: HTMLElement): void {
    if (this.isComposing(span)) return;
    // Reactions have their own once flags; settled highlights still need badges
    // after opt-in, independently of the highlight animation early return.
    this.reactions?.reveal(span);
    if (span.dataset.textheatAnimationState !== 'waiting') return;
    this.animation?.unobserve(span);
    if (!this.settings.animate || this.reducedMotion() || typeof this.doc.defaultView!.requestAnimationFrame !== 'function') { span.dataset.textheatAnimationState = 'visible'; return; }
    span.dataset.textheatAnimationState = 'animating';
    const frame = this.doc.defaultView!.requestAnimationFrame(() => {
      this.animationFrames.delete(frame);
      if (span.isConnected && this.active && !this.isComposing(span)) span.dataset.textheatAnimationState = 'visible';
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
      if (this.isComposing(record.target)) {
        if (owner) this.deferredRestore.add(owner);
        continue;
      }
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
          this.nearTargets.delete(removed as Element); this.deferredRebuild.delete(removed as Element);
          for (const element of (removed as Element).querySelectorAll('*')) {
            this.seen.delete(element); this.visible.delete(element);
            this.nearTargets.delete(element); this.deferredRebuild.delete(element);
          }
        }
      }
      for (const added of record.addedNodes) if (!this.generated.has(added)) this.enqueueRoot(added);
    }
    for (const wrapper of refresh) {
      const parent = wrapper.parentElement;
      this.count = Math.max(0, this.count - wrapper.querySelectorAll('[data-textheat-extension="highlight"]').length);
      for (const span of wrapper.querySelectorAll('[data-textheat-extension="highlight"]')) this.animation?.unobserve(span);
      this.restore(wrapper); this.enqueueRoot(parent);
    }
    // Composition records can bypass the normal removal branch. Prune retained
    // observation targets without touching the composing DOM.
    for (const target of this.nearTargets) if (!target.isConnected) {
      this.near?.unobserve(target); this.nearTargets.delete(target);
      this.seen.delete(target); this.visible.delete(target); this.deferredRebuild.delete(target);
    }
    this.reactions?.prune();
    this.reactions?.requestRefresh();
  }

  private pickClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const field = target?.closest('input,textarea');
    if (field && eligibleField(field, this.settings)) {
      event.preventDefault(); event.stopPropagation(); this.cancelPick();
      this.showPanel(field.value.slice(0, 12000)); return;
    }
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
    this.setUiCorners(hint);
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
  private readFieldSelection(field: HTMLInputElement | HTMLTextAreaElement): string {
    // email has no selection API in browsers; do not guess or read its full value.
    const start = field.selectionStart, end = field.selectionEnd;
    return start === null || end === null ? '' : field.value.slice(start, end).slice(0, 12000);
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
    this.setUiCorners(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = this.doc.createElement('style');
    style.textContent = `:host{all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));font:14px/1.6 system-ui,sans-serif;color:#1c1917;color-scheme:light}section{background:#fff;border:1px solid #e7e2d8;padding:18px;box-shadow:6px 6px 0 #f1efe9;max-height:65vh;overflow:auto;border-radius:var(--textheat-corner-radius,0px)}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e7e2d8;padding-bottom:10px;margin-bottom:10px}button{background:#f1efe9;color:#1c1917;border:1px solid #e7e2d8;cursor:pointer;padding:5px 9px;font:600 12px system-ui,sans-serif;border-radius:var(--textheat-corner-radius,0px)}p{overflow-wrap:anywhere;white-space:pre-wrap}small{color:#57534e}h2{font-size:16px;line-height:1.3;margin:0;font-weight:750}button:focus-visible{outline:3px solid #ad482e;outline-offset:3px}@media(prefers-color-scheme:dark){:host{color:#ece7df;color-scheme:dark}section{background:#171412;border-color:#2a2521;box-shadow:6px 6px 0 #161311}header{border-color:#2a2521}button{background:#161311;color:#ece7df;border-color:#2a2521}small{color:#a8a29e}button:focus-visible{outline-color:#e8896b}}`;
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