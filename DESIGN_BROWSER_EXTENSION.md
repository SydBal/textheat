# Build textheat browser extension — Page-wide animated sentiment highlighting

Act as a senior TypeScript browser-extension engineer, UX engineer, and accessibility-focused frontend architect.

Build a **browser extension for `textheat`** that applies the existing `textheat` analysis and visual highlighting engine to the text of arbitrary webpages.

The extension is a browser-facing companion to the existing `textheat` package described in `DESIGN.md`. **Do not fork, duplicate, or reimplement the sentiment-analysis engine.** Reuse the same core tokenizer, analyzer, importance scoring, themes, and rendering primitives wherever possible.

The extension should make an ordinary webpage feel as though its emotionally significant language is being revealed progressively:

1. The extension is activated on a page.
2. The page's eligible text receives the textheat visual treatment.
3. The background/highlight treatment animates in smoothly.
4. Text that is not initially visible does not need to be processed or animated immediately.
5. As new text scrolls into the viewport, its textheat treatment animates in.
6. Newly inserted page content can also be detected and processed.
7. Existing page layout, interaction, links, images, forms, and application behavior should remain intact.

The result should feel polished and subtle rather than like a disruptive accessibility overlay.

---

## 1. Product goal

The primary experience is:

> **Turn on textheat and see the emotional language of the page emerge as you read it.**

For example, on a news article:

```text
The company announced a wonderful new product,
but customers reported terrible reliability issues.
```

The extension should visually highlight:

- `wonderful` as positive.
- `terrible` as negative.
- `reliability issues` or another phrase only when the shared analyzer considers it emotionally significant.

The extension must use the exact same analysis semantics as:

```ts
text.heat(input);
text.analyze(input);
```

The browser extension is an application layer around the library, not a second implementation of `textheat`.

---

## 2. Browser extension architecture

Use a modern extension architecture compatible with **Manifest V3**.

Support Chromium-based browsers first, with the architecture kept portable to Firefox where practical.

Suggested architecture:

```text
Extension
├── background/
│   └── service-worker.ts
├── content/
│   ├── content.ts
│   ├── scanner.ts
│   ├── observer.ts
│   ├── renderer.ts
│   ├── animation.ts
│   ├── exclusions.ts
│   ├── state.ts
│   └── styles.css
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.ts
│   └── options.css
├── shared/
│   ├── messages.ts
│   ├── settings.ts
│   └── constants.ts
└── manifest.json
```

Adapt this structure if needed, but maintain a clear separation between:

- Extension lifecycle.
- Page/content-script behavior.
- Analysis.
- DOM traversal.
- Rendering.
- Animation.
- Settings.
- UI.

The extension must consume the shared `textheat` package rather than copying its source.

---

## 3. Core integration with textheat

The extension must use the existing public API.

Prefer:

```ts
import {
  analyze,
  tokenize,
  renderHTML,
  getTheme
} from "textheat";
```

or an equivalent browser-safe package entry point.

Do not introduce a second sentiment lexicon.

Do not create a browser-only sentiment implementation.

Do not alter the meaning of:

- sentiment,
- emotion,
- importance,
- confidence,
- threshold,
- calibration,
- phrase recognition,
- negation,
- intensifiers.

The extension may add browser-specific metadata such as:

```ts
{
  source: "browser-extension",
  animated: true,
  visibleOnActivation: true
}
```

but these are presentation concerns and must not affect analysis.

---

## 4. Page text discovery

The extension should process **visible webpage text**, not simply retrieve:

```ts
document.body.innerText
```

and replace the entire body.

The extension must preserve the DOM.

Use a `TreeWalker` or equivalent DOM traversal to locate eligible `Text` nodes.

Process text nodes individually or in safe logical groups.

### Include

Generally process text contained in:

- `article`
- `main`
- `section`
- `p`
- `li`
- `blockquote`
- headings
- captions
- table cells
- other normal readable content

The exact element list should not be unnecessarily restrictive. Prefer semantic/readable text detection over a tiny hardcoded whitelist.

### Exclude

Never rewrite text inside:

