import { analyze, heat } from '../dist/index.js';
const sample = 'I love the design, but the app crashes constantly. 🧡\n';
analyze(sample); heat(sample);
for (const repetitions of [100, 1000, 10000]) {
  const input = sample.repeat(repetitions);
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  const result = analyze(input);
  const analyzed = performance.now();
  const html = heat(input);
  console.log(JSON.stringify({ utf16Units: input.length, spans: result.highlights.length, analyzeMs: +(analyzed - start).toFixed(2), heatMs: +(performance.now() - analyzed).toFixed(2), heapDeltaMB: +((process.memoryUsage().heapUsed - before) / 1024 / 1024).toFixed(2), htmlUnits: html.length }));
}