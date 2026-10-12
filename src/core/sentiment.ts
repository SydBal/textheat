import { contrasts, intensifiers, lexicon, maxPhraseWords, negators } from './lexicon';
import { recognizeNounContext } from './noun-context';
import type { Prediction, ScoringContext, Token } from './types';

const clamp = (n: number, max: number) => Math.max(-max, Math.min(max, n));
const negativeHeads = new Set(['disappointment', 'failure', 'disaster', 'waste', 'problem', 'mess', 'pain', 'defect', 'defects', 'flaw', 'flaws', 'failures', 'glitch', 'glitches', 'malfunction', 'malfunctions']);
const hedges = new Set(['maybe', 'perhaps', 'might', 'may', 'could', 'possibly', 'apparently', 'seems', 'seem']);
const scopeBoundaries = new Set(['and', 'or', 'because', 'if', 'unless', 'when']);
// Aliases are used ONLY inside explicit absence frames, never as new standalone lexemes.
const absentNegativeHeads = new Map([['bugs', 'buggy'], ['errors', 'error'], ['problems', 'problem'], ['delays', 'slow']]);
const lackingPositiveHeads = new Map([['support', 'helpful'], ['reliability', 'reliability']]);
const comparedQualities = new Set(['useful', 'reliable', 'helpful', 'efficient', 'responsive', 'intuitive', 'usable']);
const excessQualities = new Set(['slow', 'fast', 'difficult', 'easy', 'reliable', 'useful', 'expensive', 'complicated']);
/** Bounded noun frames before lexical terms; exact phrases retain precedence.
 * Modifiers stop at punctuation and clause boundaries.
 */