- `script`
- `style`
- `noscript`
- `template`
- `textarea`
- `input`
- `select`
- `option`
- `button` where changing DOM structure could affect behavior
- `code` and `pre` by default
- contenteditable regions by default
- extension-owned UI

Allow exclusions to be configurable where practical.

Do not process:

- hidden elements,
- elements with `display: none`,
- elements with `visibility: hidden`,
- inaccessible off-DOM content,
- text that is only present in metadata.

Do not assume `innerText` and DOM text are interchangeable.

---

## 5. Never destroy page structure

This is one of the most important requirements.

Do **not** do this:

```ts
document.body.innerHTML = text.heat(document.body.innerText);
```

That would destroy:

- event listeners,
- forms,
- application state,
- links,
- embedded widgets,
- framework-managed DOM,
- selection behavior,
- accessibility relationships.

Instead, transform individual text nodes into DOM elements while preserving their surrounding structure.

Preferred conceptual transformation:

```html
<p>
  I
  <span class="textheat-highlight textheat-positive">love</span>
  this product.
</p>
```

The original element remains the same.

---

## 6. Text-node processing

Build a safe text-node renderer.

For each eligible text node:

1. Determine whether it has already been processed.
2. Preserve its exact original text.
3. Run the shared `textheat.analyze()` function.
4. If no spans exceed the configured threshold, leave the node unchanged.
5. If highlights exist, split the text node into:
   - ordinary text nodes,
   - generated highlight elements.
6. Preserve exact character offsets.
7. Preserve whitespace and punctuation.
8. Preserve Unicode correctly.
9. Replace only that text node.

Prefer DOM APIs such as:

```ts
document.createTextNode()
document.createElement("span")
```

rather than generating arbitrary HTML and assigning it to `innerHTML`.

This is particularly important because the extension is operating on third-party pages.

---

## 7. Highlight DOM structure

Generated highlights should use the same semantic classes as the core library where possible.

Example:

```html
<span
  class="textheat-highlight textheat-positive textheat-extension-highlight"
  data-sentiment="positive"
  data-importance="0.86"
>
  love
</span>
```

Possible attributes:

```text
data-textheat
data-sentiment
data-emotion
data-importance
data-confidence
```

Do not expose confidence as a calibrated probability unless the underlying analyzer actually provides one.

Use a stable extension-specific marker such as:

```html
data-textheat-extension="highlight"
```

This allows the extension to recognize its own DOM without relying exclusively on CSS classes.

---

## 8. Avoid double processing

The extension must be idempotent.

Scrolling over the same text repeatedly must not:

- wrap highlights inside highlights,
- duplicate spans,
- change text,
- multiply event listeners,
- repeatedly run analysis unnecessarily.

Maintain an internal processed-state mechanism.

Possible approaches include:

- `WeakSet<Node>`
- `WeakMap<Node, ProcessingState>`
- extension-owned DOM markers
- a combination of these.

Do not rely on a global array of DOM nodes because pages can be very large and nodes can be removed.

When a page framework replaces a node, the replacement should be eligible for processing again.

---

## 9. IntersectionObserver-driven progressive processing

`IntersectionObserver` should be a central part of the extension.

The extension should not eagerly process every piece of text on a large page.

Create an observer that detects eligible content as it approaches or enters the viewport.

Conceptually:

```ts
const observer = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        processElement(entry.target);
      }
    }
  },
  {
    root: null,
    rootMargin: "300px 0px",
    threshold: 0
  }
);
```

The exact values should be configurable or tuned through performance testing.

### Why `rootMargin` matters

Do not wait until text is visibly painted to begin all processing.

A modest preload region allows the analyzer and DOM transformation to happen slightly ahead of the reader.

The visual animation should still begin as the content becomes visible, or within a carefully controlled preload window.

---

## 10. Animate the background in

The defining visual behavior is that highlights should **animate in**, rather than appearing instantly.

The initial state should have no visible highlight background.

For example:

```css
.textheat-extension-highlight {
  background-size: 100% 100%;
  background-repeat: no-repeat;
  transition:
    background-color 450ms ease,
    color 300ms ease;
}
```

