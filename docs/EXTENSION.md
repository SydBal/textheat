# textheat browser extension

Manifest V3 companion for Chromium browsers (Chrome, Edge, Brave). It bundles the existing public `textheat` package; there is no copied analyzer, second lexicon, remote service, or native model in the extension.

Minimum declared browser version: **Chrome/Chromium 120**. Build-generated PNG icons cover 16/32/48/128 pixels; package and manifest versions are checked for consistency. Compatibility on other Chromium distributions must still be tested rather than assumed from their name.

## Shared expanded analyzer

The shared English dictionary has **5,642 unique entries: 1,637 words and 4,005 phrases**, with a derived maximum of **12 words** per phrase. Vocabulary/scores are originally authored, including constrained compatible domain-review template combinations—not an external corpus, imported lexicon, or training dataset. More entries and combinations do not imply measured accuracy. The library's frozen core `lexiconStats` object reports `{ entries, words, phrases, maxPhraseWords }`; its intended public named export is pending the [API re-export](API.md#lexicon-statistics). Extension settings do not change those counts or scores.

The extension uses the same longest-match precedence and bounded contextual rules as the library: additive “not only/just/merely/simply” and certainty “no/without doubt” exceptions; listed bugs/errors/problems/delays absence via “without” or “free of/from”; support/reliability lack via “lack of” or “lacks”; **-0.7** absence/lack reversal before **-0.7** odd external negation, with emotion removed on reversal; **0.65/1.15** less/more scaling for listed positive qualities. Context-only fallback aliases reuse existing lexeme scores, not invented standalone noun meanings. Negative noun composition uses the listed head's score × **1.15**. See [exact lists, scopes, and scoring precedence](HIGHLIGHTING_ALGORITHM.md#3-adjust-the-evidence-using-nearby-context).

Bounded `if`/`unless`/`would`/`could` and hedges, plus narrowly listed “too ADJECTIVE to ACTION” and negated “QUALITY enough” frames, set heuristic correctness to **0.44**, preserving lexical/negation polarity rather than inventing arbitrary reversals. They normally fail the shared **0.50** minimum correctness filter: lowering sensitivity's importance threshold alone cannot expose them. The analyzer retains withheld clause/aspect evidence, but the current Manual panel lists explanations only for displayed highlights (plus overall sentiment and target count). Exact dictionary phrases retain their authored internal reading before external rules apply.

Aspect metadata can share a copular predicate across at most **three explicit `and`-coordinated subjects**, each up to **three noun tokens**, within **18 tokens** before `is`/`are`/`was`/`were`. Listed opinion verbs prefer a following explicit object, not the preceding subject. This remains a noun-proximity heuristic with no pronoun resolution or semantic parser; it does not change highlight colors.

## Build and install

1. Install dependencies with `npm install` (PowerShell: `npm.cmd install`).
2. Run `npm run build:extension`. This first builds the shared library, then creates **extension-dist/**.
3. In Chrome/Edge → Extensions, enable **Developer mode**, choose **Load unpacked**, and select **extension-dist/**.
4. Pin textheat to the toolbar and click its icon on an ordinary HTTP/HTTPS page.
5. After source changes, rebuild and click **Reload** on the extension card; reload test tabs to replace old content scripts.

The build is local, bundled and MV3 CSP-compatible. No npm publication is required. For the website download, run `npm run demo:build`: it builds the extension, packages and validates the actual downloadable ZIP at **demo/public/downloads/textheat-chrome.zip**, then builds the website with that ZIP at **demo-dist/downloads/textheat-chrome.zip** (served as **/downloads/textheat-chrome.zip**). Extract the downloaded ZIP and select the extracted folder with **Load unpacked**. No store publishing is performed automatically.

## Off / Auto / Manual

