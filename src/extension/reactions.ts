/** Decorative reactions live only in an inert shadow overlay, never in source text. */
export interface ReactionSettings { emojiReactions?: boolean; animate: boolean; roundedCorners?: boolean }
const highlightSelector = '[data-textheat-extension="highlight"]';
const MAX_ANCHORS = 128, MAX_PENDING = 128, MAX_BURSTS = 8, PARTICLES = 4, DURATION = 1600;

export function reactionEmoji(span: HTMLElement): string {
  const emotions: Record<string, string> = { joy: '😊', anger: '😠', sadness: '😢', fear: '😰', surprise: '😮' };
  return emotions[span.dataset.emotion ?? ''] ?? (span.dataset.sentiment === 'positive' ? '👍' : span.dataset.sentiment === 'negative' ? '👎' : '');
}

interface Anchor {
  span: HTMLElement;
  layer: HTMLElement;
  badge: HTMLElement;
  timer?: number;
  animations: Animation[];
  active?: boolean;
}

export class ReactionManager {
  private settings: ReactionSettings;
  private once = new WeakMap<HTMLElement, boolean>();
  // Only visible anchors are strongly held; offscreen/removed spans are recycled.
  private anchors = new Map<HTMLElement, Anchor>();
  // FIFO requests, including offscreen reveals; overflow is rejected, not consumed.
  private pending = new Set<HTMLElement>();
  private draining = false;
  private host?: HTMLElement;
  private shadow?: ShadowRoot;
  private frame?: number;
  private trackingFrame?: number;
  private trackingUntil = 0;
  private bursts = 0;
  private destroyed = false;
  private motion?: MediaQueryList;
  private win: Window;
  private motionChanged = () => {
    if (this.motion?.matches) {
      this.cancelTracking();
      this.settlePending();
      for (const anchor of this.anchors.values()) this.settle(anchor);
    }
    this.requestRefresh();
  };
  private visibilityChanged = () => { if (this.doc.hidden) this.cancelTracking(); };
  constructor(private doc: Document, settings: ReactionSettings, private selector = highlightSelector, private decorativeTarget = false) {
    this.settings = settings;
    this.win = doc.defaultView!;
    this.motion = this.win.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.motion?.addEventListener?.('change', this.motionChanged);
    doc.addEventListener('scroll', this.requestRefresh, true);
    doc.addEventListener('visibilitychange', this.visibilityChanged);
    this.win.addEventListener('resize', this.requestRefresh);
  }

  /** Opt-in is static for already-visible text; appearance updates preserve requests. */
  configure(settings: ReactionSettings): void {
    if (this.destroyed) return;
    const enabling = !this.settings.emojiReactions && settings.emojiReactions;
    this.settings = settings;
    if (enabling || !settings.animate || this.motion?.matches) {
      // Waiting/animating highlights still belong to their reveal caller.
      for (const span of this.doc.querySelectorAll<HTMLElement>(this.selector)) {
        if (!this.pending.has(span) && this.visible(span) && span.dataset.textheatAnimationState !== 'waiting' &&
          span.dataset.textheatAnimationState !== 'animating') this.once.set(span, true);
      }
    }
    if (!settings.animate || this.motion?.matches) {
      this.cancelTracking();
      this.settlePending();
      for (const anchor of this.anchors.values()) this.settle(anchor);
    }
    if (!settings.emojiReactions) this.clear();
    else this.refresh();
  }

  /** Explicitly remember already-presented text without playing a first burst. */
  showStatic(span: HTMLElement): void {
    if (this.destroyed) return;
    this.pending.delete(span);
    this.once.set(span, true);
    const existing = this.anchors.get(span);
    if (existing) this.settle(existing);
    if (!this.settings.emojiReactions) return;
    this.prune();
    if (!this.visible(span)) return;
    const anchor = this.attach(span);
    if (anchor) this.settle(anchor);
  }