However, do not rely solely on animating `background-color` if it causes undesirable layout or compositing behavior.

Prefer a pseudo-element or background-layer technique when it produces a smoother effect without changing layout.

A conceptual implementation:

```css
.textheat-extension-highlight {
  position: relative;
  background-color: transparent;
}

.textheat-extension-highlight::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 500ms ease;
}

.textheat-extension-highlight.textheat-visible::after {
  transform: scaleX(1);
}
```

Do not blindly use this exact CSS if it interferes with:

- text selection,
- stacking contexts,
- links,
- overflow,
- inline layout,
- dark mode,
- accessibility.

The final implementation should be tested on realistic pages.

---

## 11. Animation lifecycle

Highlights should have a clear lifecycle:

```text
UNPROCESSED
    ↓
ANALYZED
    ↓
DOM INSERTED
    ↓
WAITING FOR VISIBILITY
    ↓
ANIMATING
    ↓
VISIBLE
```

A highlight should not animate repeatedly every time an observer callback fires.

Once a highlight has animated, it should remain in its final state.

For example:

```html
<span
  class="textheat-highlight textheat-positive"
  data-textheat-animation-state="visible"
>
  wonderful
</span>
```

Use classes or `data-*` state rather than inline styles wherever practical.

---

## 12. Animate newly visible text

The extension must also handle content that becomes visible later.

Examples:

- Infinite-scroll articles.
- Comments loaded after page load.
- Social-media posts.
- Expanded accordions.
- Lazy-loaded article sections.
- Single-page applications navigating without a full reload.
- Client-rendered content.

When new content appears:

1. `MutationObserver` detects relevant DOM changes.
2. New eligible elements/text nodes are discovered.
3. They are registered with `IntersectionObserver`.
4. When they become visible, they are analyzed/rendered.
5. Their highlights animate in.

Do not synchronously process every mutation.

Use batching/debouncing to avoid creating a performance problem on highly dynamic pages.

---

## 13. MutationObserver

Use a `MutationObserver` for dynamically inserted content.

Conceptually:

```ts
const mutationObserver = new MutationObserver(mutations => {
  queueMutationsForProcessing(mutations);
});

mutationObserver.observe(document.body, {
  childList: true,
  subtree: true
});
```

The actual implementation must be more careful than this simplified example.

Requirements:

- Batch mutations.
- Avoid processing extension-generated nodes as new content.
- Avoid infinite mutation loops.
- Avoid reprocessing unchanged content.
- Ignore mutations outside eligible page content where possible.
- Disconnect/reconnect observers appropriately if the document is replaced.
- Avoid expensive full-page rescans after every mutation.

Use `requestIdleCallback` where available, with a safe fallback to `setTimeout`.

---

## 14. Single-page applications

Support SPA navigation.

The extension should continue working when a website changes content without a full page reload.

Examples include:

- React applications.
- Vue applications.
- Angular applications.
- Next.js applications.
- social feeds,
- webmail,
- documentation sites.

Do not assume `DOMContentLoaded` happens again after navigation.

Detect meaningful DOM changes and process newly rendered content.

Do not monkey-patch framework internals.

Avoid modifying:

```ts
history.pushState
history.replaceState
```

unless a compelling reason is demonstrated.

Prefer observing actual DOM changes.

---

## 15. Performance requirements

The extension will potentially run on every page the user visits, so performance is critical.

### Must avoid

- Analyzing the entire page repeatedly.
- Running the analyzer on hidden text.
- Running analysis on the same text node more than once.
- Synchronous full-page rescans after every mutation.
- Large synchronous DOM operations.
- Excessive layout reads/writes.
- Forced synchronous layout.
- Long-running work on the main thread.

### Prefer

- `IntersectionObserver`.
- `MutationObserver`.
- Batched processing.
- `requestIdleCallback`.
- Small work queues.
- `WeakMap`/`WeakSet`.
- Lazy analysis.
- Processing only relevant text.
- Caching analysis results where safe.

---

## 16. Large-page strategy

A page may contain hundreds of thousands of characters.

Implement a processing queue.

