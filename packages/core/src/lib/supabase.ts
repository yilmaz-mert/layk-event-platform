/// <reference path="../global.d.ts" />
import { createClient } from '@supabase/supabase-js';

// Static `import.meta.env.VITE_*` reads: Vite replaces exactly these expressions at build time.
// (The earlier dynamic `process.env[key]` lookup — a React Native/Hermes workaround — was never
// replaced in production builds, so every deploy silently used a hardcoded demo project.)
// There is deliberately no fallback project: missing values fail `vite build` (see apps/web/vite.config.ts)
// and throw here in dev, instead of quietly talking to the wrong database.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase configuration missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (apps/web/.env.local or the hosting environment).',
  );
}

// Browser singleton; sessions persist in localStorage (supabase-js default).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
