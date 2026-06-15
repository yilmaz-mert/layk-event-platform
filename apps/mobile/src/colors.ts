import { useColorScheme } from 'nativewind';

// Light mode — mirrors :root block in global.css (exact slate scale derived from web oklch).
export const colors = {
  foreground:       '#020617',
  mutedForeground:  '#64748b',
  primary:          '#0f172a',
  primaryForeground:'#f8fafc',
  destructive:      '#dc2626',
  border:           '#e2e8f0',
  muted:            '#f1f5f9',
  card:             '#ffffff',
  background:       '#ffffff',
} as const;

// Dark mode — mirrors .dark block in global.css.
const darkColors = {
  foreground:       '#f8fafc',
  mutedForeground:  '#94a3b8',
  primary:          '#e2e8f0',
  primaryForeground:'#0f172a',
  destructive:      '#f87171',
  border:           'rgba(255, 255, 255, 0.10)',
  muted:            '#1e293b',
  card:             '#0f172a',
  background:       '#020617',
} as const;

export type ColorTokens = typeof colors;

// Hook for components: returns the correct token set for Lucide icon `color` props,
// RefreshControl tintColor, Switch trackColor, etc. — anything that can't use a
// NativeWind className. Call inside every component that renders icons.
export function useColors(): ColorTokens {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? darkColors : colors;
}