Conceptually:

```ts
type ProcessingJob = {
  node: Text;
  priority: "visible" | "nearby" | "background";
};
```

Prioritize:

1. Currently visible content.
2. Content near the viewport.
3. Newly inserted visible content.
4. Everything else.

Do not allow background work to starve the browser's UI thread.

If the page is extremely large, the extension may intentionally leave distant content unprocessed until the user approaches it.

This is a feature, not a bug.

---

## 17. Highlight threshold

Reuse the core `textheat` threshold.

The extension should expose a user-facing setting such as:

```text
Highlight sensitivity

More highlights ───────●─────── Fewer highlights
```

Map this to the core analyzer's threshold.

Do not invent a second scoring system.

Suggested conceptual presets:

```text
Low:
  Show more emotionally significant words.

Medium:
  Show meaningful emotional language.

High:
  Show only the strongest emotional language.
```

Default to the existing `textheat` medium/default behavior.

---

## 18. Color themes

Reuse the existing `textheat` themes.

Default categories include:

- Positive.
- Negative.
- Joy.
- Anger.
- Sadness.
- Fear/anxiety.
- Surprise.
- Neutral/uncertain.

The extension must not silently change the core meaning of those categories.

Support:

```text
Default
Dark
High contrast
Custom
```

A dark-mode theme should remain readable against dark websites.

Use CSS custom properties where practical:

```css
:root {
  --textheat-positive-background: #D1FAE5;
  --textheat-positive-text: #065F46;
}
```

Avoid injecting global styles that could unexpectedly alter unrelated page elements.

Scope all styles under extension-specific selectors.

---

## 19. Respect website styling

The extension should be visually resilient across arbitrary websites.

Do not globally modify:

```css
body
p
span
a
* 
```

Use highly scoped selectors:

```css
.textheat-extension-highlight {
  ...
}
```

The extension should not change:

- font size,
- line height,
- margins,
- padding,
- element dimensions,

unless absolutely necessary for the animation.

The default experience should not cause layout shifts.

---

## 20. Links and interactive elements

Highlights inside links must remain clickable.

For example:

```html
<a href="/product">
  This is a
  <span class="textheat-extension-highlight">wonderful</span>
  product.
</a>
```

The span must not:

- intercept clicks,
- change cursor behavior,
- prevent navigation,
- interfere with keyboard focus,
- obscure link focus indicators.

Use:

```css
.textheat-extension-highlight {
  pointer-events: none;
}
```

where appropriate, but test carefully because the span is inside interactive content.

Do not add `tabindex` to every highlight.

Highlights should not become hundreds of unnecessary keyboard stops.

---

## 21. Text selection

Text selection must continue to work naturally.

Users should be able to:

- select a word,
- select a paragraph,
- copy text,
- drag across multiple highlights.

Generated spans must not alter the copied textual content.

Do not use CSS or event handlers that disable selection.

Test:

```text
Select across highlighted and unhighlighted text → Copy → Paste
```

The pasted result should match the original text.

---

## 22. Accessibility

Accessibility is a first-class requirement.

The extension must not make webpages less accessible.

### Requirements

- Respect `prefers-reduced-motion`.
- Do not rely on color alone to communicate information where the extension presents additional semantic UI.
- Maintain sufficient contrast.
- Do not create unnecessary focusable elements.
- Preserve native semantics.
- Preserve screen-reader-readable text.
- Do not duplicate visible text into ARIA labels.
- Do not announce every highlight as it appears.
- Avoid rapidly changing accessible names or descriptions.

When:

```css
@media (prefers-reduced-motion: reduce)
```

is active, skip or drastically reduce the animation.

The highlight should simply appear in its final state.

---

## 23. Tooltip behavior

Reuse the core tooltip metadata, but do not automatically add tooltips to every highlight.

The extension should have a setting:

```text
Show explanations on hover
[ on / off ]
```

When enabled, users can hover or focus a highlight to see:

- Sentiment.
- Emotion, if available.
- Importance.
- Confidence or heuristic score, accurately labeled.
- Explanation, when supported.

Tooltips must:

