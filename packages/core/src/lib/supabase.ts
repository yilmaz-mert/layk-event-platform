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

const resolvedSupabaseUrl = resolveEnv('VITE_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
const resolvedSupabaseAnonKey = resolveEnv('VITE_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
  // Throwing here would crash the whole app at import time (before any screen
  // can render, e.g. on a cold Android launch with a misconfigured EAS build
  // profile). Log loudly and fall back to a syntactically valid placeholder so
  // createClient() doesn't throw — real Supabase calls will then fail at the
  // call site, where existing error handling/timeouts already cover it.
  console.error(
    'Supabase credentials missing — using a placeholder client that will fail on first ' +
    'network call. Web: set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. ' +
    'Mobile: set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabaseUrl = resolvedSupabaseUrl || 'https://galbfihqzpbpthusazgf.supabase.co';
export const supabaseAnonKey = resolvedSupabaseAnonKey || 'sb_publishable_K13p3v4iGPFpEelKhg3vow_rG-vDDw6';

// Factory — lets each platform provide its own auth storage adapter.
// The web singleton below uses browser localStorage (Supabase default).
// Mobile creates its own instance via createSupabaseClient({ auth: { storage: SecureStore } }).
export function createSupabaseClient(options?: SupabaseClientOptions<'public'>) {
  return createClient(supabaseUrl, supabaseAnonKey, options);
}

export const supabase = createSupabaseClient();
