-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0023: Fix extensions.http_post named-parameter mismatch
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Root cause:
--   trigger_send_push_notification() (from 0022) calls:
--     extensions.http_post(url := ..., body := ..., headers := ...)
--
--   The pgsql-http extension installs http_post with parameters named
--   (uri, content_type, content) — not (url, body, headers).
--   PostgreSQL named-argument dispatch is exact on parameter names, so
--   the call fails with "function does not exist" even when the extension
--   is enabled.
--
-- Fix:
--   1. Ensure http + pg_net extensions exist in the extensions schema.
--   2. Grant schema usage and execute to all roles.
--   3. CREATE OR REPLACE a wrapper extensions.http_post(url, body, headers)
--      that maps the named parameters the trigger uses onto net.http_post(),
--      which is pg_net's actual HTTP primitive (always lives in schema "net"
--      regardless of WITH SCHEMA on CREATE EXTENSION).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure extensions are enabled ─────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS http   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 2. Grant schema usage + execute to all roles ──────────────────────────────

GRANT USAGE ON SCHEMA extensions TO postgres, service_role, authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions
  TO postgres, service_role, authenticated, anon;

-- pg_net always puts its runtime functions in the "net" schema.
GRANT USAGE ON SCHEMA net TO postgres, service_role, authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net
  TO postgres, service_role, authenticated, anon;

-- ── 3. Wrapper with the exact named-parameter signature the trigger uses ──────
--
-- The trigger passes body and headers as text produced by
-- json_build_object(...)::text, so both are always valid JSON strings.
-- We cast them to jsonb before forwarding to net.http_post().
--
-- CREATE OR REPLACE with (text, text, text) intentionally replaces the
-- pgsql-http extension's http_post(uri,content_type,content) overload so
-- that named-arg dispatch on (url,body,headers) resolves correctly.

CREATE OR REPLACE FUNCTION extensions.http_post(
  url     text,
  body    text DEFAULT NULL,
  headers text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, net, public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := http_post.url,
    body    := http_post.body::jsonb,
    headers := http_post.headers::jsonb
  );
END;
$$;

-- Explicit grant on the new overload (covers future role additions too).
GRANT EXECUTE ON FUNCTION extensions.http_post(text, text, text)
  TO postgres, service_role, authenticated, anon;