- remain inside the viewport,
- avoid clipping,
- work near page edges,
- work with keyboard focus where the highlight itself is focusable through the extension UI,
- not interfere with page interaction.

A CSS-only tooltip is preferred for the basic mode.

---

## 24. Popup UI

Create a simple extension popup.

Example:

```text
┌──────────────────────────────┐
│ textheat                     │
│                              │
│ Highlight this page          │
│ [ ON ]                       │
│                              │
│ Sensitivity                  │
│ More ───────●────── Less     │
│                              │
│ ☑ Animate highlights         │
│ ☐ Show explanations          │
│                              │
│ Theme                        │
│ [ Default             ▼ ]    │
│                              │
│ [ Settings ]                 │
└──────────────────────────────┘
```

The popup should communicate the current state of the active tab.

Changing settings should update the current page without requiring a reload where practical.

---

## 25. Per-site control

Allow the user to disable textheat for the current site.

Example:

```text
textheat

✓ Enabled on this site

[ Disable on this site ]
```

Store site-level preferences using extension storage.

Do not collect browsing history.

Do not transmit visited URLs to a remote service.

The default architecture should perform all analysis locally.

---

## 26. Global enable/disable

Provide:

```text
Enabled globally
```

When globally disabled:

- Do not inject highlighting.
- Do not analyze page content.
- Do not start expensive observers unnecessarily.

When re-enabled:

- Process the current page.
- Do not require a full browser restart.

---

## 27. Extension settings

Store settings using:

```ts
chrome.storage.local
```

only. Preferences and explicit hostname overrides must not be synchronized with a browser account. Storage failures must be reported to the UI; do not silently fall back to sync or pretend a failed save succeeded.

Settings should include:

```ts
interface ExtensionSettings {
  enabled: boolean;
  threshold: number;
  animate: boolean;
  showTooltips: boolean;
  theme: string;
  respectReducedMotion: boolean;
  processCode: boolean;
}
```

Add site-specific overrides separately:

```ts
interface SiteSettings {
  enabled: boolean;
  threshold?: number;
}
```

Do not store page text, analysis results, or browsing history in any storage area. The implemented settings schema is authoritative in extension/shared/settings.ts; mode defaults to Off and the palette defaults to Adaptive.

---

## 28. Messaging

Use a small typed message protocol between:

- popup,
- content script,
- service worker.

For example:

```ts
type ExtensionMessage =
  | {
      type: "GET_STATE";
    }
  | {
      type: "SET_ENABLED";
      enabled: boolean;
    }
  | {
      type: "SET_SETTINGS";
      settings: Partial<ExtensionSettings>;
    }
  | {
      type: "REPROCESS_PAGE";
    };
```

Keep messaging explicit and typed.

Do not send full page text through the service worker.

Analysis should happen in the content-script context using the local library.

---

## 29. Service worker responsibilities

Keep the Manifest V3 service worker lightweight.

It should handle:

- extension lifecycle,
- storage,
- settings,
- popup communication,
- optional commands/context-menu integration.

It should **not** receive and process all webpage text.

Do not make the service worker a bottleneck.

---

## 30. Security and privacy

The extension should be designed around local processing.

### Must not

- Send page text to a remote server.
- Send browsing history to analytics.
- Inject arbitrary remote JavaScript.
- Use `eval`.
- Use remote code.
- Preserve third-party page HTML as executable markup.
- Insert page-provided strings into extension UI without escaping.

### Permissions

Request the minimum permissions necessary.

Prefer the smallest practical set of:

```json
{
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"]
}
```

If `<all_urls>` can be avoided through optional host permissions, prefer that model.

Document why any requested permission is required.

---

## 31. Content Security Policy

Follow Manifest V3 extension CSP requirements.

Do not use:

```ts
eval()
new Function()
```

Do not load executable JavaScript from a remote URL.

Bundle the textheat engine with the extension.

All extension UI should work under a restrictive CSP.

---

## 32. Browser compatibility

Primary target:

- Chrome.
- Edge.
- Brave.
- Other Chromium browsers supporting Manifest V3.

Keep Firefox compatibility in mind.

