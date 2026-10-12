# API reference

All core functions are synchronous and DOM-independent. Public types are exported from the root and core entry points.

| Function | Contract |
| --- | --- |
| `analyze(text, options?)` | `Analysis`: overall evidence and filtered highlights. |
| `heat(text, options?)` | Safely escaped highlighted HTML. |
| `tokenize(text)` | `Token[]` including words/contractions and individual punctuation/Unicode symbols; whitespace is omitted, offsets preserved. |
| `scoreSentiment(tokens, {text}?)` | `Prediction[]` with contextual signed scores from -4 to 4, placeholder importance 0, confidence null. Provide the original text for exact phrase text and whitespace-sensitive matching. |
| `scoreImportance(tokensOrPredictions, context?)` | New predictions with importance `min(1, abs(score)/4 + emotionBonus)`; emotion bonus is 0.08. Tokens are scored first. |
| `calibrate(predictions, parameters?)` | New predictions, null confidence without parameters; external Platt transform otherwise. |
| `renderHTML(text, analysis, options?)` | Validates text and spans, applies render thresholds and emits safe HTML. Cannot restore spans filtered out of the analysis. |
| `escapeHTML(text)` | Escapes `&`, `<`, `>`, both quotes for HTML text/quoted attributes; not for JS/CSS/URLs. |
| `getTheme(nameOrOverrides?)` | Fresh resolved category palette. Invalid colors or names throw. |
| `createTextheat(defaults?)` | Frozen independent `heat`, `analyze`, `configure` instance; defaults are copied, per-call options override. `configure` returns a new instance. |
| `tagTokens(tokens)` | Copies tokens with deterministic `pos` hints. Alphabetic unknown words become noun candidates; no statistical grammar model. |
| `segmentClauses(text, tokens?)` | Offset-preserving segments with a contrast flag; pass matching tokens from the same text. |

## Lexicon statistics

The named `lexiconStats` export is available from `textheat` and `textheat/core`, also re-exported from `textheat/browser`. It is not a function or a property of the default instance. Its type is `Readonly<{ entries: number; words: number; phrases: number; maxPhraseWords: number }>` and the object is frozen with `Object.freeze`.

Rebuild the package after source updates to refresh public JavaScript and declarations.

```ts
import { lexiconStats } from 'textheat';
// { entries: 5981, words: 1850, phrases: 4131, maxPhraseWords: 12 }
```

Counts describe **unique merged keys**: **5,981 entries, 1,850 words, 4,131 phrases**, not source rows, coverage percentages, or accuracy. Single-word keys count as words; keys containing spaces count as phrases. The maximum phrase length is derived from the merged keys and remains **12 words**. The latest review layer adds **339 individually authored keys: 213 words and 126 phrases**, with **no template generation in that layer**. Earlier domain layers include constrained compatible review-template combinations; no external corpus, imported dictionary, or training data is used. Merge precedence is original baseline > earlier expansion > domain additions > latest review additions; all 1,392 legacy scores/emotions remain intact. Template expansion does not establish statistical accuracy.

## Contextual scoring contract

`scoreSentiment` first recognizes curated bounded noun frames before individual lexical terms. An existing exact multiword dictionary phrase at the frame's starting token retains precedence; otherwise a complete noun frame consumes its descriptors and head once, rather than highlighting a subjective adjective independently in green inside negative problems. If no frame applies, the longest recognized lexical match, up to **12 words**, is consumed as one span. With `{ text }`, phrase and local-frame gaps must contain only spaces/tabs: punctuation, newlines, and hyphens cannot be bridged. Conjunctions, unknown descriptors, and a fourth descriptor block noun-frame recognition. Internal negators/modals/modifiers of exact dictionary phrases keep their authored reading; only preceding external cues are scanned. Without `{ text }`, offsets still come from tokens, but original whitespace cannot be checked and prediction text is reconstructed with spaces. `analyze` always supplies the original text.

The token `like` is skipped unless immediately preceded by the normalized token `i`, `we`, `you`, or `they`; comparative “looks like” does not generate evidence. This is a narrow lexical guard, not grammatical parsing.

