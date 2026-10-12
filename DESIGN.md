Here is the complete textheat master prompt in plain Markdown, ready to copy into Cursor, Claude Code, GitHub Copilot, or another coding agent.

Writing

# Build textheat — A Self-Contained, Calibrated Text Highlighting Engine

Act as a senior TypeScript engineer, NLP researcher, and open-source library architect.

Build **textheat**, a self-contained sentiment-analysis library that analyzes text, identifies emotionally significant words and phrases, and returns HTML markup with colored background highlights.

The primary developer experience must be extremely simple:

```
text.heat("I love this product, but the customer service is terrible.");
```

This should return an HTML string containing the original text with appropriately highlighted words and phrases.

The library must work without an external API, API key, remote service, or mandatory machine-learning dependency. It must also provide a CLI, a structured analysis API, optional hover tooltips, and modular core functions that developers can import and use anywhere.

Use Reinforcement Learning for Calibrated Decisions (RLCD) as inspiration for the decision-making and calibration architecture. Do not claim to implement RLCD training unless an actual reinforcement-learning training procedure is implemented and evaluated. Build an honest, self-contained baseline with replaceable components and measurable calibration.

---

## 1\. Primary API: `text.heat()`

Make this the main API that developers encounter.

### Browser usage

HTMLWrap linesCopy codePreview

```
<div id="output"></div>

<script type="module">
  import text from "./dist/textheat.browser.js";

  const input =
    "I love the design, but the performance is terrible.";

  document.querySelector("#output").innerHTML =
    text.heat(input);
</script>
```

The returned markup should visually highlight emotionally significant words and phrases using inline spans and CSS classes.

Example of the intended output:

HTMLWrap linesCopy codePreview

```
I <span
  class="textheat-highlight textheat-positive"
  data-sentiment="positive"
  data-importance="0.86"
>love</span>
the design, but the performance is
<span
  class="textheat-highlight textheat-negative"
  data-sentiment="negative"
  data-importance="0.93"
>terrible</span>.
```

The example markup is illustrative. Actual scores and labels must come from the analysis engine.

### Requirements for `text.heat()`

- Accept a string as its primary argument.
- Return an HTML string.
- Preserve the original wording, punctuation, whitespace, and order.
- Highlight words and multiword phrases where appropriate.
- Use consistent CSS class names.
- Escape HTML-sensitive characters in the original input before inserting markup.
- Never insert untrusted text into HTML without escaping it.
- Support configurable themes and thresholds.
- Work without requiring the developer to initialize a model.
- Remain synchronous for the built-in local analyzer.

Support an optional configuration object:

```
text.heat(input, {
  threshold: 0.3,
  showTooltips: true,
  showImportance: false,
  theme: "default"
});
```

Also support a convenient method for returning the analysis separately:

```
const result = text.analyze(input);
const html = text.heat(input);
```

Keep the API intuitive and avoid unnecessary configuration.

---

## 2\. Hover effects and explanatory tooltips

When `showTooltips: true`, the markup returned by `text.heat()` should include accessible hover information.

For example, hovering over "terrible" could display:

- Sentiment: Negative.
- Emotion: Anger or frustration, when supported by the analyzer.
- Importance: 0.93.
- Confidence: The available, properly defined estimate.
- Explanation: A negative evaluative term contributing to the sentence's overall sentiment.

These values are illustrative, not hardcoded predictions.

Use `data-*` attributes or another documented, safe mechanism to attach analysis metadata.

Provide a lightweight optional stylesheet for the highlights and tooltips. The core HTML generation must not require a UI framework.

Tooltips must:

- Work with mouse hover and keyboard focus.
- Be accessible to screen readers.
- Remain usable on mobile devices.
- Avoid obscuring large sections of text.
- Escape tooltip content properly.
- Be optional, with no unnecessary markup when disabled.

Offer both a simple CSS-only tooltip mode and an optional JavaScript enhancement for richer interactive tooltips.

---

## 3\. Expose the core scripts

Do not hide the actual functionality behind a single monolithic function.

Expose independent, documented functions that developers can import individually.

Required public functions:

```
import {
  analyze,
  heat,
  tokenize,
  scoreSentiment,
  scoreImportance,
  calibrate,
  renderHTML,
  escapeHTML,
  getTheme
} from "textheat";
```

Implement the following responsibilities:

- `analyze(text, options?)`: Return the full structured analysis.
- `heat(text, options?)`: Return highlighted HTML.
- `tokenize(text)`: Identify tokens and preserve exact character offsets.
- `scoreSentiment(tokens, context?)`: Evaluate sentiment and contextual polarity.
- `scoreImportance(tokens, context?)`: Estimate each word or phrase's emotional importance.
- `calibrate(predictions, options?)`: Apply a supported calibration method when calibration parameters are available.
- `renderHTML(text, analysis, options?)`: Convert an existing analysis into safe HTML.
- `escapeHTML(text)`: Escape text for safe insertion into an HTML text context.
- `getTheme(nameOrOptions?)`: Return a resolved theme configuration.

