import { contrasts, intensifiers, lexicon, negators } from './lexicon';
import { tokenize as tokenizeForClauses } from './tokenize';
import type { Aspect, Clause, Label, PartOfSpeech, Prediction, TaggedToken, Token } from './types';

const pronouns = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'what', 'who', 'something', "i'm", "i've", "you're", "we're", "they're", "he's", "she's", "it's"]);
const determiners = new Set(['a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'these', 'those', 'some', 'every']);
const verbs = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'can', 'could', 'must', 'think', 'believe', 'feel', 'seem', 'seems', 'look', 'looks', 'arrived', 'contains', 'works', 'work', 'makes', 'made', 'see', 'comes', 'costs', 'want', 'expected', 'expect', 'say', 'said', 'lacks']);
const emotionalNouns = new Set(['disappointment', 'failure', 'disaster', 'waste', 'joy', 'anger', 'fear', 'error', 'defect', 'defects', 'flaw', 'flaws', 'failures', 'glitch', 'glitches', 'malfunction', 'malfunctions']);
const opinionVerbs = new Set(['love', 'loved', 'loves', 'like', 'likes', 'liked', 'hate', 'hated', 'hates', 'enjoy', 'enjoyed', 'enjoys', 'adore', 'adores', 'recommend', 'recommends']);
const emotionalVerbs = new Set([...opinionVerbs, 'fail', 'failed', 'crash', 'crashes', 'crashed']);
const prepositions = new Set(['of', 'for', 'in', 'on', 'at', 'to', 'with', 'from', 'by', 'about', 'as', 'than', 'into', 'without']);
const adverbs = new Set(['not', 'never', 'only', 'constantly', 'again', 'always', 'often', 'just', 'quite', 'almost', 'maybe', 'perhaps', 'probably', 'certainly', 'apparently', 'also', 'still', 'next', 'here', 'there', 'now', 'then', 'well', 'less', 'more', 'merely', 'simply', 'enough']);

/** Compact deterministic POS hints, not a trained tagger or dependency parser. */
export function tagTokens(tokens: Token[]): TaggedToken[] {
  return tokens.map(token => {
    const word = token.normalized;
    let pos: PartOfSpeech = 'unknown';
    if (token.kind === 'punctuation') pos = 'punctuation';
    else if (pronouns.has(word)) pos = 'pronoun';
    else if (determiners.has(word)) pos = 'determiner';
    else if (contrasts.has(word) || ['and', 'or', 'because', 'if', 'when', 'unless'].includes(word)) pos = 'conjunction';
    else if (prepositions.has(word)) pos = 'preposition';
    else if (verbs.has(word) || emotionalVerbs.has(word) || negators.has(word) && word !== 'not' && word !== 'never') pos = 'verb';
    else if (intensifiers.has(word) || adverbs.has(word) || /ly$/u.test(word) && !lexicon.has(word)) pos = 'adverb';
    else if (emotionalNouns.has(word)) pos = 'noun';
    else if (lexicon.has(word) || ['new', 'old', 'customer', 'emotional'].includes(word) || /(?:ful|less|ous|ive|able|ible)$/u.test(word)) pos = word === 'customer' ? 'noun' : 'adjective';
    else if (/^[\p{L}\p{M}]+$/u.test(word)) pos = 'noun';
    return { ...token, pos };
  });
}

export function evidenceLabel(evidence: Prediction[]): Label {
  let positive = 0, negative = 0, uncertainty = 0;
  for (const p of evidence) {
    if (p.score > 0) positive += p.score; else negative -= p.score;
    uncertainty += Math.abs(p.score) * (1 - (p.confidence ?? p.heuristicConfidence));
  }
  const total = positive + negative;
  return total === 0 ? 'neutral' : uncertainty / total > 0.5 ? 'uncertain'
    : Math.min(positive, negative) / total >= 0.2 ? 'mixed' : positive > negative ? 'positive' : 'negative';
}

