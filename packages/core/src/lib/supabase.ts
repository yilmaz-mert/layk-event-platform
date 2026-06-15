/// <reference path="../global.d.ts" />
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';

// Cross-platform env resolution via process.env only:
// - Web (Vite): vite.config.ts defines process.env.VITE_* at build time via `define`.
// - Mobile (Metro/Hermes): process.env.EXPO_PUBLIC_* are inlined at bundle time.
// import.meta is intentionally absent — Hermes rejects it at the Babel parse stage.
function resolveEnv(viteKey: string, expoKey: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return (process.env[viteKey] || process.env[expoKey] || '');
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
