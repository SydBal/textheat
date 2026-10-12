# textheat

**Give words a little color.** A synchronous, self-contained English sentiment highlighting library. No API keys, external services, model downloads, or runtime dependencies.

```ts
import text from 'textheat';
text.heat('I love this product, but the customer service is terrible.');
```

Returns escaped HTML with contextual highlights. Inline colors work without a stylesheet. Polarity and emotion are separate: “love” has positive polarity and a joy color; “beautiful” uses the positive color.

For a step-by-step explanation of word selection, contextual scoring, thresholds, and color choice, see [How highlighting works](docs/HIGHLIGHTING_ALGORITHM.md).

The returned HTML preserves source whitespace. Set `white-space: pre-wrap` on your output container to preserve line breaks and repeated spaces visually in the browser.

## Install and run

Install the published package with `npm install textheat` (publication is a separate step). Node.js 20+ is supported for the library and CLI. Development tooling requires Node.js 22.12+ or 20.19+.

From this repository:

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The last command serves the live playground. `npm run demo:build` creates a deployable static site with the extension download ZIP, social preview PNG, privacy information, and an explanation of the highlighting algorithm. Set `TEXTHEAT_SITE_URL` to the real public deployment URL before building so social crawlers get absolute preview URLs; see [website deployment](docs/WEBSITE_DEPLOYMENT.md). On Windows PowerShell with restricted scripts, use `npm.cmd` instead of `npm`.

After building, run `node examples/node-example.mjs` or `node examples/custom-theme.mjs` for working Node.js examples. The browser example can be served over HTTP with the built distribution alongside it.

## Options

```ts
text.heat('The result was not good.', {
  threshold: 0.3,
  showTooltips: true,
  showImportance: true,
  theme: 'default', // 'dark' or category overrides
  minConfidence: 0.5 // heuristic correctness cutoff by default
});
const result = text.analyze('This is fantastic!');
```

Threshold and minimum confidence must be finite values from 0 to 1. An `emotions` array restricts highlights to selected emotional categories. Neutral text is not highlighted. Overall sentiment uses all lexical candidates, independently of display thresholds.

## Core imports and independent instances

```ts
import {
  analyze, heat, tokenize, scoreSentiment, scoreImportance,
  calibrate, renderHTML, escapeHTML, getTheme, createTextheat
} from 'textheat';

const text = createTextheat({ theme: 'dark' });
const another = text.configure({ threshold: 0.8 }); // NEW instance, not mutation
```

Default and named imports are available in ESM and CommonJS. For CommonJS use `const { heat, analyze } = require('textheat')`. Default API instances only expose `heat`, `analyze`, and immutable `configure`; use named imports for independent core functions.