type Target = { first: number; last: number };
/** Explicit noun lists directly before a copula only; at most 3 targets of 3 nouns. */
function coordinatedSubjects(text: string, tagged: TaggedToken[]): Map<number, Target[]> {
  const groups = new Map<number, Target[]>();
  const isNoun = (i: number) => tagged[i]?.pos === 'noun' && !emotionalNouns.has(tagged[i]!.normalized);
  const space = (i: number) => i >= 0 && /^[ \t]+$/u.test(text.slice(tagged[i]!.end, tagged[i + 1]!.start));
  for (let i = 0; i < tagged.length; i++) {
    if (!['is', 'are', 'was', 'were'].includes(tagged[i]!.normalized)) continue;
    const targets: Target[] = [];
    let j = i - 1;
    while (j >= Math.max(0, i - 18) && targets.length < 3 && isNoun(j) && space(j)) {
      const last = j;
      while (isNoun(j - 1) && last - j < 2 && space(j - 1)) j--;
      if (isNoun(j - 1)) break; // Refuse overlong compounds rather than truncate them.
      targets.unshift({ first: j, last });
      if (tagged[j - 1]?.pos === 'determiner' && space(j - 1)) j--;
      if (tagged[j - 1]?.normalized !== 'and' || !space(j - 1)) break;
      j -= 2;
    }
    if (targets.length >= 2 && tagged[j - 1]?.normalized !== 'and'
      && (j === targets[0]!.first || j === targets[0]!.first - 1 && tagged[j]?.pos === 'determiner')) groups.set(i, targets);
  }
  return groups;
}