export function scoreSentiment(tokens: Token[], context: ScoringContext = {}): Prediction[] {
  const predictions: Prediction[] = [];
  let clauseStart = 0;
  let contrastWeight = 1;
  const hasMixedCase = tokens.some(t => t.kind === 'word' && t.text !== t.text.toUpperCase());
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === 'punctuation') {
      if (/[.!?;:,\n]/u.test(token.text)) { clauseStart = i + 1; contrastWeight = 1; }
      continue;
    }
    if (context.text && i > 0 && /[\r\n]/u.test(context.text.slice(tokens[i - 1]!.end, token.start))) clauseStart = i;
    if (contrasts.has(token.normalized)) { clauseStart = i + 1; contrastWeight = 1.1; continue; }
    if (scopeBoundaries.has(token.normalized)) clauseStart = i;
    const adjacent = (left: number, right: number) => left >= clauseStart && tokens[left]?.kind === 'word'
      && tokens[right]?.kind === 'word' && (!context.text || /^[ \t]+$/u.test(context.text.slice(tokens[left]!.end, tokens[right]!.start)));
    const previousWord = tokens[i - 1]?.normalized;
    const beforePrevious = tokens[i - 2]?.normalized;
    const absenceStart = absentNegativeHeads.has(token.normalized) && adjacent(i - 1, i)
      ? previousWord === 'without' ? i - 1
        : ['of', 'from'].includes(previousWord ?? '') && beforePrevious === 'free' && adjacent(i - 2, i - 1) ? i - 2 : -1
      : -1;
    const lackStart = lackingPositiveHeads.has(token.normalized) && adjacent(i - 1, i)
      ? previousWord === 'lacks' ? i - 1
        : previousWord === 'of' && beforePrevious === 'lack' && adjacent(i - 2, i - 1) ? i - 2 : -1
      : -1;
    // Avoid reading comparative "like" as emotional, and "not only good" as negation.
    if (token.normalized === 'like' && !['i', 'we', 'you', 'they'].includes(tokens[i - 1]?.normalized ?? '')) continue;
    const nounContext = recognizeNounContext(tokens, i, context.text);
    let length = nounContext?.length ?? 0;
    let entry = nounContext?.entry;
    for (let size = Math.min(maxPhraseWords, tokens.length - i); !nounContext && size > 0; size--) {
      const sequence = tokens.slice(i, i + size);
      if (sequence.some(t => t.kind !== 'word')) continue;
      if (context.text && sequence.some((t, j) => j > 0 && !/^[ \t]+$/u.test(context.text!.slice(sequence[j - 1]!.end, t.start)))) continue;
      const match = lexicon.get(sequence.map(t => t.normalized).join(' '));
      if (match) { entry = match; length = size; break; }
    }
    if (!entry && (absenceStart >= 0 || lackStart >= 0)) {
      entry = lexicon.get((absenceStart >= 0 ? absentNegativeHeads : lackingPositiveHeads).get(token.normalized)!);
      length = 1;
    }
    if (!entry) continue;
    const rules: string[] = [nounContext ? 'contextual-noun-head' : length > 1 ? 'lexical-phrase' : 'lexical-term'];
    const ambiguity: string[] = [];
    const explanations: string[] = [];
    if (nounContext) {
      rules.push(nounContext.observation ? 'negative-noun-observation' : 'negative-noun-composition');
      explanations.push('bounded curated descriptors take polarity from the negative noun head, not the adjective');
      if (nounContext.typo) {
        rules.push('observation-descriptor-typo');
        explanations.push('funcitonal is functional only inside this complete observation frame; no fuzzy lexical matching');
      }
      if (token.normalized === 'dont') {
        rules.push('observation-negator-spelling');
        explanations.push('missing-apostrophe dont is a negator only in this complete observation frame');
      }
    }
    // The emotional head controls polarity in "great disappointment", not the positive adjective.
    const head = tokens[i + length];
    if (!nounContext && entry.score > 0 && head && negativeHeads.has(head.normalized) && (lexicon.get(head.normalized)?.score ?? 0) < 0
      && (!context.text || /^[ \t]+$/u.test(context.text.slice(tokens[i + length - 1]!.end, head.start)))) {
      entry = { ...lexicon.get(head.normalized)!, score: lexicon.get(head.normalized)!.score * 1.15 };
      length++; rules.push('negative-noun-composition');
    }
    let startIndex = i;
    let modifier = 1;
    let negationCount = 0;
    let negationStart = -1;
    // Modal/conditional cues are independent of the previous lexical evidence, but stay
    // inside the same bounded clause. Internal words of dictionary phrases remain intact.
    for (let j = nounContext?.observation ? i : i - 1; j >= Math.max(clauseStart, i - 8); j--) {
      const t = tokens[j]!;
      if (t.kind !== 'word' || contrasts.has(t.normalized) || ['and', 'or', 'because'].includes(t.normalized)) break;
      if (hedges.has(t.normalized) || ['if', 'unless', 'would'].includes(t.normalized)
        || j === i && nounContext?.observation && ["couldn't", "wouldn't", "shouldn't"].includes(t.normalized)) {
        ambiguity.push('Hedged or hypothetical opinion');
        rules.push('hypothetical-scope');
        explanations.push('bounded preceding modal or conditional cue; not an asserted outcome');
        break;
      }
    }
    for (let j = i - 1; j >= Math.max(clauseStart, i - 8); j--) {
      const previous = tokens[j]!;
      if (predictions.length && previous.start < predictions[predictions.length - 1]!.end) break;
      if (previous.kind !== 'word' || scopeBoundaries.has(previous.normalized)) break;
      const factor = intensifiers.get(previous.normalized);
      if (factor) { modifier *= factor; if (j === startIndex - 1) startIndex = j; }
      if (negators.has(previous.normalized)) {
        const next = tokens[j + 1]?.normalized;
        if (adjacent(j, j + 1) && (previous.normalized === 'not' && ['only', 'just', 'merely', 'simply'].includes(next ?? '')
          || previous.normalized === 'no' && next === 'doubt')) {
          rules.push('negation-exception');
          explanations.push('additive not or certainty idiom does not negate the predicate');
        } else { negationCount++; negationStart = j; }
      }
      if (previous.normalized === 'without' && tokens[j + 1]?.normalized === 'doubt' && adjacent(j, j + 1)) {
        rules.push('negation-exception');
        explanations.push('without doubt expresses certainty, not absence of the predicate');
      }
    }
    if (negationStart >= 0) startIndex = Math.min(startIndex, negationStart);
    let score = entry.score * modifier * contrastWeight;
    if (nounContext) {
      // Observation absence uses -0.8: problem -1.7 -> +1.36 / 4 = .34,
      // above the default .3 threshold. Legacy aliases retain their -0.7.
      if (nounContext.observation) {
        score *= -0.8;
        rules.push('absence-of-negative');
        explanations.push('negated observation of a listed negative head, scaled by -0.8 (problem importance 0.34)');
        if (nounContext.negations > 1) {
          score *= -0.7;
          explanations.push('additional internal no reverses the observation by -0.7');
        }
      } else {
        if (nounContext.descriptors) score *= 1.15;
        if (nounContext.negations) score *= -0.7;
        explanations.push('noun composition scales by 1.15 with descriptors; explicit no scales by -0.7');
      }
      if (nounContext.negations) rules.push('negation-scope');
    }
    const absence = length === 1 && absenceStart >= 0 && entry.score < 0;
    const lack = length === 1 && lackStart >= 0 && entry.score > 0;
    if (absence || lack) {
      score *= -0.7;
      startIndex = Math.min(startIndex, absence ? absenceStart : lackStart);
      rules.push(absence ? 'absence-of-negative' : 'lack-of-positive');
      explanations.push(absence ? 'explicit absence of a listed negative noun, scaled by -0.7'
        : 'explicit lack of support or reliability, scaled by -0.7');
      const alias = (absence ? absentNegativeHeads : lackingPositiveHeads).get(token.normalized)!;
      if (!lexicon.has(token.normalized)) explanations.push(`noun uses existing ${alias} lexeme score only in this frame`);
    }
    if (length === 1 && comparedQualities.has(token.normalized) && adjacent(i - 1, i)
      && ['less', 'more'].includes(previousWord ?? '')) {
      score *= previousWord === 'less' ? 0.65 : 1.15;
      startIndex = Math.min(startIndex, i - 1);
      rules.push('comparative-degree');
      explanations.push(previousWord === 'less' ? 'less scales a positive quality by 0.65, without asserting its absence'
        : 'more scales a positive quality by 1.15');
    }
    const negated = negationCount % 2 === 1;
    if (negated) { score *= -0.7; if (!rules.includes('negation-scope')) rules.push('negation-scope'); }
    if (modifier !== 1) rules.push('degree-modifier');
    if (contrastWeight !== 1) rules.push('contrast-emphasis');
    const endToken = tokens[i + length - 1]!;
    const enough = tokens[i + length]?.normalized === 'enough' && adjacent(i + length - 1, i + length);
    const tooTo = length === 1 && excessQualities.has(token.normalized) && previousWord === 'too' && adjacent(i - 1, i)
      && tokens[i + 1]?.normalized === 'to' && adjacent(i, i + 1) && adjacent(i + 1, i + 2)
      && ['use', 'work', 'navigate', 'read', 'afford', 'recommend'].includes(tokens[i + 2]!.normalized);
    if (tooTo || enough && negated && length === 1 && comparedQualities.has(token.normalized)) {
      rules.push(tooTo ? 'excess-to-frame' : 'insufficient-enough-frame');
      ambiguity.push(tooTo ? 'Excess may prevent the stated action' : 'Negated sufficiency does not establish the opposite quality');
      explanations.push('narrow degree frame: retain lexical/negation polarity rather than infer a blanket adjective reversal');
    }
    let exclamations = 0;
    while (exclamations < 3 && tokens[i + length + exclamations]?.text === '!') exclamations++;
    if (exclamations) { score *= 1 + 0.08 * exclamations; rules.push('punctuation-emphasis'); }
    if (hasMixedCase && token.text.length > 1 && token.text === token.text.toUpperCase()) { score *= 1.15; rules.push('capitalization-emphasis'); }
    const forward = tokens.slice(i + length, i + length + 10);
    const untilBoundary: Token[] = [];
    let previousEnd = endToken.end;
    for (const t of forward) {
      if (context.text && /[\r\n]/u.test(context.text.slice(previousEnd, t.start))) break;
      if (contrasts.has(t.normalized) || scopeBoundaries.has(t.normalized)) break;
      if (t.kind === 'punctuation' && /[.!?;:]/u.test(t.text)) { if (t.text === '?') ambiguity.push('Question rather than an asserted opinion'); break; }
      untilBoundary.push(t); previousEnd = t.end;
    }
    if (entry.score > 0 && untilBoundary.some(t => ['another', 'again'].includes(t.normalized))
      && untilBoundary.some(t => (lexicon.get(t.normalized)?.score ?? 0) < -1)) ambiguity.push('Possible ironic praise beside a repeated negative event');
    score = clamp(score, 4);
    const start = tokens[startIndex]!.start;
    const end = endToken.end;
    const spanText = context.text?.slice(start, end) ?? tokens.slice(startIndex, i + length).map(t => t.text).join(' ');
    const contextualNegation = !!nounContext?.negations;
    const heuristicConfidence = ambiguity.length ? 0.44 : negated || contextualNegation || absence || lack ? 0.64 : length > 1 ? 0.86 : 0.78;
    const emotion = negated || contextualNegation || absence || lack ? undefined : entry.emotion;
    predictions.push({ text: spanText, start, end, score, sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
      emotion, importance: 0, confidence: null, heuristicConfidence, rules, ambiguity,
      explanation: `${score > 0 ? 'Positive' : 'Negative'} ${nounContext ? 'contextual noun frame' : `lexical ${length > 1 ? 'phrase' : 'term'}`}${negated ? ', reversed by nearby negation' : ''}${modifier !== 1 ? ', adjusted by a degree modifier' : ''}${contrastWeight !== 1 ? ', emphasized after contrast' : ''}. Rules: ${rules.join(', ')}.${explanations.length ? ` Context: ${explanations.join('; ')}.` : ''}${ambiguity.length ? ` Abstention cue: ${ambiguity.join('; ')}.` : ''} Heuristic English baseline, not a calibrated probability.` });
    i += length - 1;
  }
  return predictions;
}