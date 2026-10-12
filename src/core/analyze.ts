import { tokenize } from './tokenize';
import { scoreSentiment } from './sentiment';
import { scoreImportance } from './importance';
import { calibrate } from './calibration';
import { shouldHighlight, validateOptions } from './options';
import { analyzeContext } from './context';
import type { Analysis, Label, Options } from './types';

export function analyze(text: string, options: Options = {}): Analysis {
  validateOptions(options);
  const tokens = tokenize(text);
  const candidates = calibrate(scoreImportance(scoreSentiment(tokens, { text })), options.calibration);
  let positive = 0, negative = 0;
  for (const p of candidates) { if (p.score > 0) positive += p.score; else negative -= p.score; }
  const total = positive + negative;
  const uncertain = candidates.reduce((sum, p) => sum + (1 - (p.confidence ?? p.heuristicConfidence)) * Math.abs(p.score), 0);
  const scores: Record<Label, number> = { positive, negative, neutral: total === 0 ? 1 : 0.2, mixed: Math.min(positive, negative) * 2, uncertain };
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const distribution = Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, value / sum])) as Record<Label, number>;
  const label: Label = total === 0 ? 'neutral' : uncertain / total > 0.5 ? 'uncertain' : Math.min(positive, negative) / total >= 0.2 ? 'mixed' : positive > negative ? 'positive' : 'negative';
  return { text, sentiment: { label, scores, distribution }, highlights: candidates.filter(p => shouldHighlight(p, options)), ...analyzeContext(text, tokens, candidates),
    metadata: { analyzer: 'lexical-baseline', calibrated: !!options.calibration, confidenceKind: options.calibration ? 'externally-calibrated' : 'heuristic', distributionKind: 'normalized-heuristic-scores', language: 'en', tokenCount: tokens.length } };
}