  reveal(span: HTMLElement): void {
    if (this.destroyed || !this.eligible(span) || !reactionEmoji(span)) return;
    if (!this.settings.emojiReactions) { this.once.set(span, true); return; }
    this.prune();
    if (this.once.has(span)) {
      if (this.visible(span)) this.attach(span);
      return;
    }
    if (!this.canAnimate(span)) {
      this.pending.delete(span); this.once.set(span, true);
      if (this.visible(span)) {
        const anchor = this.attach(span);
        if (anchor) this.settle(anchor);
      }
      this.drain();
      return;
    }
    if (!this.pending.has(span) && this.pending.size >= MAX_PENDING) return;
    this.pending.add(span);
    // Offscreen requests must never create an overlay host.
    if (this.visible(span)) this.attach(span);
    this.drain();
  }

  private canAnimate(span: HTMLElement): boolean {
    return this.settings.animate && !this.motion?.matches &&
      typeof this.win.requestAnimationFrame === 'function' && typeof span.animate === 'function';
  }

  /** Iterative drain: partial animation failures release slots without recursion. */
  private drain(): void {
    if (this.draining || this.destroyed || !this.settings.emojiReactions) return;
    this.draining = true;
    try {
      for (const span of this.pending) {
        if (!this.eligible(span) || !reactionEmoji(span)) { this.pending.delete(span); continue; }
        if (!this.canAnimate(span)) {
          this.pending.delete(span); this.once.set(span, true);
          if (this.visible(span)) this.attach(span);
          continue;
        }
        if (this.bursts >= MAX_BURSTS) break;
        if (!this.visible(span)) continue;
        // Static badges must not starve accepted requests at the anchor cap.
        if (!this.anchors.has(span) && this.anchors.size >= MAX_ANCHORS) {
          for (const [target, anchor] of this.anchors) if (!anchor.active && !this.pending.has(target)) {
            this.settle(anchor); anchor.layer.remove(); this.anchors.delete(target); break;
          }
        }
        const anchor = this.attach(span);
        if (!anchor) continue;
        this.pending.delete(span);
        this.once.set(span, true);
        if (typeof anchor.badge.animate === 'function') this.start(anchor);
      }
    } finally { this.draining = false; }
  }

  private start(anchor: Anchor): void {
    const span = anchor.span;
    this.bursts++;
    anchor.active = true;
    anchor.badge.hidden = true;
    try {
      for (let index = 0; index < PARTICLES; index++) {
        const particle = this.doc.createElement('span');
        particle.className = 'particle';
        particle.textContent = span.dataset.emotion === 'joy' && index % 2 === 0 ? '🎉' : reactionEmoji(span);
        anchor.layer.append(particle);
        const x = (index - 1.5) * 12, y = -24 - (index % 2) * 10;
        anchor.animations.push(particle.animate([
          { transform: 'translate(-50%, 0) scale(.65)', opacity: 0 },
          { transform: `translate(calc(-50% + ${x * .5}px), ${y}px) scale(1.1)`, opacity: 1, offset: .4 },
          { transform: `translate(calc(-50% + ${x}px), ${y - 8}px) scale(.3)`, opacity: 0 }
        ], { duration: DURATION, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }));
      }
      anchor.timer = this.win.setTimeout(() => {
        this.settle(anchor);
        this.prune();
      }, DURATION);
      this.zoomIn(anchor);
    } catch {
      // Partial/unsupported animation implementations still leave one badge.
      this.settle(anchor);
    }
  }

  /** A demo may reuse one element for a newly classified word. */
  reset(span: HTMLElement): void {
    const anchor = this.anchors.get(span);
    this.pending.delete(span);
    if (anchor) { this.settle(anchor); anchor.layer.remove(); this.anchors.delete(span); }
    this.once.delete(span);
    this.prune();
  }