Keep the core functions independent of the browser DOM so they can run in Node.js, scripts, build tools, and server-side rendering.

Provide additional browser-only helpers when needed, such as:

```
text.mount(element, input, options);
text.update(element, input, options);
text.destroy(element);
```

These helpers should be optional conveniences, not requirements for basic usage.

---

## 4\. Multiple package entry points

Organize the package so developers can use it in different environments.

### Browser

```
import text from "textheat";

const html = text.heat("The service was wonderful.");
```

### Named imports

```
import { heat, analyze } from "textheat";

const html = heat("The service was wonderful.");
const data = analyze("The service was wonderful.");
```

### Node.js

```
import text from "textheat";

console.log(text.heat("This was disappointing."));
```

### CommonJS, where practical

```
const textheat = require("textheat");

console.log(textheat.heat("This was fantastic."));
```

Provide package exports for:

- The default API.
- Named core functions.
- The browser entry point.
- Optional stylesheets.
- The CLI executable.

Use TypeScript declarations and document any environment-specific limitations. The package must not reference `document` or `window` at module initialization in its Node.js entry point.

---

## 5\. Self-contained sentiment analysis

Build a fast local analysis engine with no mandatory external services.

Use a modular pipeline:

1. Tokenization and character-offset tracking.
2. Lexical sentiment scoring.
3. Phrase recognition.
4. Negation and intensifier handling.
5. Contextual polarity adjustments.
6. Emotional category assignment.
7. Importance scoring.
8. Uncertainty handling.
9. Overall sentiment aggregation.
10. HTML rendering.

The default analyzer can use a compact, maintainable sentiment lexicon and contextual rules.

Recognize common expressions such as:

- "excellent"
- "wonderful"
- "love"
- "terrible"
- "awful"
- "disappointing"
- "frustrating"
- "not good"
- "not bad"
- "very good"
- "extremely disappointing"

Do not simply color every word in a sentiment dictionary. Use context to determine whether a word should actually be highlighted.

For example:

- "good" is usually positive.
- "not good" is generally negative.
- "not bad" is often mildly positive or neutral.
- "very good" conveys stronger positivity than "good".
- "The food was excellent, but the service was awful" contains mixed sentiment.

Handle negation scope, contrast words, intensifiers, contractions, punctuation, and Unicode text.

Recognize that sarcasm, implicit sentiment, and domain-specific meanings are difficult for a lightweight lexical system. Document these limitations honestly.

---

## 6\. Emotion categories and visual themes

Use these default colors:

| Category | Background | Text |
| --- | --- | --- |
| Positive | `#D1FAE5` | `#065F46` |
| Negative | `#FEE2E2` | `#991B1B` |
| Joy | `#FEF3C7` | `#92400E` |
| Anger | `#FFEDD5` | `#9A3412` |
| Sadness | `#DBEAFE` | `#1E40AF` |
| Fear or anxiety | `#EDE9FE` | `#5B21B6` |
| Surprise | `#CFFAFE` | `#155E75` |
| Neutral or uncertain | No highlight by default | Inherit |

Keep polarity and emotional category separate. Anger and sadness can both have negative polarity but should not necessarily share the same color.

Provide customizable themes:

```
text.configure({
  theme: {
    positive: {
      background: "#D1FAE5",
      color: "#065F46"
    },
    negative: {
      background: "#FEE2E2",
      color: "#991B1B"
    }
  }
});
```

Avoid mutable global configuration that can cause unexpected behavior between unrelated consumers. Prefer per-call configuration and an optional explicitly created instance.

---

## 7\. Importance and calibrated decisions

Every highlighted word or phrase should have a normalized importance score between 0 and 1.

Importance should estimate how much the span contributes to the emotional interpretation of the text.

Consider:

- Sentiment strength.
- Emotional specificity.
- Context.
- Negation.
- Intensifiers.
- Phrase-level meaning.
- Contribution to overall polarity.

Keep importance separate from model confidence.

Implement a local scoring baseline and a separate calibration interface. If labeled calibration data is unavailable, describe confidence as a heuristic or uncalibrated score instead of presenting it as a statistically calibrated probability.

Support configurable highlighting thresholds:

- Low threshold: Show more candidate words.
- Medium threshold: Show only meaningful emotional terms.
- High threshold: Show only the strongest terms.

Support abstention: if the engine cannot reliably assign a category, omit the colored highlight or use a neutral uncertainty style.

If implementing statistical calibration, evaluate it on labeled held-out data using metrics such as Brier score, log loss, and expected calibration error.

Do not describe a dictionary score or a manually assigned importance score as reinforcement learning.

---

## 8\. Analysis result schema

Return a stable, documented object:

```
{
  text: "I love this, but it is terrible.",
  sentiment: {
    label: "mixed",
    probabilities: {
      positive: 0.0,
      negative: 0.0,
      neutral: 0.0,
      mixed: 0.0,
      uncertain: 0.0
    }
  },
  highlights: [
    {
      text: "love",
      start: 2,
      end: 6,
      sentiment: "positive",
      emotion: "joy",
      importance: 0.0,
      confidence: null
    }
  ],
  metadata: {
    analyzer: "lexical-baseline",
    calibrated: false
  }
}
```

