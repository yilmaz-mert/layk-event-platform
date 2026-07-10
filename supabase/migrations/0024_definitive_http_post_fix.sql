-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0024: Definitive extensions.http_post fix
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Follow-up to 0023. The 3-param wrapper (url, body, headers) fixed the
-- signature error but produced a new failure:
--   "null value in column 'url' of relation 'http_request_queue'"
--
-- This happens when a caller passes the endpoint via `uri :=` instead of
-- `url :=` — the old wrapper received NULL for url and forwarded it to
-- net.http_post(), which enforces NOT NULL on its url column.
--
-- This migration:
--   1. Re-ensures http + pg_net extensions and all role permissions
--      (fully idempotent — safe to rerun).
--   2. Drops the old 3-param overload to prevent call-site ambiguity.
--   3. Creates a 4-param wrapper accepting both `url` and `uri`, using
--      COALESCE(url, uri) so either named arg resolves the target.
--   4. Falls back to the Expo push endpoint if both arrive as NULL.
--   5. Defaults body and headers to '{}' before casting to jsonb so
--      net.http_post never receives a NULL json value.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extensions (idempotent) ────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS http   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 2. Permissions ────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA extensions TO postgres, service_role, authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions
  TO postgres, service_role, authenticated, anon;

-- pg_net always uses the "net" schema regardless of WITH SCHEMA on CREATE EXTENSION.
GRANT USAGE ON SCHEMA net TO postgres, service_role, authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net
  TO postgres, service_role, authenticated, anon;

-- ── 3. Drop the old 3-param overload to prevent ambiguous-call errors ─────────
--
-- Keeping (url, body, headers) alongside the new (url, uri, body, headers)
-- would make PostgreSQL raise "ambiguous function call" when the trigger
-- supplies 3 named args that match both signatures.

DROP FUNCTION IF EXISTS extensions.http_post(text, text, text);

-- ── 4. Definitive 4-param wrapper ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION extensions.http_post(
  url     text DEFAULT NULL,
  uri     text DEFAULT NULL,
  body    text DEFAULT NULL,
  headers text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, net, public
AS $$
DECLARE
  -- Accept either `url` or `uri` named arg; fall back to Expo push endpoint.
  _url     text  := COALESCE(
                      url,
                      uri,
                      'https://exp.host/--/api/v2/push/send'
                    );
  -- Default empty object so net.http_post never receives NULL json.
  _body    jsonb := COALESCE(body,    '{}')::jsonb;
  _headers jsonb := COALESCE(headers, '{}')::jsonb;
BEGIN
  PERFORM net.http_post(
    url     := _url,
    body    := _body,
    headers := _headers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION extensions.http_post(text, text, text, text)
  TO postgres, service_role, authenticated, anon;
