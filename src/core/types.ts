export type Polarity = 'positive' | 'negative' | 'neutral';
export type Emotion = 'joy' | 'anger' | 'sadness' | 'fear' | 'surprise';
export type Label = Polarity | 'mixed' | 'uncertain';
export type Category = Polarity | Emotion | 'uncertain';
export interface Token { text: string; normalized: string; start: number; end: number; kind: 'word' | 'punctuation' }
export interface Prediction {
  text: string; start: number; end: number; sentiment: Polarity; emotion?: Emotion;
  score: number; importance: number; confidence: number | null;
  heuristicConfidence: number; explanation: string;
  rules?: string[];
  ambiguity?: string[];
}
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun' | 'determiner' | 'conjunction' | 'preposition' | 'punctuation' | 'unknown';
export interface TaggedToken extends Token { pos: PartOfSpeech }
export interface Clause {
  text: string; start: number; end: number; sentiment: Label;
  evidence: Prediction[]; contrast: boolean;
}
export interface Aspect {
  text: string; start: number; end: number; sentiment: Label;
  evidence: Prediction[]; method: 'rule-based-proximity';
}
export interface Analysis {
  text: string;
  sentiment: { label: Label; scores: Record<Label, number>; distribution: Record<Label, number> };
  highlights: Prediction[];
  clauses: Clause[];
  aspects: Aspect[];
  ambiguity: string[];
  metadata: { analyzer: 'lexical-baseline'; calibrated: boolean; confidenceKind: 'heuristic' | 'externally-calibrated'; distributionKind: 'normalized-heuristic-scores'; language: 'en'; tokenCount: number };
}
export interface ThemeColor { background: string; color: string }
export type Theme = Record<Category, ThemeColor>;
export type ThemeInput = 'default' | 'dark' | Partial<Theme>;
export interface CalibrationOptions { method: 'platt'; a: number; b: number }
export interface Options {
  threshold?: number; showTooltips?: boolean; showImportance?: boolean;
  theme?: ThemeInput; emotions?: Emotion[]; minConfidence?: number;
  calibration?: CalibrationOptions;
}
export interface ScoringContext { text?: string }