import text from '../src/browser/index';
import type { Analysis, Options } from '../src/api/index';
import type { NativeAvailability } from '../src/browser/index';
import { lexiconStats } from '../src/api/index';
import '../styles/textheat.css';
import { startHeroRotation } from './hero';
import { connectEditor } from './editor';
const hero = startHeroRotation();
const input = document.querySelector<HTMLTextAreaElement>('#input')!;
const threshold = document.querySelector<HTMLInputElement>('#threshold')!;
const tooltips = document.querySelector<HTMLInputElement>('#tooltips')!;
const output = document.querySelector<HTMLDivElement>('#output')!;
const editor = connectEditor(input, output);
window.addEventListener('pagehide', () => { editor.destroy(); text.destroy(output); }, { once: true });
const themeButton = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
const examples: Record<string, string> = {
  positive: 'The new design is absolutely beautiful. I love the thoughtful details, and the service was wonderful.',
  negative: 'The delivery was slow and the packaging was awful. This has been extremely disappointing.',
  mixed: 'I love the interface, but the app crashes constantly. The new design is absolutely beautiful, and I’m excited to see what comes next.',
  negation: 'The result was not good. The second attempt was not bad, but I’m not really happy with the finish.',
  neutral: 'The package arrived on Tuesday and contains three books.',
  context: 'The interface is beautiful, but the launch was a great disappointment. I don’t think the support is good. Maybe the next update will be wonderful?',
  joy: 'I am delighted with the results and excited about the next chapter. I love working with this team.',
  anger: 'The repeated errors are frustrating. I am furious that the app is still unusable.',
  sadness: 'I feel sad and disappointed. The ending left me heartbroken.',
  anxiety: 'I am worried about the deadline and anxious about the presentation. The uncertainty makes me afraid.',
  surprise: 'The upgrade was a pleasant surprise. I am astonished by the beautiful new design.',
  aspects: 'The dashboard is intuitive and responsive, but the customer service is rude and frustrating.',
  compound: 'Excellent customer service, but the launch was a great disappointment.',
  coordinated: 'The interface is good and beautiful and reliable. The checkout is clunky and confusing.',
  emphasis: 'The food is good. The service is VERY GOOD!!! The atmosphere is slightly good.',
  scope: 'I don’t think the support is good, but the documentation is excellent. The update is not only good but wonderful.',
  uncertainty: 'Maybe the interface will be wonderful. Is the support reliable? The next update might be good.',
  irony: 'Great, another crash. Wonderful, another failure. The app is broken again.',
  unicode: '🧡 I love the café’s beautiful design! The delivery was awful. 😞',
  safety: 'I love this <b>product</b>, but the service is terrible. <img src=x onerror=alert(1)>',
  coverage: 'The onboarding feels like wading through wet cement. The dashboard is zorbastic.',
  absence: "I dont see any functional problems. The release is free of bugs, but the help desk lacks support.",
  qualifiers: 'The navigation is more intuitive. The interface is not just good; it is excellent.',
  conditions: 'If the update is reliable, we will install it. The dashboard would be useful. The checkout is not reliable enough.',
  targets: 'The interface and navigation are intuitive. I love the customer support team.',
  domains: 'The booking process is wonderfully straightforward. The headphones deliver exceptional sound quality. The lesson plan is confusing and unhelpful.'
};
const extraExamples: Record<string, string> = {
  joy: 'Joy & excitement', anger: 'Anger & frustration', sadness: 'Sadness', anxiety: 'Fear & anxiety',
  surprise: 'A pleasant surprise', aspects: 'Different opinion targets', compound: 'Compound phrases',
  coordinated: 'Shared opinion targets', emphasis: 'Emphasis & intensity', scope: 'Negation scope',
  uncertainty: 'Questions & uncertainty', irony: 'Possible irony', unicode: 'Unicode & emoji',
  safety: 'HTML as safe text', coverage: 'Limits of the vocabulary', absence: 'Absence & lack', qualifiers: 'Qualifiers & comparisons', conditions: 'Conditional opinions', targets: 'Multiple opinion targets', domains: 'Across review domains'
};
for (const [key, label] of Object.entries(extraExamples)) {
  const button = document.createElement('button');
  button.dataset.example = key;
  button.textContent = `${label} ↗`;
  document.querySelector('.example-buttons')!.append(button);
}
let dark = false;
const autoNative = document.querySelector<HTMLInputElement>('#native-auto')!;
const nativeButton = document.querySelector<HTMLButtonElement>('#native-analyze')!;
const nativeStatus = document.querySelector<HTMLParagraphElement>('#native-status')!;
const assessment = document.querySelector<HTMLDivElement>('#native-assessment')!;
let availability: NativeAvailability = 'unsupported';
let pending: AbortController | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
const currentOptions = (): Options => ({ threshold: Number(threshold.value), showTooltips: tooltips.checked });
for (const [field, value] of Object.entries(lexiconStats)) {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-lexicon-stat="${field}"]`)) element.textContent = value.toLocaleString('en-US');
}
function styleSentimentBadge(element: HTMLElement, label: Analysis['sentiment']['label']) {
  const palette = text.getPageTheme(element.parentElement ?? element);
  element.dataset.sentiment = label;
  const primary = palette[label === 'mixed' ? 'positive' : label];
  // Mixed represents both polarities rather than borrowing an unrelated emotion color.
  const background = label === 'mixed' ? `linear-gradient(110deg, ${palette.positive.background} 0% 48%, ${palette.negative.background} 52% 100%)` : primary.background;
  element.style.background = background;
  if (label === 'mixed') {
    const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    const surfaces = [luminance(palette.positive.background), luminance(palette.negative.background)];
    const black = Math.min(...surfaces.map(l => (l + 0.05) / 0.05));
    const white = Math.min(...surfaces.map(l => 1.05 / (l + 0.05)));
    // If no common foreground meets contrast on both halves, use the uncertainty surface.
    if (Math.max(black, white) < 4.5) { element.style.background = palette.uncertain.background; element.style.color = palette.uncertain.color; }
    else element.style.color = black >= white ? '#000000' : '#ffffff';
  } else element.style.color = primary.color;
}
function showInsights(result: Analysis) {
  for (const [selector, items] of [['#aspects', result.aspects], ['#clauses', result.clauses]] as const) {
    const list = document.querySelector(selector)!;
    list.replaceChildren();
    for (const item of items) {
      const row = document.createElement('li');
      const label = document.createElement('span'); label.className = 'insight-text'; label.textContent = item.text;
      const sentiment = document.createElement('span'); sentiment.className = `sentiment-badge insight-label ${item.sentiment}`; sentiment.textContent = item.sentiment;
      row.append(label, sentiment); list.append(row);
      styleSentimentBadge(sentiment, item.sentiment);
    }
    if (!items.length) { const empty = document.createElement('li'); empty.textContent = 'No attributable emotional evidence.'; list.append(empty); }
  }
  const note = document.querySelector<HTMLParagraphElement>('#ambiguity')!;
  note.hidden = result.ambiguity.length === 0; note.textContent = `Uncertainty cues: ${result.ambiguity.join('; ')}. Some highlights are intentionally omitted.`;
  const evidence = result.clauses.flatMap(clause => clause.evidence);
  const attributed = new Set(result.aspects.flatMap(aspect => aspect.evidence.map(p => `${p.start}:${p.end}`)));
  const visible = new Set(result.highlights.map(p => `${p.start}:${p.end}`));
  const unattributed = evidence.filter(p => !attributed.has(`${p.start}:${p.end}`)).length;
  document.querySelector('#attribution-status')!.textContent = evidence.length
    ? `${evidence.length} recognized emotional spans; ${result.highlights.length} highlighted; ${unattributed} without an identifiable opinion target. Expand the evidence below to inspect omissions.`
    : 'No emotional words or phrases were recognized by the local vocabulary. This is not proof that the text is neutral: unfamiliar wording and implicit sentiment may be missed. Optional native analysis can offer a second opinion when available.';
  const evidenceList = document.querySelector('#evidence')!;
  evidenceList.replaceChildren();
  for (const p of evidence) {
    const item = document.createElement('li');
    const status = visible.has(`${p.start}:${p.end}`) ? 'Highlighted'
      : p.importance < Number(threshold.value) ? 'Hidden: below highlight threshold'
      : (p.confidence ?? p.heuristicConfidence) < 0.5 ? 'Hidden: uncertainty / abstention' : 'Not highlighted';
    item.textContent = `${p.text} — ${status}. Importance: ${p.importance.toFixed(2)}. ${p.explanation}`;
    evidenceList.append(item);
  }
  if (!evidence.length) {
    const empty = document.createElement('li'); empty.textContent = 'No lexical evidence to attribute. Changing the threshold cannot add words absent from the vocabulary.'; evidenceList.append(empty);
  }
}
function resetNativeStatus() {
  nativeStatus.textContent = availability === 'available' ? 'On-device model ready. Optional, uncalibrated second opinion.'
    : availability === 'downloadable' || availability === 'downloading' ? 'Model download required; browser hardware and storage requirements apply.'
    : 'Native model unavailable in this browser. Full local analysis remains active.';
}
async function enhance(always = false, allowDownload = false) {
  pending?.abort();
  const controller = new AbortController(); pending = controller;
  const version = revision;
  nativeStatus.textContent = allowDownload ? 'Preparing browser-managed download and analysis…' : 'Analyzing with the on-device model…';
  const result = await text.analyzeWithNative(input.value, { ...currentOptions(), native: { mode: always ? 'always' : 'auto', allowDownload, signal: controller.signal, timeoutMs: allowDownload ? 120000 : 15000 } });
  if (controller.signal.aborted || version !== revision) return;
  assessment.replaceChildren();
  if (result.modelAssessment) {
    availability = 'available'; autoNative.disabled = false;
    nativeButton.textContent = 'Analyze with native model';
    const heading = document.createElement('h3'); heading.textContent = `Native second opinion: ${result.modelAssessment.label}`;
    const explanation = document.createElement('p'); explanation.textContent = result.modelAssessment.explanation;
    const list = document.createElement('ul');
    for (const span of result.modelAssessment.spans) {
      const item = document.createElement('li'); item.textContent = `${span.text} — ${span.sentiment}${span.emotion ? ` / ${span.emotion}` : ''}: ${span.explanation}`; list.append(item);
    }
    assessment.append(heading, explanation, list); assessment.hidden = false;
    nativeStatus.textContent = 'Native assessment complete. Local highlights and scores are unchanged.';
  } else {
    assessment.hidden = true;
    nativeStatus.textContent = result.metadata.native.status === 'skipped' ? 'Local evidence sufficient; native inference skipped.' : `Local results retained. Native status: ${result.metadata.native.reason}.`;
  }
}
function refresh() {
  revision++; pending?.abort(); if (debounce) clearTimeout(debounce);
  assessment.hidden = true; resetNativeStatus();
  const start = performance.now();
  const result = text.update(output, input.value, currentOptions());
  editor.sync();
  const palette = text.getPageTheme(output);
  for (const item of document.querySelectorAll<HTMLElement>('.legend-item')) {
    const category = Object.keys(palette).find(key => item.classList.contains(key)) as keyof typeof palette | undefined;
    if (category) { item.style.backgroundColor = palette[category].background; item.style.color = palette[category].color; }
  }
  showInsights(result);
  document.querySelector('#char-count')!.textContent = `${input.value.length} characters`;
  document.querySelector('#threshold-value')!.textContent = Number(threshold.value).toFixed(2);
  const badge = document.querySelector<HTMLElement>('#sentiment-label')!;
  badge.textContent = result.sentiment.label;
  styleSentimentBadge(badge, result.sentiment.label);
  document.querySelector('#result-summary')!.textContent = `${result.highlights.length} emotional spans · ${(performance.now() - start).toFixed(1)} ms`;
  if (autoNative.checked && availability === 'available') debounce = setTimeout(() => { void enhance(); }, 400);
}
autoNative.addEventListener('change', refresh);
nativeButton.addEventListener('click', () => {
  if (debounce) clearTimeout(debounce);
  void enhance(true, availability === 'downloadable' || availability === 'downloading');
});
void text.nativeAvailability().then(state => {
  availability = state;
  autoNative.disabled = state !== 'available';
  nativeButton.disabled = state === 'unsupported' || state === 'unavailable';
  nativeButton.textContent = state === 'downloadable' || state === 'downloading' ? 'Download browser model & analyze' : 'Analyze with native model';
  resetNativeStatus();
});
input.addEventListener('input', refresh); threshold.addEventListener('input', refresh); tooltips.addEventListener('change', refresh);
document.querySelector('#clear')!.addEventListener('click', () => { input.value = ''; refresh(); input.focus(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-example]')) button.addEventListener('click', () => {
  input.value = examples[button.dataset.example!]!; refresh();
  document.querySelectorAll('[data-example]').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
});
themeButton.addEventListener('click', () => {
  dark = !dark; document.body.classList.toggle('dark', dark);
  hero.refresh();
  themeButton.textContent = dark ? '☀' : '☾'; themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`); refresh();
});
refresh();