Avoid unnecessary Chrome-only APIs when a WebExtensions equivalent exists.

Where APIs differ, isolate browser-specific code behind a small compatibility layer.

---

## 33. SPA and dynamic-content examples

The extension should be tested conceptually against:

### Static article

```html
<article>
  <h1>An Amazing Product</h1>
  <p>The design is wonderful.</p>
  <p>The service is terrible.</p>
</article>
```

Expected:

- Heading and paragraphs are processed.
- Highlights animate as they become visible.

### Infinite feed

```text
Initial posts
↓
User scrolls
↓
New posts inserted
↓
MutationObserver detects them
↓
IntersectionObserver waits for visibility
↓
textheat analyzes them
↓
Highlights animate in
```

### Expandable content

```text
Read more
↓
User clicks
↓
New content becomes visible
↓
IntersectionObserver processes it
↓
Highlights animate
```

---

## 34. Animation design

The visual animation should feel like a **soft sweep/highlight**, not a flashing effect.

Target qualities:

- 300–700ms typical duration.
- Ease-out or similarly gentle timing.
- No layout shift.
- No text movement.
- No flicker.
- No repeated animation.
- No animation when reduced motion is requested.

Allow a small randomized or deterministic stagger between nearby highlights only if it remains subtle.

For example:

```text
wonderful     → highlight begins
terrible      → highlight begins shortly afterward
```

Do not make the page feel like a word-by-word slideshow.

A recommended default is to animate each highlight independently based on its visibility rather than creating a global sequential animation for the whole page.

---

## 35. Visibility behavior

The extension should distinguish between:

```text
processed
```

and:

```text
animated
```

A highlight can be analyzed before it is visible, but its animation should be tied to visibility.

For example:

```ts
interface HighlightState {
  analyzed: boolean;
  rendered: boolean;
  animated: boolean;
}
```

This prevents expensive analysis from being repeated while still producing the desired visual effect.

---

## 36. Page background treatment

In addition to individual word highlights, the extension may provide a very subtle **page-level activation treatment**.

When textheat first activates on a page, animate the visual system into place rather than instantly changing every visible highlight.

Do not tint the entire webpage aggressively.

Prefer a subtle initial transition such as:

```text
page activated
    ↓
eligible visible text identified
    ↓
highlight layers appear softly
    ↓
individual emotional terms animate in
```

The page itself should otherwise remain visually unchanged.

If a page-level background effect is implemented, it must be opt-in or extremely subtle and must not obscure content.

---

## 37. Shadow DOM and web components

The extension should support ordinary DOM content first.

For Shadow DOM:

- Do not assume all shadow roots are accessible.
- Support open shadow roots where practical.
- Do not attempt to penetrate closed shadow roots.
- Avoid breaking encapsulation.

If supporting open shadow roots, document the behavior clearly.

Do not monkey-patch `attachShadow()` solely to gain access to future content.

---

## 38. Iframes

Treat iframes carefully.

Do not assume the extension can inspect cross-origin iframe content.

For same-origin or otherwise permitted frames, support can be added if it fits the browser permission model.

The initial implementation may explicitly document:

> Cross-origin iframe contents are not processed.

Do not attempt to bypass browser security boundaries.

---

## 39. Editable content

Do not alter user-editable content by default.

Exclude:

```html
<textarea>
<input>
[contenteditable]
```

This avoids interfering with:

- typing,
- cursor placement,
- selection,
- undo/redo,
- IME composition,
- spellchecking,
- framework-controlled editors.

If editable-content support is ever added, it should be a separate, opt-in feature.

---

## 40. Framework compatibility

The extension must avoid fighting frameworks.

For React/Vue/etc. pages:

- Do not modify framework-managed text unnecessarily.
- Expect the framework to replace DOM nodes.
- Detect replacement through MutationObserver.
- Avoid causing continuous mutation cycles.

Generated highlight spans are extension-owned DOM.

Mark them clearly so they can be ignored by mutation processing.

---

## 41. Cleanup and disable behavior

When the user disables textheat for the current page, provide a clean way to remove extension-created highlights.

