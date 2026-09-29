// The Vite env vars @layk/core reads. Declared here because core doesn't depend on
// `vite/client` types; in apps/web these merge with Vite's own ImportMetaEnv.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
