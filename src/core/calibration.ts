import type { CalibrationOptions, Prediction } from './types';

/** Platt transform of heuristic confidence. Parameters must be fitted externally. */
export function calibrate(predictions: Prediction[], options?: CalibrationOptions): Prediction[] {
  if (!options) return predictions.map(p => ({ ...p, confidence: null }));
  if (options.method !== 'platt' || !Number.isFinite(options.a) || !Number.isFinite(options.b)) throw new TypeError('Calibration requires method platt and finite a/b parameters');
  return predictions.map(p => {
    const h = Math.min(1 - 1e-6, Math.max(1e-6, p.heuristicConfidence));
    const z = options.a * Math.log(h / (1 - h)) + options.b;
    const confidence = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
    return { ...p, confidence };
  });
}