export function segmentClauses(text: string, tokens = tokenizeForClauses(text)): Omit<Clause, 'evidence' | 'sentiment'>[] {
  const clauses: Omit<Clause, 'evidence' | 'sentiment'>[] = [];
  const subjectConjunctions = new Set<number>();
  for (const [copula, targets] of coordinatedSubjects(text, tagTokens(tokens))) {
    for (let i = targets[0]!.first; i < copula; i++) if (tokens[i]!.normalized === 'and') subjectConjunctions.add(i);
  }
  let start = 0, contrast = false;
  const push = (end: number) => {
    let left = start, right = end;
    while (left < right && /\s/u.test(text[left]!)) left++;
    while (right > left && /\s/u.test(text[right - 1]!)) right--;
    if (left < right) clauses.push({ text: text.slice(left, right), start: left, end: right, contrast });
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (i && /[\r\n]/u.test(text.slice(tokens[i - 1]!.end, token.start))) { push(tokens[i - 1]!.end); start = token.start; contrast = false; }
    if (!subjectConjunctions.has(i) && (contrasts.has(token.normalized) || ['and', 'or', 'because'].includes(token.normalized))) {
      push(token.start); start = token.end; contrast = contrasts.has(token.normalized);
    } else if (token.kind === 'punctuation' && /[.!?;:,]/u.test(token.text)) {
      push(token.end); start = token.end; contrast = false;
    }
  }
  push(text.length);
  return clauses;
}
/** Linear merge of ordered clauses and evidence, plus bounded noun-phrase search. */
export function analyzeContext(text: string, tokens: Token[], evidence: Prediction[]): { clauses: Clause[]; aspects: Aspect[]; ambiguity: string[] } {
  const tagged = tagTokens(tokens);
  const subjectGroups = coordinatedSubjects(text, tagged);
  const clauses: Clause[] = [];
  const aspects = new Map<string, Aspect>();
  const ambiguity = new Set<string>();
  let candidateIndex = 0, tokenIndex = 0;
  let previousTarget: Target[] | undefined;
  let previousSegmentEnd = 0;
  let segmentTokenIndex = 0;
  for (const segment of segmentClauses(text, tokens)) {
    while (segmentTokenIndex < tagged.length && tagged[segmentTokenIndex]!.end <= segment.start) segmentTokenIndex++;
    let segmentTokenEnd = segmentTokenIndex;
    while (segmentTokenEnd < tagged.length && tagged[segmentTokenEnd]!.start < segment.end) segmentTokenEnd++;
    const segmentTokens = tagged.slice(segmentTokenIndex, segmentTokenEnd);
    const canInherit = previousTarget !== undefined && /^\s*(?:and|or)\s*$/iu.test(text.slice(previousSegmentEnd, segment.start))
      && !segmentTokens.some(t => t.pos === 'pronoun' || t.pos === 'noun');
    const inheritedTarget = canInherit ? previousTarget : undefined;
    let currentTarget: typeof previousTarget;
    const items: Prediction[] = [];
    while (candidateIndex < evidence.length && evidence[candidateIndex]!.start < segment.end) {
      const p = evidence[candidateIndex++]!;
      if (p.start >= segment.start) items.push(p);
    }
    clauses.push({ ...segment, evidence: items, sentiment: evidenceLabel(items) });
    while (tokenIndex < tagged.length && tagged[tokenIndex]!.end <= segment.start) tokenIndex++;
    for (const p of items) {
      for (const reason of p.ambiguity ?? []) ambiguity.add(reason);
      while (tokenIndex < tagged.length && tagged[tokenIndex]!.end <= p.start) tokenIndex++;
      // Prefer the closest preceding noun phrase; e.g. "customer service was awful".
      let noun = -1;
      // Explicit opinion verbs take the object, not the subject. No pronoun resolution.
      let opinion = false;
      for (let j = tokenIndex; j < Math.min(tagged.length, tokenIndex + 16) && tagged[j]!.end <= p.end; j++) {
        if (opinionVerbs.has(tagged[j]!.normalized)) { opinion = true; break; }
      }
      // Negation spans can include their subject: "don't think the interface is good".
      const absenceFrame = p.rules?.some(rule => rule === 'absence-of-negative' || rule === 'lack-of-positive');
      for (let j = tokenIndex; !opinion && !absenceFrame && j < Math.min(tagged.length, tokenIndex + 16); j++) {
        const t = tagged[j]!;
        if (t.end > p.end) break;
        if (t.pos === 'noun' && !emotionalNouns.has(t.normalized)) noun = j;
      }
      for (let j = tokenIndex - 1; !opinion && j >= Math.max(0, tokenIndex - 10); j--) {
        if (noun >= 0) break;
        const t = tagged[j]!;
        if (t.start < segment.start) break;
        if (t.pos === 'noun' && !emotionalNouns.has(t.normalized)) { noun = j; break; }
      }
      // Transitive opinion verbs/adjectives may precede their object: "love the interface".
      if (noun < 0) for (let j = tokenIndex; j < Math.min(tagged.length, tokenIndex + 8); j++) {
        const t = tagged[j]!;
        if (t.end > segment.end) break;
        if (t.start >= p.end && (t.pos === 'pronoun' || t.pos === 'verb' || t.pos === 'conjunction' || t.pos === 'punctuation')) break;
        if (t.start >= p.end && t.pos === 'noun' && !emotionalNouns.has(t.normalized)) { noun = j; break; }
      }
      if (noun < 0 && !inheritedTarget) continue;
      let first = noun, last = noun;
      if (noun < 0) { first = inheritedTarget![0]!.first; last = inheritedTarget![0]!.last; }
      else {
        while (first > segmentTokenIndex && noun - first < 2 && tagged[first - 1]!.pos === 'noun'
          && !emotionalNouns.has(tagged[first - 1]!.normalized) && /^[ \t]+$/u.test(text.slice(tagged[first - 1]!.end, tagged[first]!.start))) first--;
        // An opinion can precede a compound object: "excellent customer service".
        while (last + 1 < segmentTokenEnd && last - first < 2 && tagged[last + 1]!.pos === 'noun'
          && !emotionalNouns.has(tagged[last + 1]!.normalized) && /^[ \t]+$/u.test(text.slice(tagged[last]!.end, tagged[last + 1]!.start))) last++;
      }
      let targets: Target[] = noun < 0 ? inheritedTarget! : [{ first, last }];
      if (!opinion) for (let j = Math.max(segmentTokenIndex, tokenIndex - 8); j < tokenIndex; j++) {
        const group = subjectGroups.get(j);
        if (group && group.some(target => noun >= target.first && noun <= target.last)) targets = group;
      }
      if (targets.length > 1 || opinion && noun >= 0) {
        const rule = targets.length > 1 ? 'coordinated-explicit-targets' : 'opinion-verb-object';
        p.rules ??= [];
        if (!p.rules.includes(rule)) p.rules.push(rule);
        p.explanation += targets.length > 1 ? ' Target rule: shared copular predicate applies to each explicit noun phrase (no coreference).'
          : ' Target rule: opinion verb takes the following explicit object, not its preceding subject.';
      }
      currentTarget = targets;
      for (const target of targets) {
        const start = tagged[target.first]!.start, end = tagged[target.last]!.end;
        const key = `${start}:${end}`;
        const aspect = aspects.get(key) ?? { text: text.slice(start, end), start, end, sentiment: 'neutral' as Label, evidence: [], method: 'rule-based-proximity' as const };
        aspect.evidence.push(p); aspect.sentiment = evidenceLabel(aspect.evidence); aspects.set(key, aspect);
      }
    }
    previousTarget = currentTarget;
    previousSegmentEnd = segment.end;
    segmentTokenIndex = segmentTokenEnd;
  }
  return { clauses, aspects: [...aspects.values()], ambiguity: [...ambiguity] };
}