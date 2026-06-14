/// <reference path="../global.d.ts" />
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';

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

export const supabaseUrl = resolveEnv('VITE_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = resolveEnv('VITE_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase credentials missing. ' +
    'Web: set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. ' +
    'Mobile: set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

// Factory — lets each platform provide its own auth storage adapter.
// The web singleton below uses browser localStorage (Supabase default).
// Mobile creates its own instance via createSupabaseClient({ auth: { storage: SecureStore } }).
export function createSupabaseClient(options?: SupabaseClientOptions<'public'>) {
  return createClient(supabaseUrl, supabaseAnonKey, options);
}

export const supabase = createSupabaseClient();
