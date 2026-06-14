/// <reference path="../global.d.ts" />
import { createClient } from '@supabase/supabase-js';

// Cross-platform env resolution:
// - Vite inlines import.meta.env.VITE_* at build time (web)
// - Expo Metro inlines process.env.EXPO_PUBLIC_* at build time (mobile)
// Both references coexist; each bundler fills its own vars and leaves the other undefined.
function resolveEnv(viteKey: string, expoKey: string): string {
  // Vite environment — import.meta.env is a Vite-specific object; cast to any to avoid
  // TypeScript errors when this file is processed by non-Vite tooling (e.g. Metro, Jest).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteVal = (import.meta as any).env?.[viteKey] as string | undefined;
  if (viteVal) return viteVal;

  // Expo / Node environment — process.env values are inlined at bundle time by Metro.
  if (typeof process !== 'undefined' && process.env) {
    const expoVal = process.env[expoKey];
    if (expoVal) return expoVal;
  }

  return '';
}

const supabaseUrl = resolveEnv('VITE_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = resolveEnv('VITE_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase credentials missing. ' +
    'Web: set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. ' +
    'Mobile: set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