  private eligible(span: HTMLElement): boolean {
    return !(!span.isConnected || span.ownerDocument !== this.doc || !span.matches(this.selector) ||
      span.closest('[data-textheat-extension="ui"],input,textarea,select,[hidden],[inert]') ||
      !this.decorativeTarget && span.closest('[aria-hidden="true"]'));
  }
  private visible(span: HTMLElement): boolean {
    if (!this.eligible(span)) return false;
    const rect = span.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < this.win.innerHeight && rect.left < this.win.innerWidth;
  }
  private ensureHost(): void {
    if (!this.host) {
      this.host = this.doc.createElement('div');
      this.host.className = 'textheat-extension-reactions';
      this.host.dataset.textheatExtension = 'ui';
      this.host.setAttribute('aria-hidden', 'true');
      this.host.setAttribute('inert', '');
      // Inline isolation also protects the host before the content stylesheet loads.
      this.host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none!important;z-index:2147483646!important;contain:strict!important;overflow:hidden!important;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      const style = this.doc.createElement('style');
      style.textContent = `:host { pointer-events:none; user-select:none; }
        * { box-sizing:border-box; pointer-events:none!important; user-select:none!important; }
        .anchor { position:absolute; width:0; height:0; }
        .badge,.particle { position:absolute; font:16px/1 system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif; }
        .badge { transform:translate(-50%,-25%); padding:2px; border-radius:var(--reaction-radius,0px); background:var(--reaction-bg,transparent); color:var(--reaction-fg,inherit); }
        .particle { will-change:transform,opacity; }
        [hidden] { display:none!important; }
        @media(prefers-reduced-motion:reduce) { .particle { display:none!important; } }`;
      this.shadow.append(style);
    }
    // A body replacement must not put decorations in a new editing subtree.
    if (!this.host.isConnected) this.doc.documentElement.append(this.host);
  }
  private attach(span: HTMLElement): Anchor | undefined {
    const existing = this.anchors.get(span);
    if (existing) { this.position(existing); return existing; }
    const emoji = reactionEmoji(span);
    if (!emoji || this.anchors.size >= MAX_ANCHORS) return;
    this.ensureHost();
    const layer = this.doc.createElement('div'), badge = this.doc.createElement('span');
    layer.className = 'anchor'; badge.className = 'badge'; badge.textContent = emoji;
    layer.append(badge); this.shadow!.append(layer);
    const anchor: Anchor = { span, layer, badge, animations: [] };
    this.anchors.set(span, anchor); this.position(anchor);
    return anchor;
  }
  private position(anchor: Anchor): void {
    const rect = anchor.span.getBoundingClientRect();
    anchor.layer.style.left = `${Math.max(12, Math.min(this.win.innerWidth - 12, rect.right))}px`;
    anchor.layer.style.top = `${Math.max(12, Math.min(this.win.innerHeight - 12, rect.top - 8))}px`;
    anchor.badge.style.setProperty('--reaction-bg', this.decorativeTarget ? 'transparent' : anchor.span.style.getPropertyValue('--textheat-bg'));
    anchor.badge.style.setProperty('--reaction-fg', anchor.span.style.getPropertyValue('--textheat-fg'));
    anchor.badge.style.setProperty('--reaction-radius', this.settings.roundedCorners ? '50%' : '0px');
    anchor.badge.textContent = reactionEmoji(anchor.span);
  }
  private settle(anchor: Anchor): void {
    if (anchor.active) {
      this.bursts = Math.max(0, this.bursts - 1);
      anchor.active = false;
    }
    if (anchor.timer !== undefined) this.win.clearTimeout(anchor.timer);
    anchor.timer = undefined;
    for (const animation of anchor.animations) animation.cancel();
    anchor.animations = [];
    for (const particle of anchor.layer.querySelectorAll('.particle')) particle.remove();
    anchor.badge.hidden = false;
  }
  private zoomIn(anchor: Anchor): void {
    anchor.badge.hidden = false;
    if (this.settings.animate && !this.motion?.matches && typeof anchor.badge.animate === 'function') {
      try {
        const animation = anchor.badge.animate([
          { transform: 'translate(-50%,-25%) scale(0)', opacity: 0 },
          { transform: 'translate(-50%,-25%) scale(1)', opacity: 1 }
        ], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
        anchor.animations.push(animation);
        void animation.finished?.then(() => {
          anchor.animations = anchor.animations.filter(value => value !== animation);
        }, () => {});
      } catch { /* Static settled reaction if zoom is unsupported. */ }
    }
  }
  /** Synchronous removal pruning releases source references before another frame. */
  prune(): void {
    for (const span of this.pending) if (!this.eligible(span) || !reactionEmoji(span)) this.pending.delete(span);
    for (const [span, anchor] of this.anchors) if (!this.visible(span)) {
      this.settle(anchor); anchor.layer.remove(); this.anchors.delete(span);
    }
    this.drain();
  }
  requestRefresh = (): void => {
    if (this.destroyed || !this.settings.emojiReactions || this.frame !== undefined) return;
    if (typeof this.win.requestAnimationFrame !== 'function') { this.refresh(); return; }
    this.frame = this.win.requestAnimationFrame(() => { this.frame = undefined; this.refresh(); });
  };
  /** Follow existing anchors during a bounded layout transition, without discovery. */
  trackFor(durationMs: number): void {
    if (this.destroyed || !this.settings.emojiReactions || !this.settings.animate || this.doc.hidden ||
      this.motion?.matches || !Number.isFinite(durationMs) || durationMs <= 0 ||
      typeof this.win.requestAnimationFrame !== 'function') return;
    this.trackingUntil = this.win.performance.now() + durationMs;
    if (this.trackingFrame !== undefined) return;
    const follow = (now: number) => {
      this.trackingFrame = undefined;
      if (this.destroyed || !this.settings.emojiReactions || !this.settings.animate || this.doc.hidden || this.motion?.matches) return;
      this.prune();
      for (const anchor of this.anchors.values()) this.position(anchor);
      if (now < this.trackingUntil && this.anchors.size) this.trackingFrame = this.win.requestAnimationFrame(follow);
    };
    this.trackingFrame = this.win.requestAnimationFrame(follow);
  }
  private cancelTracking(): void {
    if (this.trackingFrame !== undefined) this.win.cancelAnimationFrame?.(this.trackingFrame);
    this.trackingFrame = undefined;
    this.trackingUntil = 0;
  }
  refresh(): void {
    if (this.destroyed || !this.settings.emojiReactions) return;
    this.prune();
    for (const anchor of this.anchors.values()) this.position(anchor);
    // No page-sized strong set: query results are transient, with only 128 live layers.
    for (const span of this.doc.querySelectorAll<HTMLElement>(this.selector)) {
      if (this.anchors.size >= MAX_ANCHORS) break;
      if (this.once.has(span) && span.dataset.textheatAnimationState !== 'waiting' && this.visible(span)) this.attach(span);
    }
  }
  /** Deliberate static cancellation consumes accepted requests, including offscreen. */
  private settlePending(): void {
    for (const span of this.pending) this.once.set(span, true);
    this.pending.clear();
  }
  private clear(): void {
    this.cancelTracking();
    if (this.frame !== undefined) this.win.cancelAnimationFrame?.(this.frame);
    this.frame = undefined;
    this.settlePending();
    for (const anchor of this.anchors.values()) this.settle(anchor);
    this.anchors.clear(); this.host?.remove(); this.host = undefined; this.shadow = undefined;
  }
  destroy(): void {
    this.destroyed = true; this.clear(); this.once = new WeakMap();
    this.doc.removeEventListener('scroll', this.requestRefresh, true);
    this.doc.removeEventListener('visibilitychange', this.visibilityChanged);
    this.win.removeEventListener('resize', this.requestRefresh);
    this.motion?.removeEventListener?.('change', this.motionChanged);
  }
}