- **Off** (default): no text analysis or expensive observers. Previously generated highlights are removed without a page reload. Global mode applies to accessible open tabs.
- **Auto**: progressively processes readable text as it approaches the viewport. Auto asks for optional HTTP/HTTPS website access through a user gesture in the popup. It registers the content script only on permitted hosts. Existing accessible pages are updated as well.
- **Manual**: no automatic page processing until you choose a tool. The popup shows your actual browser shortcut assignments, not assumed keys.
  - **Toggle whole page:** default `Alt+Shift+H`. Starts/stops progressive page highlighting; “whole page” includes distant content when scrolled into view, not an eager body rewrite.
  - **Click to check text:** default `Alt+Shift+C`. Click a readable text block to open a local analysis panel. Escape cancels. Links, buttons and editable controls keep their normal behavior.
  - **Check selected text:** default `Alt+Shift+S`. Select ordinary page text, then use the shortcut or popup button. The analysis panel provides text, polarity, importance and explanations without changing the selected page content.
  - **Clear page highlights:** removes highlights and stops processing this page.

Configure shortcuts in your browser's Extensions → Keyboard shortcuts. Browser/OS conflicts may leave shortcuts unassigned; the popup reports that. Mode and appearance settings are global; disabling the current site overrides them. Manual whole-page on/off state is ephemeral for that tab and document, not stored browsing history.

## Settings

Popup: sensitivity (the shared importance threshold), adaptive/default/dark/high-contrast/custom theme, animation, explanations on hover, and current-site enable/disable. Settings page: reduced-motion preference, optional code processing, viewport preload distance, debug logging, custom six-digit-hex JSON palette and hostname overrides. Site thresholds can be set/reset in Settings.

**Adaptive is the default palette.** It derives highlight colors from the surrounding page surfaces, including light and dark areas on the same page. Each opaque adaptive highlight foreground/background pair has at least **4.5:1 contrast**; this is a guarantee within that pair, not an accessibility certification of the surrounding website or custom palettes. The extension refreshes adaptive colors after page class/style changes and OS color-scheme changes. Images and gradients use a solid-color fallback rather than attempting to infer their pixel colors.

Preferences and explicit hostname overrides are saved only in this browser profile's local extension storage (`chrome.storage.local`), not synchronized with a browser account. Existing local settings remain usable. Old synchronized settings are **not automatically read or migrated**; users who previously relied on sync may need to reconfigure their preferences and site overrides in each browser profile.

Default word highlights introduce **no extra tab stops** or ARIA name duplication. Optional basic hover explanations use the browser's native `title` tooltip; keyboard users can use the explicit Manual analysis panel for full explanations. Native tooltips have browser-controlled styling/placement rather than a custom popup tooltip at every word. The panel has a close button and Escape dismissal. Reduced-motion CSS always removes transitions when requested by the OS; the setting also controls whether JavaScript skips animation setup.

## Architecture and DOM safety

- Public imports from `textheat` / `textheat/browser` reuse exact core analysis. Build bundles that package locally. Settings do not reinterpret sentiment or confidence.
- Text nodes are discovered incrementally with TreeWalker, then direct parent targets are observed with IntersectionObserver (default 300px preload). Highlights animate once when they enter actual visibility.
- Small idle/time-sliced queues bound traversal and work; one job failure leaves the original text unchanged. Single text nodes above 24,000 UTF-16 units are deliberately left unchanged to avoid monopolizing the main thread.
- MutationObserver batches new content and text/visibility changes. Body replacements and framework-rendered replacement nodes are rediscovered without monkey-patching history or frameworks. Unchanged nodes are cached using weak state. Observer targets removed from the document are unobserved.
- Individual text nodes become an owned `display:contents` wrapper with safe spans/text nodes. Surrounding elements, links, attributes, listeners and form state remain. Styling is scoped and has no font-size/padding/margin changes.
- Disabling disconnects observers, cancels work and animations, and restores original text-node identity if the page hasn't edited the wrapper. If a page has edited generated content, cleanup preserves the current text/children instead of restoring stale input.
- No HTML-like page text is parsed as markup. Manual analysis uses DOM `textContent` and the shared safe DOM renderer.