The original text must be restored exactly.

For example:

```html
<span class="textheat-extension-highlight">wonderful</span>
```

should become:

```text
wonderful
```

without changing surrounding markup.

Do not reload the page merely to disable the extension.

Implement:

```ts
disable()
enable()
destroy()
```

for the content-script controller.

`destroy()` must:

- disconnect observers,
- cancel queued jobs,
- remove extension-created DOM,
- remove extension event listeners,
- restore original text nodes,
- release references where possible.

---

## 42. Navigation cleanup

When a page navigates:

- Clear obsolete processing state.
- Disconnect observers tied to removed DOM.
- Avoid retaining references to old documents.
- Initialize against the new document.

Do not leak memory across SPA navigations.

---

## 43. Error handling

A single problematic webpage must not break the extension.

Wrap individual processing jobs so that:

```text
one bad text node
≠
extension failure
```

If analysis fails:

- Leave the original text untouched.
- Log useful information in development mode.
- Avoid exposing errors to ordinary users.
- Continue processing other content.

Never replace content with an error message.

---

## 44. Performance instrumentation

In development mode, optionally collect local timing information:

```ts
{
  textNodesProcessed: 120,
  highlightsCreated: 34,
  analysisTimeMs: 17,
  renderTimeMs: 8,
  queueTimeMs: 4
}
```

Do not send this telemetry anywhere.

Provide a development/debug flag rather than shipping noisy console output by default.

---

## 45. Testing

Use Vitest or an equivalent framework.

Use a DOM environment such as:

- happy-dom,
- jsdom,

for unit/integration tests where appropriate.

Test:

### DOM preservation

- Original parent elements remain.
- Attributes remain.
- Links remain clickable.
- Forms remain functional.

### Text correctness

- Exact text is preserved.
- Whitespace is preserved.
- Unicode is preserved.
- Copy/paste remains correct.

### Analysis integration

- Uses the shared textheat analyzer.
- Thresholds match the core package.
- Sentiment labels match the core package.
- Importance values match the core package.

### Idempotency

- Processing the same node twice does not create nested highlights.

### Visibility

- IntersectionObserver triggers processing.
- Highlight animation only occurs once.
- Already animated highlights remain stable.

### Dynamic content

- MutationObserver detects inserted content.
- Extension-generated mutations are ignored.
- New content gets processed.

### Cleanup

- Disable restores original DOM.
- Destroy disconnects observers.
- No extension-created spans remain after cleanup.

### Accessibility

- Reduced-motion behavior works.
- No unnecessary focus targets.
- Screen-reader text is not duplicated.

### Security

- Page text is never interpreted as HTML.
- No page-controlled event handlers are created.
- No remote scripts are loaded.

---

## 46. End-to-end testing

Provide a local test page containing:

- Long paragraphs.
- Headings.
- Links.
- Lists.
- Tables.
- Code blocks.
- Forms.
- Dynamically inserted content.
- Hidden content.
- Expandable content.
- Unicode.
- HTML-looking text.
- Positive, negative, mixed, neutral, and negated sentiment.

Example:

```html
<p>
  I absolutely love this wonderful product.
  Unfortunately, the service is terrible.
</p>

<p>
  This sentence is completely neutral and should not become colorful.
</p>

<p>
  The result is not good.
</p>
```

The test page should allow developers to verify the entire extension lifecycle.

---

## 47. Suggested project structure

Extend the existing repository without obscuring the core library:

```text
textheat/
  src/
    core/
      tokenize.ts
      lexicon.ts
      sentiment.ts
      importance.ts
      calibration.ts
      analyze.ts

    render/
      escape-html.ts
      render-html.ts
      themes.ts

    browser/
      mount.ts
      tooltips.ts

    extension/
      controller.ts
      scanner.ts
      text-node-processor.ts
      intersection-observer.ts
      mutation-observer.ts
      render-highlight.ts
      animation.ts
      exclusions.ts
      cleanup.ts

    api/
      index.ts

  extension/
    manifest.json

    background/
      service-worker.ts

    content/
      content.ts
      styles.css

    popup/
      popup.html
      popup.ts
      popup.css

    options/
      options.html
      options.ts
      options.css

    shared/
      messages.ts
      settings.ts

  styles/
    textheat.css
    textheat-dark.css

  demo/
    extension-test-page.html

  tests/
    core/
    extension/

  README.md
  DESIGN.md
  DESIGN_BROWSER_EXTENSION.md
  package.json
  tsconfig.json
```