The frozen, read-only `lexiconStats` object reports `{ entries: 5642, words: 1637, phrases: 4005, maxPhraseWords: 12 }`. Its intended public API is a named root/core export, also available through the browser entry point—not a property on the default `text` instance. **The core object currently exists but its public API re-export is still missing**; see [the statistics contract and integration caveat](docs/API.md#lexicon-statistics). Counts describe unique merged dictionary keys, not source rows or accuracy.

## Browser and tooltips

```ts
import text from 'textheat/browser';
import 'textheat/styles.css';
text.mount(document.querySelector('#output'), 'The service was wonderful.', {
  showTooltips: true
});
// text.update(element, newText, options); text.destroy(element);
```

`mount` and `update` use `createElement` and `textContent`, not `innerHTML`. These helpers also enable dismissible JavaScript tooltips with hover, keyboard focus, tap, and Escape. `renderDOM(element, text, analysis, options)` renders an existing analysis without attaching listeners. `enhanceTooltips(element)` enhances generated HTML and returns a cleanup function. `destroy` removes mounted content and listeners.

The Node entry point never reads browser globals. For direct browser ESM imports, build first and import the standalone **dist/textheat.browser.js** bundle, as in [the browser example](examples/browser-example.html). Native browsers cannot resolve bare package imports without a bundler or import map.

`heat` with `showTooltips` adds focusable spans with escaped `aria-label` and `data-textheat-tooltip` metadata. Include the optional stylesheet for CSS-only hover/focus explanations. On mobile tap a span to focus it, or prefer the enhanced mode for predictable tap/dismiss behavior and viewport positioning. CSS-only mode is intentionally basic; use enhanced mode for WCAG-style dismissible, hoverable tooltips. Screen readers receive the same explanation through the accessible label. Tooltips add no separate nodes when disabled. `showImportance: false` omits the importance attribute and tooltip field.

Without an explicit theme, DOM rendering samples the surrounding page surface and adapts the category palette, maintaining at least 4.5:1 contrast within each opaque highlight pair. Call `update` after your application changes theme, or obtain a fresh palette with `getPageTheme(element)` from `textheat/browser`. Images/gradients use solid background fallbacks. Explicit `theme: 'default'`, `theme: 'dark'`, and custom themes keep their exact colors; core string rendering remains static and DOM-independent. The optional dark stylesheet also exposes `.textheat-dark` class rules. Custom colors accept **six-digit hex only**, intentionally rejecting CSS expressions, URLs, and declarations.

## CLI

```sh
textheat "I love this, but the service is terrible."
textheat analyze --file review.txt --format json
textheat analyze "This is fantastic!" --format html
textheat analyze "This is fantastic!" --threshold 0.8 --no-color
textheat analyze --file - --format json
textheat --help
```

Formats: `json`, `html`, `plain`, and `terminal` (default, ANSI colors only on a TTY). `--emotions joy,anger` filters highlights. `--no-color` and `NO_COLOR` suppress ANSI. `--` terminates option parsing. File inputs use UTF-8. Errors go to stderr with exit code 1. Plain and terminal output remove unsafe control characters; JSON and HTML preserve the original text safely. After a local build use `node dist/cli.js` in place of `textheat`.

## Honest analysis and calibration

This is an **original lexical/rule baseline**, not an ML model or reinforcement-learning implementation. Inspired by calibrated decision architectures, it separates contextual scoring, importance, correctness heuristics, calibration, and abstention.

- Longest multiword matches, negators and contractions, degree modifiers, punctuation, and contrasts.
- Offsets are zero-based, end-exclusive **JavaScript UTF-16 code units**, exactly usable with `text.slice(start, end)`; not code-point or grapheme counts.
- Importance measures bounded emotional strength plus specificity, not confidence.
- `confidence` is `null` by default. `heuristicConfidence` is a hand-defined, **uncalibrated** correctness estimate, not a statistical probability.
- Overall `scores` are raw evidence totals. `distribution` divides nonnegative scores by their sum. It sums to 1 but is **not a calibrated class probability distribution**. See [API reference](docs/API.md) for the exact formula.
- `calibrate` supports an externally parameterized Platt transform. No calibration dataset, fitted parameters, RL training, or held-out accuracy claims are bundled. Supplying parameters marks externally calibrated mode; the caller must fit and validate those parameters. This does not calibrate overall sentiment.
- Unknown/factual words produce no highlights; low-correctness estimates can abstain via `minConfidence`.

English only. Sarcasm, implicit sentiment, domain-specific meanings, complex negation, quoted opinions, and ambiguous emotions remain limitations. Unicode is preserved but non-English emotional vocabulary is not modeled. The originally authored vocabulary contains **5,642 unique entries: 1,637 words and 4,005 phrases**, with longest matches up to **12 words**. There is **no external corpus**, imported lexicon, or training dataset. Domain-review phrases include constrained combinations of compatible authored subjects/predicates in a local “the SUBJECT was PREDICATE” template, not unrestricted noun/adjective generation or semantic parsing. More keys and template combinations do not imply measured accuracy. Original baseline entries override the earlier expansion, which overrides domain additions; all 1,392 legacy entries retain their scores/emotions.

## Deeper fast analysis

The default pipeline now also provides:

- **VADER-inspired rules** (an original implementation, not the VADER package): mixed-case capitalization, up to three exclamation marks, bounded degree modifiers, contrast, and negation across up to eight preceding tokens.
- **Phrase composition:** “great disappointment” takes the negative noun's polarity instead of painting “great” positive.
- **Bounded contextual reasoning:** additive “not only/just/merely/simply” and certainty “no/without doubt” do not reverse a predicate, but another real negator still can. Listed negative-noun absence (“without errors,” “free of bugs,” “free from problems”) and listed positive-noun lack (“lack of support,” “lacks reliability”) multiply by **-0.7** before external negation; aliases supply an existing lexeme only inside these exact frames. Adjacent less/more scales seven listed positive qualities by **0.65/1.15**, not blanket reversal. Internal words of a longest dictionary phrase keep its authored reading. See [the exact lists, scope limits, multipliers, and precedence](docs/HIGHLIGHTING_ALGORITHM.md#3-adjust-the-evidence-using-nearby-context).
- **Deterministic POS hints:** `tagTokens(tokenize(text))` returns grammatical hints using compact word sets and suffix rules. This is **not a trained POS tagger or full dependency parser**; unknown alphabetic words default to candidate nouns.
- **Clause analysis:** `segmentClauses(text)` preserves exact offsets and splits at punctuation, newlines, contrast, and `and`/`or`/`because`, except `and` within a recognized coordinated subject list. `analysis.clauses` includes sentiment and evidence even if display thresholds hide it.
- **Aspect attribution:** `analysis.aspects` connects nearby noun phrases to emotional evidence. “The interface is beautiful, but the app crashes constantly” produces interface → positive and app → negative. Compound targets work before or after opinions (“excellent customer service”), up to **three noun tokens**. Explicit `and`-coordinated subjects immediately before `is`/`are`/`was`/`were` can share a predicate: at most **three targets**, each at most **three words**, within an **18-token** backward window. Coordinated predicates such as “the interface is good and beautiful” share the same explicit target and retain both pieces of evidence. Inheritance is limited to `and`/`or` without a new noun or pronoun subject; it does not cross sentence/contrast boundaries. Listed opinion verbs prefer a following explicit object: “The interface loved the navigation” targets navigation, not interface. This is bounded rule-based proximity, not a semantic parser or coreference: it does not invent an aspect for “I love it.”
- **Ambiguity and abstention:** bounded preceding `if`/`unless`/`would`/`could` and listed hedges retain lexical scores but set heuristic correctness to **0.44**. Listed “too ADJECTIVE to ACTION” and negated “QUALITY enough” frames also set **0.44**, without arbitrary adjective reversal. Questions and a narrow “Great, another crash” irony pattern likewise lower heuristic correctness below the default **0.50** display cutoff. `analysis.ambiguity` explains cues; each prediction's `rules` and `ambiguity` arrays expose the decision path. This is not general sarcasm detection or hypothetical understanding.

The added fields are clause/aspect evidence, not model probabilities. Raising the highlight threshold does not remove this deeper evidence. POS hints, clause splitting, and aspect attribution are heuristic and can misinterpret grammar, noun phrases, and subject/object relationships.

The demo reports recognized versus displayed emotional spans and opinions without an identifiable target. Expand **“Why was this phrase highlighted—or omitted?”** to inspect per-phrase explanations, low-threshold omissions, and uncertainty abstention. A vocabulary miss is reported explicitly rather than treated as evidence of neutrality. Lowering thresholds cannot recognize unfamiliar vocabulary; no fixed dictionary covers every new phrase. The bundled regression tests include actual typed-text DOM updates, not only preset sentences.

## Optional native browser model

```ts
import { analyzeWithNative, nativeAvailability } from 'textheat/browser';

const availability = await nativeAvailability();
const result = await analyzeWithNative(input, {
  native: { mode: 'auto', timeoutMs: 15000 }
});
console.log(result.aspects);             // Always available: fast local evidence
console.log(result.metadata.native);    // Used, skipped, unavailable, error or aborted
console.log(result.modelAssessment);    // Optional independent native-model opinion
```

This uses **only a feature-detected `globalThis.LanguageModel` Prompt API**, not a paid API, remote inference, downloaded JavaScript ML runtime, or silent polyfill. Native support depends on browser version, secure context/permissions, hardware, languages, and browser-managed model availability. An installed browser does not guarantee an installed usable model. The helper can also safely return local results in Node.js or unsupported browsers.

Default `auto` mode requests a second opinion only when there are ambiguity cues, mixed/uncertain sentiment, or nonempty input with no visible highlights. `always` explicitly requests one regardless of local evidence. These functions are asynchronous; `heat` and `analyze` remain synchronous and never invoke a model. Native text is limited to 12,000 UTF-16 units; larger inputs retain local analysis.

**No model download is initiated by default.** If availability is `downloadable` or `downloading`, `allowDownload: true` must be supplied explicitly from a user-activation handler (for example a clearly labeled download button). Browser-managed downloads can be substantial and require disk space; the caller must explain the download and obtain consent. Model storage/download requirements are not the lightweight library's size. The demo offers explicit download consent and an opt-in debounced automatic mode only for a ready model. There is no automatic native inference on page load.

`native.signal` cancels a request. Availability, creation, and prompting share a timeout (default 10 seconds); sessions are destroyed and late-created sessions are cleaned up. Unsupported APIs, missing models, errors, invalid output, aborts, and timeouts all retain local results with status metadata. The API uses JSON-constrained output, but still validates every model label, explanation, span, offset, Unicode boundary, and overlap before exposing it. Consumers must use `textContent` or HTML escaping for model explanations; structured model output is data, not HTML.

`modelAssessment` contains a separate `label`, `explanation`, `confidence: null`, and validated evidence spans. It **does not overwrite local highlights, clauses, aspects, sentiment scores or calibration flags**. Disagreement is useful information, not proof the model is correct. Native model confidence is not fabricated. See [the current browser Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api) for platform requirements.

## Browser extension

The repository includes a Manifest V3 extension with **Off / Auto / Manual** modes, progressive animated page highlights, adaptive page-aware colors by default, current-site controls, and Manual hotkeys for the whole page, click-to-check text, and selection analysis. Analysis stays local; no page text is collected, transmitted, or stored, and preferences use local storage only (not browser sync). Build with `npm run build:extension`, then load the generated extension directory unpacked in Chrome/Edge. `npm run demo:build` also packages the downloadable ZIP for the website. See [extension installation, permissions, and limitations](docs/EXTENSION.md).

## Security and safe rendering

All text and attributes are escaped. Category classes are allowlisted, themes have a narrow safe grammar, offsets are validated, and overlapping, mismatched, or invalid spans throw. Rendering never treats supplied HTML as markup. Do not decode or concatenate untrusted markup into generated HTML. With a strict CSP that blocks inline styles, use the default stylesheet classes; custom themes and per-call dark inline colors require an appropriate style policy. The DOM renderer avoids HTML parsing entirely.

## Development, performance, and publishing

`npm test` runs API, contextual scoring, Unicode, XSS, DOM/accessibility, large-input, and CLI tests. Build artifacts and package exports are additionally verified by `npm run test:package` after `npm run build`. Runtime work is linear in tokens plus sorting output spans; lexicon matching and modifier windows are bounded. Tests use generous performance budgets, not a throughput guarantee. A repeatable Node benchmark reports time and heap deltas via `npm run benchmark` after building.

Before publishing, run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:package`, `npm run demo:build`, `npm audit`, and `npm pack --dry-run`. Check package name availability and ownership, version, license, and tarball contents. `npm publish --access public` publishes only when run by an authorized maintainer; this repository does not auto-publish. `prepack` rechecks types/tests/build. See [API](docs/API.md) and [calibration guidance](docs/CALIBRATION.md).

MIT licensed. The lexicon and implementation are original. No third-party runtime dependencies or downloaded datasets. Development dependency licenses are distributed by their respective packages; see [dependency attribution](docs/ATTRIBUTION.md).