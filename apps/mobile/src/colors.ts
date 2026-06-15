import { useColorScheme } from 'nativewind';

// Light mode hex values — used as static fallback and for non-hook contexts.
// These mirror the :root CSS variable block in global.css.
export const colors = {
  foreground: '#1a1c2e',
  mutedForeground: '#6b7ca4',
  primary: '#2d2f47',
  primaryForeground: '#f8f9fb',
  destructive: '#e44848',
  border: '#e2e8f0',
  muted: '#f1f5f9',
  card: '#ffffff',
  background: '#ffffff',
} as const;

// Dark mode hex values — mirror the .dark CSS variable block in global.css.
const darkColors = {
  foreground: '#f8f9fb',
  mutedForeground: '#94a3b8',
  primary: '#e2e8f0',
  primaryForeground: '#2d2f47',
  destructive: '#f87171',
  border: '#2a2c40',
  muted: '#383a5a',
  card: '#2d2f47',
  background: '#1a1c2e',
} as const;

export type ColorTokens = typeof colors;

// Use this hook inside components to get theme-aware colors for Lucide icon
// `color` props (which cannot consume NativeWind className tokens directly).
export function useColors(): ColorTokens {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? darkColors : colors;
}
