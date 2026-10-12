import type { Category, Theme, ThemeInput } from '../core/types';
const colors: Theme = {
  positive: { background: '#D1FAE5', color: '#065F46' }, negative: { background: '#FEE2E2', color: '#991B1B' },
  joy: { background: '#FEF3C7', color: '#92400E' }, anger: { background: '#FFEDD5', color: '#9A3412' },
  sadness: { background: '#DBEAFE', color: '#1E40AF' }, fear: { background: '#EDE9FE', color: '#5B21B6' },
  surprise: { background: '#CFFAFE', color: '#155E75' }, neutral: { background: '#FFFFFF', color: '#374151' }, uncertain: { background: '#F3F4F6', color: '#374151' }
};
const dark: Partial<Theme> = {
  positive: { background: '#064E3B', color: '#A7F3D0' }, negative: { background: '#7F1D1D', color: '#FECACA' },
  joy: { background: '#78350F', color: '#FDE68A' }, anger: { background: '#7C2D12', color: '#FED7AA' },
  sadness: { background: '#1E3A8A', color: '#BFDBFE' }, fear: { background: '#4C1D95', color: '#DDD6FE' },
  surprise: { background: '#164E63', color: '#A5F3FC' }
};
export function getTheme(input: ThemeInput = 'default'): Theme {
  if (typeof input === 'string' && input !== 'default' && input !== 'dark') throw new TypeError('Unknown theme');
  const overrides = input === 'dark' ? dark : typeof input === 'object' && input !== null ? input : {};
  const theme = {} as Theme;
  for (const category of Object.keys(colors) as Category[]) {
    const value = { ...colors[category], ...overrides[category] };
    // Deliberately narrow grammar: no URLs, functions, CSS declarations or escapes.
    if (![value.background, value.color].every(c => typeof c === 'string' && /^#[\da-f]{6}$/i.test(c))) throw new TypeError('Theme colors must be six-digit hex colors');
    theme[category] = value;
  }
  return theme;
}