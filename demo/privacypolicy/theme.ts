const button = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
const preference = window.matchMedia?.('(prefers-color-scheme: dark)');
type ThemeChoice = 'system' | 'dark' | 'light';
const key = 'textheat-color-theme';
const valid = (value: string | null): value is ThemeChoice => value === 'system' || value === 'dark' || value === 'light';
let choice: ThemeChoice = 'system';
try {
  const saved = window.localStorage.getItem(key);
  if (valid(saved)) choice = saved;
} catch { /* Storage may be unavailable in private or opaque contexts. */ }
function applyTheme() {
  const dark = choice === 'dark' || choice === 'system' && (preference?.matches ?? true);
  document.body.classList.toggle('dark', dark);
  button.textContent = choice === 'system' ? '◐' : dark ? '☾' : '☀';
  const current = choice === 'system' ? `system preference (${dark ? 'dark' : 'light'})` : choice;
  const next = choice === 'system' ? 'dark' : choice === 'dark' ? 'light' : 'system preference';
  button.setAttribute('aria-label', `Color theme: ${current}. Activate for ${next}.`);
  button.title = `Color theme: ${current} · Next: ${next}`;
}
button.addEventListener('click', () => {
  choice = choice === 'system' ? 'dark' : choice === 'dark' ? 'light' : 'system';
  try { window.localStorage.setItem(key, choice); } catch { /* Theme selection still works without persistence. */ }
  applyTheme();
});
preference?.addEventListener?.('change', () => { if (choice === 'system') applyTheme(); });
applyTheme();