## Permissions and privacy

- `storage`: global settings and explicit hostname overrides, read and written only through `chrome.storage.local`. The extension does not access `chrome.storage.sync`. **No page text, analysis output or browsing history is stored.** Hostname overrides only exist when configured by the user and stay local to this browser profile.
- `activeTab`: temporary access to the current tab for an explicit Manual tool.
- `scripting`: local bundled script/style injection and progressive Auto registration.
- Optional `http://*/*`, `https://*/*`: Auto across permitted websites. Off stops processing and unregisters automatic scripts but does not revoke already granted permissions. Revoke host access in browser extension settings.

All extension analysis runs locally in memory. No telemetry or analytics, text transmission, external requests, remote JavaScript, eval, or remote inference: page text, visited URLs and analysis results are not sent to a server, and saved preferences/hostnames are not sent to browser-account sync by the extension. Protected pages (browser settings, web stores, other extensions), PDF viewers, file URLs and pages where access is denied cannot be processed. The popup reports unavailable access gracefully.

## Limitations

- Main-frame ordinary DOM only. Iframes and shadow-root text are not traversed in this baseline; closed roots and cross-origin frames are never bypassed.
- Page highlighting is **per text node**, not per paragraph or sentence assembled from multiple elements. Longest phrases, eight-token context windows, absence/lack frames, and coordinated targets operate only within that node. An inline element split can therefore prevent a phrase match or lose negation, hypothetical, comparison, or target context; grouping is intentionally deferred rather than rewriting element structure. Manual panels analyze their explicitly collected input as a separate text string, not a semantic reconstruction of the page.
- POS/aspect/sentiment semantics retain the shared English lexical baseline's ambiguity and vocabulary limitations. Unknown alphabetic words are candidate nouns, pronouns are not resolved, and sarcasm, implicit sentiment, unfamiliar expressions, quotations, and complex grammar can be misinterpreted. No evidence/highlight is not proof of neutral meaning; a larger authored dictionary is not an accuracy guarantee.
- Some highly reactive frameworks or styles can still interact with inserted inline spans. Editable regions, controls, SVG/math, code (unless opted in), hidden content, and extension UI are excluded. Reversibility and tests reduce risk but do not guarantee compatibility with every site.
- No extension-store or Firefox certification is claimed. Chrome API usage is isolated to the extension application layer; Firefox would require manifest/API compatibility adaptation.

## Test

The release checklist in [EXTENSION_RELEASE_CHECKLIST.md](EXTENSION_RELEASE_CHECKLIST.md) separates automated checks from the real-browser installation, permissions, and store-submission steps that still need manual verification.

Run `npm run test:extension`, `npm test`, `npm run typecheck`, and `npm run build:extension`. For focused source-only privacy regression checks without rebuilding, run `npx vitest run tests/extension/storage.test.ts tests/extension/background.test.ts`. Tests cover visibility, once-only animation, dynamic updates, SPA body replacement, thresholds/themes, safe text, parent/text-node preservation, links/forms, copy selection, Manual tools, exclusions, cleanup, reduced motion and permission contracts. UI/service-worker tests exercise mode switching, permission denial, shortcuts and settings under mocked extension APIs. Storage tests verify local settings/site roundtrips, ignoring old sync settings, no sync reads/writes, and local-only change handling; background tests cover serialized local read-modify-write updates and validation.

Start `npm run dev` and visit **/extension-test-page.html** for the local lifecycle fixture. It includes long-page scrolling, dynamic insertion, hidden/expandable content, links, lists, table, code, forms, editable text, Unicode and HTML-looking text. Select a Harness mode to test the exact shared controller without installing; leave **Harness Off** when testing the installed extension to avoid two independent controllers.

Automated mocked browser APIs do not prove actual toolbar installation. Follow the load-unpacked steps above for browser permission-dialog and shortcut validation. The fixture separately verifies real DOM observers, scroll behavior and cleanup in a browser.