Scoring order is **curated noun-frame recognition (exact starting phrases retain precedence), otherwise longest lexical match → legacy negative-noun composition → degree/contrast → noun-frame scaling → absence/lack → comparative degree → odd external negation → narrow ambiguity → punctuation/capitalization → clamp to [-4, 4]**. Hypothetical cues affect correctness, not polarity. Exact degree factors and full lists are in [the highlighting algorithm](HIGHLIGHTING_ALGORITHM.md#3-adjust-the-evidence-using-nearby-context).

- **Curated noun frames:** a negated observation is **PREFIX VERB [any/a/no] [0–3 DESCRIPTORS] HEAD**. Prefixes: don't, doesn't, didn't, can't, cannot, couldn't, won't, wouldn't, shouldn't, haven't, hasn't, not, never, dont (normalized curly apostrophes also work). Verbs: see, find, notice, detect, encounter, experience, have. Heads, singular/plural: problem/problems, issue/issues, bug/bugs, error/errors, defect/defects, flaw/flaws, glitch/glitches, delay/delays, failure/failures, crash/crashes. Descriptors: functional, technical, major, minor, serious, recurring, performance, usability, operational, structural, critical, intermittent, persistent, significant, severe, unexpected, known, potential, practical. The entire frame is one evidence span with `contextual-noun-head` and `negative-noun-observation`. Use an existing negative head lexeme when available; otherwise contextual-only fallback scores are problem -1.7, issue -2, bug -2.5, error -1.5, defect/flaw/glitch -2, delay -1.5, failure -2.5, crash -2.4 (same for each plural). They never create standalone lexical entries. Observation scales the head by **-0.8**, without the descriptor **1.15** factor; internal `no` adds **-0.7**, and odd external negation later adds **-0.7**. Outside observations, **1–3 DESCRIPTORS HEAD** or **no [0–3 DESCRIPTORS] HEAD** records `negative-noun-composition`: descriptors scale by **1.15**, explicit `no` by **-0.7**. `dont` is not a global negator and applies only in a complete observation frame (`observation-negator-spelling`); `funcitonal` is accepted only there as a descriptor (`observation-descriptor-typo`), not as a lexeme or general fuzzy correction.
- **Composition:** a positive entry immediately before a listed negative head uses that noun's score × **1.15** and emotion. Heads: disappointment, failure, disaster, waste, problem, mess, pain, defect, defects, flaw, flaws, failures, glitch, glitches, malfunction, malfunctions; the head must have a negative standalone lexicon score.
- **External negation:** scan up to **eight preceding tokens**, stopping at non-words, prior consumed evidence, and scope boundaries `and`/`or`/`because`/`if`/`unless`/`when`. Punctuation, commas, newlines, and contrast words establish new scope. An odd count multiplies by **-0.7** once; an even count does not reverse. Adjacent `not only`, `not just`, `not merely`, `not simply`, `no doubt`, and `without doubt` record `negation-exception`; they do not cancel another actual negator. `without` is not itself a general negator.
- **Absence/lack:** adjacent `without NOUN` / `free of NOUN` / `free from NOUN` apply only to bugs/errors/problems/delays with a negative single-word entry; `lack of NOUN` / `lacks NOUN` apply only to support/reliability with a positive single-word entry. Both multiply by **-0.7** and include the prefix in the span. If no lexical entry matches, context-only aliases are bugs → buggy, errors → error, problems → problem, delays → slow, support → helpful, reliability → reliability. Reliability already has its own entry; the other listed nouns currently use fallbacks, not new standalone scores. External negation applies afterward, so `not lack of support` uses $2 \times (-0.7) \times (-0.7) = 0.98$.
- **Comparatives:** immediately preceding `less` / `more` scale single-word useful/reliable/helpful/efficient/responsive/intuitive/usable by **0.65 / 1.15** and join the span; less does not reverse polarity.
- **Hypotheticals/hedges:** an independent eight-token backward scan in the current scope recognizes maybe/perhaps/might/may/could/possibly/apparently/seems/seem/if/unless/would. It stops at non-words, contrasts, and `and`/`or`/`because`, but not earlier lexical evidence. For observation frames the scan includes the starting prefix; couldn't/wouldn't/shouldn't also trigger uncertainty there. Internal dictionary-phrase cues are not rescored. It records `hypothetical-scope` and estimate **0.44**, without changing the signed score. Bounded forward questions also set **0.44**.
- **Narrow degree ambiguity:** adjacent `too ADJECTIVE to ACTION` requires slow/fast/difficult/easy/reliable/useful/expensive/complicated and use/work/navigate/read/afford/recommend. `too` keeps its normal **1.20** multiplier. A listed comparative quality immediately followed by `enough`, with odd external negation, records `insufficient-enough-frame`. Either frame sets **0.44** without any additional polarity reversal; trailing cue words are not added to the span.

All adjacency checks above require word tokens and space/tab-only gaps when text is provided. Ordinary negation, contextual noun-frame negation, absence, or lack removes emotion, even if two reversals restore the original polarity. Heuristic estimate precedence is **ambiguity 0.44 > negation/absence/lack 0.64 > otherwise multiword/composed 0.86 > otherwise single word 0.78**. Here “precedence” means first applicable case, not numeric ordering. Default `confidence` is null; default `minConfidence: 0.5` withholds ambiguous highlights while retaining clause/aspect evidence. Estimates and rules are heuristic, not calibrated probabilities or semantic guarantees.

Verified default outputs (no calibration or emotion filter; importance threshold **0.30**, minimum correctness **0.50**):

| Input / evidence span | Score | Importance | `heuristicConfidence` | Default display |
| --- | ---: | ---: | ---: | --- |
| dont see any functional problems | +1.36 | 0.34 | 0.64 | One full-span positive green highlight; no emotion |
| functional problems | -1.955 | 0.48875 | 0.86 | One negative highlight, no independent green adjective |
| no functional problems | +1.3685 | 0.342125 | 0.64 | One positive green highlight |
| don't see no functional problems | -0.952 | 0.238 | 0.64 | Negative evidence; below importance threshold |
| don't think there are no problems | -0.833 | 0.20825 | 0.64 | Negative evidence; below importance threshold |
| don't think there are no functional problems | -0.95795 | 0.2394875 | 0.64 | Negative evidence; below importance threshold |

“If I dont see any functional problems.” and “I dont see any functional problems?” retain the observation score **+1.36** and importance **0.34**, but correctness **0.44** withholds the highlight. The double-negation rows are bounded composition plus external negation, not general logical parsing. These outputs and precedence/spelling boundaries are covered by [noun-context tests](../tests/noun-context.test.ts). Extension page highlighting runs this contract per text node, so it cannot join a frame split across elements.

## Schema

```ts
interface Analysis {
  text: string;
  sentiment: {
    label: 'positive' | 'negative' | 'neutral' | 'mixed' | 'uncertain';
    scores: Record<Label, number>;
    distribution: Record<Label, number>;
  };
  highlights: {
    text: string; start: number; end: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    emotion?: 'joy' | 'anger' | 'sadness' | 'fear' | 'surprise';
    score: number; importance: number; confidence: number | null;
    heuristicConfidence: number; explanation: string;
    rules?: string[]; ambiguity?: string[];
  }[];
  clauses: Clause[]; // text/start/end, sentiment, evidence, contrast
  aspects: Aspect[]; // text/start/end, sentiment, evidence, method:'rule-based-proximity'
  ambiguity: string[]; // Unique cue descriptions from all evidence
  metadata: {
    analyzer: 'lexical-baseline'; calibrated: boolean;
    confidenceKind: 'heuristic' | 'externally-calibrated';
    distributionKind: 'normalized-heuristic-scores';
    language: 'en'; tokenCount: number;
  };
}
```

The overall evidence sums positive score magnitudes into P and negative magnitudes into N. Mixed evidence is `2 * min(P,N)`. Neutral evidence is 1 for no candidates and 0.2 otherwise. Uncertain evidence is the sum of each magnitude multiplied by `1 - correctnessEstimate`. The distribution divides each of these five scores by their sum. It is a normalized heuristic distribution, **not** a calibrated probability forecast.

The label is neutral with no evidence, uncertain if uncertainty exceeds half of total sentiment magnitude, mixed if minority polarity is at least 20% of total sentiment magnitude, and otherwise the dominant polarity. The label is a rule-based decision, not necessarily the maximum distribution entry.

An aspect can contain multiple coordinated predicate opinions, sharing the original noun-phrase offsets. For example, “The interface is good and beautiful” has one interface aspect with two evidence spans across two clauses. Inheritance across `and`/`or` requires no new noun or pronoun in the following segment and does not cross sentences or contrasts. Compound noun phrases are bounded to **three contiguous noun tokens** with space/tab gaps.

Explicit `and`-coordinated subjects immediately before **is/are/was/were** can receive shared evidence (`coordinated-explicit-targets`): at most **three targets**, each at most **three noun tokens**, within **18 tokens** before the copula, with optional determiners. These recognized subject-list `and` tokens do not split clauses; other `and`/`or`/`because`, contrasts, punctuation, and newlines do. Overlong coordinated lists/compounds are not truncated into a recognized group, though ordinary single-target proximity may still apply.

Listed opinion verbs love/loved/loves/like/likes/liked/hate/hated/hates/enjoy/enjoyed/enjoys/adore/adores/recommend/recommends prefer a following explicit object over the preceding subject (`opinion-verb-object`). Detection is bounded to **16 tokens** inside the evidence span; following-object lookup examines at most **eight tokens** from the span start and stops after the span at a pronoun, verb, conjunction, or punctuation. Ordinary preceding noun lookup examines at most **ten tokens** within the segment. “The interface loved the navigation” targets navigation, while “The interface loved it” has no resolved object aspect.

This is not a semantic parser or pronoun/coreference resolver. Unknown alphabetic words are noun candidates, which can mislead attribution. No aspect is invented when no explicit target can be identified; sentiment evidence still appears in `clauses` independently of `aspects` and display thresholds. A lack of lexical evidence is a coverage limitation, not proof that an unfamiliar statement is neutral. Attribution adds explanatory target rules but does not change scores, confidence, importance, or colors.

Offsets count UTF-16 code units and preserve original input, including Unicode and whitespace. Highlights are non-overlapping, sorted spans. Invalid external analysis throws `TypeError`; invalid numerical options throw `RangeError`. Lexical scores are contextual evidence, not probabilities. Highlight confidence and overall distribution have deliberately separate semantics.

## Browser-only imports

From `textheat/browser`: all core exports plus `mount`, `update`, `destroy`, `renderDOM`, `enhanceTooltips`, and `getPageTheme(element)`. Browser globals are only accessed when these functions are called. Mount/update replace existing children and return analysis. Destroy clears content and mounted listeners. Enhanced tooltip cleanup restores `aria-describedby`, removes listeners/popups, and removes the enhancement class.

DOM rendering without `options.theme` uses `getPageTheme(element)`: a fresh category palette blended with the composited solid ancestor backgrounds, with at least 4.5:1 contrast for each generated text/background pair. Explicit themes keep their exact static/custom colors. Call `update` after changing your application's theme to resample the surface. Images, gradients and unsupported color formats use the solid background fallback; arbitrary page filters/overrides cannot be guaranteed. Core `heat`/`renderHTML` remain DOM-independent with a static default theme.

Also exported: `nativeAvailability()` and `analyzeWithNative(text, { ...options, native?: {mode?:'auto'|'always', allowDownload?:boolean, timeoutMs?:number, signal?:AbortSignal}})`. Both are asynchronous and never contact a remote model service. Availability returns `unsupported`, `unavailable`, `downloadable`, `downloading`, or `available` without downloading. Analysis returns local fields plus `metadata.native` (`status`, `reason`, `source:'browser-prompt-api'`, `confidence:null`) and an optional independent `modelAssessment` (`label`, `explanation`, `confidence:null`, `spans`). Spans quote exact input offsets and carry polarity, optional emotion, and explanation, not importance/probability scores.

Automatic enhancement eligibility includes mixed/uncertain labels, ambiguity cues, or nonempty inputs without highlights. Native failures retain local results. Invalid native options return status `error`; invalid ordinary analysis options still throw according to the core contract. Download opt-in must be called with user activation. Results remain uncalibrated except for any externally parameterized local calibration. Details and browser constraints are in the README.

## Extension points

Pass external predictions through `calibrate`, then supply a valid `Analysis` to the renderers. Use `tokenize` independently, or replace lexical sentiment scoring entirely. External analyzers should supply honest confidence semantics and matching, safe offsets. A custom analyzer is not automatically installed by passing arbitrary options; composition is explicit.