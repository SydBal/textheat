import { scoreSentiment } from './sentiment';
import type { Prediction, ScoringContext, Token } from './types';

/** Emotional strength and specificity, not correctness probability. */
export function scoreImportance(tokens: Token[] | Prediction[], context: ScoringContext = {}): Prediction[] {
  const candidates = tokens.length && 'kind' in tokens[0]! ? scoreSentiment(tokens as Token[], context) : tokens as Prediction[];
  return candidates.map(candidate => ({ ...candidate,
    importance: Math.min(1, Math.max(0, Math.abs(candidate.score) / 4 + (candidate.emotion ? 0.08 : 0)))
  }));
}