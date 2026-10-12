import { analyze, getPageTheme } from '../src/browser/index';
import { ReactionManager } from '../src/extension/reactions';

// Original, recognizable adjectives: every entry is checked against the engine in tests.
// Interleave categories so adjacent words keep demonstrating different palette colors.
const heroWordGroups = [
  'happy joyful cheerful delighted excited grateful hopeful optimistic blissful ecstatic jubilant elated gleeful thankful relieved reassured encouraged inspired motivated refreshed energized adored enjoyable',
  'angry furious annoyed irritated outraged resentful indignant enraged livid irate incensed exasperated aggravated infuriated insulting irritable frustrating obnoxious arrogant rude dismissive abrasive',
  'sad unhappy miserable heartbroken saddened sorrowful mournful dejected disheartened discouraged forlorn crestfallen downhearted downcast dispirited disconsolate inconsolable bereaved tearful grieving disappointed joyless',
  'anxious afraid scared terrified fearful frightened worried apprehensive uneasy unnerved unsettled panicked panicky petrified intimidated alarmed scary frightening terrifying daunting worrisome unsettling',
  'surprised astonished amazed astounded awestruck dumbfounded flabbergasted astonishing astounding wondrous dumbfounding amazement astonishment wonderment flabbergasting',
  'beautiful wonderful excellent fantastic amazing perfect helpful reliable lovely impressive friendly polished elegant graceful gorgeous charming radiant vibrant exquisite captivating fascinating breathtaking spectacular magnificent outstanding superb splendid stellar awesome delightful flawless seamless dependable trustworthy resilient thoughtful considerate supportive compassionate sincere authentic cozy peaceful serene soothing luxurious delicious comfortable intuitive efficient',
  'terrible awful horrible bad broken unusable useless clunky confusing buggy laggy unreliable unresponsive unpleasant difficult dreadful horrendous appalling atrocious abysmal lousy wretched rotten unacceptable inferior substandard mediocre inadequate defective flawed faulty shoddy shabby flimsy fragile brittle sluggish unstable corrupted cumbersome clumsy awkward unwieldy impractical inefficient ineffective inaccessible unreadable convoluted inconvenient incompatible overpriced unaffordable exorbitant wasteful worthless pointless futile fruitless underwhelming regrettable dishonest deceptive misleading distasteful disgusting revolting repulsive uncomfortable painful exhausting tiresome boring tedious monotonous dreary uninspired ugly hideous garish tacky sloppy careless botched bungled'
].map(group => group.split(' '));
export const heroWords: readonly string[] = Object.freeze(Array.from({ length: Math.max(...heroWordGroups.map(group => group.length)) }, (_, index) => heroWordGroups.flatMap(group => group[index] ? [group[index]!] : [])).flat());

/** A local, real-engine palette demonstration; no live-region announcement loop. */
export function startHeroRotation(doc: Document = document): { refresh: () => void; destroy: () => void } {
  const heading = doc.querySelector<HTMLElement>('#hero-title')!;
  const word = doc.querySelector<HTMLElement>('#hero-emotion')!;
  const label = word.querySelector<HTMLElement>('.hero-emotion-text')!;
  const win = doc.defaultView!;
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const emojiToggle = doc.querySelector<HTMLInputElement>('#hero-emoji');
  let reactions: ReactionManager | undefined;
  let index = 0;
  let timer: number | undefined;
  let swap: number | undefined;
  let fade: number | undefined;
  let destroyed = false;
  const measure = () => {
    if (destroyed) return;
    const style = win.getComputedStyle(word);
    const width = label.getBoundingClientRect().width + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    if (width > 0) word.style.width = `${Math.ceil(width)}px`;
  };
  const refresh = (newWord = false) => {
    const value = heroWords[index]!;
    const prediction = analyze(value, { threshold: 0 }).highlights[0]!;
    const category = prediction.emotion ?? prediction.sentiment;
    const color = getPageTheme(heading)[category];
    label.textContent = value;
    word.dataset.category = category;
    word.dataset.sentiment = prediction.sentiment;
    if (prediction.emotion) word.dataset.emotion = prediction.emotion;
    else delete word.dataset.emotion;
    word.style.backgroundColor = color.background;
    word.style.color = color.color;
    word.style.setProperty('--textheat-bg', color.background);
    word.style.setProperty('--textheat-fg', color.color);
    measure();
    if (newWord) reactions?.reset(word);
    else reactions?.configure({ emojiReactions: true, animate: true });
    reactions?.trackFor(500);
  };
  const toggleEmoji = () => {
    reactions?.destroy(); reactions = undefined;
    if (emojiToggle?.checked && !destroyed) {
      // Visual headline words are aria-hidden in favor of a stable heading label.
      reactions = new ReactionManager(doc, { emojiReactions: true, animate: true }, '#hero-emotion', true);
      reactions.reveal(word);
      reactions.trackFor(500);
    }
  };
  emojiToggle?.addEventListener('change', toggleEmoji);
  const repositionEmoji = () => reactions?.requestRefresh();
  word.addEventListener('transitionend', repositionEmoji);
  const settle = () => {
    if (swap !== undefined) win.clearTimeout(swap);
    if (fade !== undefined) win.clearTimeout(fade);
    swap = undefined; fade = undefined;
    word.classList.remove('is-changing');
  };
  const advance = () => {
    if (motion?.matches) { index = (index + 1) % heroWords.length; refresh(true); reactions?.reveal(word); return; }
    word.classList.add('is-changing');
    swap = win.setTimeout(() => {
      swap = undefined;
      index = (index + 1) % heroWords.length;
      refresh(true);
      // Start width/color interpolation before revealing the replacement text.
      fade = win.setTimeout(() => {
        fade = undefined; word.classList.remove('is-changing');
        reactions?.reveal(word); reactions?.trackFor(500);
      }, 80);
    }, 180);
  };
  const schedule = () => {
    if (timer !== undefined) win.clearInterval(timer);
    timer = undefined;
    settle();
    if (!motion?.matches && !doc.hidden) timer = win.setInterval(advance, 2600);
  };
  motion?.addEventListener?.('change', schedule);
  doc.addEventListener('visibilitychange', schedule);
  const resize = () => {
    if (destroyed) return;
    // A viewport/font change must not animate from a stale desktop-sized width.
    word.style.transition = 'none';
    measure();
    void word.offsetWidth;
    word.style.removeProperty('transition');
    repositionEmoji();
  };
  win.addEventListener('resize', resize);
  void doc.fonts?.ready.then(resize);
  const destroy = () => {
    destroyed = true;
    if (timer !== undefined) win.clearInterval(timer);
    settle();
    reactions?.destroy(); reactions = undefined;
    emojiToggle?.removeEventListener('change', toggleEmoji);
    word.removeEventListener('transitionend', repositionEmoji);
    motion?.removeEventListener?.('change', schedule);
    doc.removeEventListener('visibilitychange', schedule);
    win.removeEventListener('resize', resize);
    win.removeEventListener('pagehide', destroy);
  };
  win.addEventListener('pagehide', destroy);
  refresh(); schedule();
  return { refresh: () => refresh(), destroy };
}