Adapt as needed, but keep the extension layer separate from the reusable core.

---

## 48. Build and packaging

Provide a dedicated extension build.

For example:

```bash
npm run build
npm run build:extension
npm test
npm run test:extension
```

The extension build should produce a directory suitable for:

```text
Chrome → Extensions → Developer mode → Load unpacked
```

Also provide a production ZIP artifact if practical.

Do not bundle unnecessary development dependencies into the extension.

Minimize the final extension footprint.

---

## 49. Browser extension manifest

Create a valid Manifest V3 manifest.

Conceptually:

```json
{
  "manifest_version": 3,
  "name": "textheat",
  "version": "0.1.0",
  "description": "Reveal emotionally significant language as you read the web.",
  "permissions": [
    "storage"
  ],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"],
      "css": ["content/styles.css"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options/options.html"
}
```

This is illustrative.

Use the minimum permissions and fields actually required by the implementation.

If optional host permissions are preferable, use them.

---

## 50. Browser extension UX principles

The extension should feel:

- quiet,
- fast,
- intelligent,
- unobtrusive,
- local,
- reversible.

Avoid:

- giant overlays,
- banners,
- intrusive notifications,
- aggressive colors,
- excessive motion,
- constant tooltips,
- unexplained network activity.

The core interaction should be almost invisible:

```text
Install
↓
Open a page
↓
Turn on textheat
↓
Read normally
↓
Emotional language subtly emerges as you scroll
```

---

## 51. Definition of done

The browser extension is complete when:

1. It builds as a Manifest V3 extension.
2. It uses the existing `textheat` core analyzer.
3. It does not duplicate sentiment logic.
4. It processes eligible webpage text without replacing the page's DOM wholesale.
5. It safely preserves original text and structure.
6. It uses `IntersectionObserver` to progressively process visible/near-visible content.
7. It uses `MutationObserver` to handle dynamically inserted content.
8. Highlights animate in when they become visible.
9. Highlights animate only once.
10. `prefers-reduced-motion` is respected.
11. Threshold and theme settings reuse the core textheat concepts.
12. The extension can be enabled/disabled without reloading the page.
13. Disabling restores the original text.
14. Links, selection, copying, forms, and page interactions remain functional.
15. Cross-origin iframe limitations are handled honestly.
16. No page text is sent to a remote service.
17. No remote executable code is loaded.
18. The extension has automated tests for DOM safety, visibility, mutation handling, cleanup, and accessibility.
19. A local test page demonstrates static and dynamic content.
20. The extension's generated artifacts can be loaded into a Chromium browser and used on real webpages.

---

## 52. Implementation workflow

Implement in this order:

1. Reuse and verify the existing browser-safe `textheat` package entry point.
2. Define the extension settings and typed message protocol.
3. Implement safe text-node discovery.
4. Implement exclusion rules.
5. Implement DOM-preserving highlight rendering.
6. Implement idempotent processing state.
7. Add `IntersectionObserver`.
8. Add highlight animation.
9. Add `MutationObserver` and batching.
10. Add SPA/dynamic-content handling.
11. Add enable/disable and cleanup.
12. Add popup controls.
13. Add options/settings UI.
14. Add reduced-motion and accessibility behavior.
15. Add performance instrumentation in development mode.
16. Add unit and DOM integration tests.
17. Add a local end-to-end test page.
18. Build the extension.
19. Verify the generated Manifest V3 artifacts.
20. Test on several real-world page shapes.
21. Document browser limitations and privacy behavior.

Do not stop at pseudocode. Create the working implementation in the repository, run the tests, and report any limitations honestly.

The final extension should make `textheat` feel like a native reading experience rather than a webpage-rewriting script.