This schema is illustrative. Implement actual scoring rather than returning the displayed example values.

The sentiment probability distribution must be mathematically valid if the analyzer explicitly defines its entries as probabilities. If the local baseline cannot justify calibrated probabilities, expose raw scores separately and document how any normalized distribution is derived.

Use zero-based, end-exclusive character offsets and preserve the original Unicode text exactly.

---

## 9\. Safe HTML rendering

Security is a core requirement because the main output is HTML.

Correct usage:

```
const html = text.heat(userSuppliedText);
element.innerHTML = html;
```

Make this safe by construction:

- Escape all user-provided text before adding markup.
- Escape any dynamic attribute or tooltip value.
- Restrict generated class names to known values.
- Never execute or preserve user-supplied HTML as markup.
- Never inject untrusted strings into inline JavaScript or CSS.
- Validate highlight offsets and ensure they cannot create malformed HTML.
- Prevent overlapping highlights from corrupting the output.
- Document that generated markup must not be modified to bypass the escaping safeguards.

Add security tests using inputs such as:

```
<script>alert(1)</script>
<img src=x onerror=alert(1)>
I love this <b>product</b>.
```

The resulting HTML should display those strings as text rather than execute or activate the supplied markup.

Also offer a DOM rendering helper that uses `createElement` and `textContent` rather than `innerHTML`, for consumers who prefer DOM-based rendering.

---

## 10\. Command-line interface

Create a CLI called `textheat`.

Examples:

```
textheat "I love this product, but the service is terrible."
```

```
textheat analyze --file review.txt
```

```
textheat analyze "This is fantastic!" --format json
```

```
textheat analyze "This is fantastic!" --format html
```

```
textheat analyze "This is fantastic!" --threshold 0.8 --no-color
```

Support:

- Inline text.
- UTF-8 files.
- JSON output.
- HTML output.
- Plain-text output.
- Terminal color output.
- Threshold configuration.
- Emotion filters.
- Helpful errors.
- `--help` and `--version`.

The CLI must use the same core functions as the JavaScript package. Do not implement a separate sentiment algorithm for the command line.

---

## 11\. Demonstrations

Provide working examples for the following.

### Positive

Input:

"The new design is absolutely beautiful."

Highlight "absolutely beautiful" using the positive theme.

### Negative

Input:

"The delivery was slow and the packaging was awful."

Highlight "slow" and "awful" using negative colors.

### Mixed

Input:

"I love the interface, but the app crashes constantly."

Highlight "love" positively and "crashes constantly" negatively.

### Negation

Input:

"The result was not good."

Do not mark "good" as unconditionally positive.

### Neutral

Input:

"The package arrived on Tuesday and contains three books."

Avoid highlighting ordinary factual words without sufficient evidence.

### Browser demo

Build a small webpage with:

- A textarea.
- Live highlighted output.
- An optional tooltip toggle.
- An importance-threshold slider.
- A color legend.
- Several example sentences.
- A light theme and optional dark theme.

---

## 12\. Testing and packaging

Use TypeScript, a lightweight build system, and Vitest or an equivalent testing framework.

Test:

- All public API entry points.
- CLI output and exit codes.
- Negation and phrase recognition.
- Unicode and exact character offsets.
- HTML escaping and XSS protection.
- Overlapping phrases.
- Empty and large inputs.
- Custom themes.
- Tooltip accessibility.
- Node.js imports without browser globals.
- ESM and CommonJS compatibility where supported.
- Performance and memory usage.

Provide:

- README.
- API reference.
- Installation instructions.
- Browser and Node.js examples.
- TypeScript declarations.
- CSS themes.
- Demo webpage.
- Tests.
- npm package configuration.
- License and dependency attribution.
- Publishing instructions.

---

## 13\. Suggested project structure

```
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
    api/
      index.ts
    cli/
      index.ts
  styles/
    textheat.css
    textheat-dark.css
  examples/
    node-example.ts
    browser-example.html
    custom-theme.ts
  demo/
  tests/
  README.md
  package.json
  tsconfig.json
```

Adapt this structure as needed, but maintain clear module boundaries.

---

## 14\. Implementation workflow

1. Define the public API and output schema.
2. Implement the tokenizer and sentiment lexicon.
3. Implement contextual scoring and importance ranking.
4. Implement `heat()` and safe HTML rendering.
5. Expose all core functions through package exports.
6. Add themes and optional tooltips.
7. Implement the CLI using the same core.
8. Build the browser demo.
9. Add security, correctness, and performance tests.
10. Document calibration limitations and extension points.
11. Build the distributable package and verify the actual generated artifacts.

Do not stop at pseudocode. Create the working implementation in the repository, run the tests, and report any limitations honestly.

## Definition of done

A developer can install textheat, call `text.heat(textString)` to obtain safely escaped, color-highlighted HTML, enable optional tooltips, import individual core functions, analyze text in Node.js, use the CLI, customize the themes, and run the test suite without requiring an external API or machine-learning service.