// Isolated, throwaway PostgreSQL server for migration tests.
//
// What is real: a real PostgreSQL server (embedded-postgres binaries), the repo's
// migration files applied in order, real roles (anon/authenticated), real RLS,
// real triggers/locks and real concurrent connections.
//
// What is stubbed (Supabase platform pieces that are not in the migrations):
//   - auth schema: auth.users table and auth.uid()/auth.role()/auth.jwt() reading
//     the same request.jwt.* settings PostgREST sets. No GoTrue, no JWT signing.
//   - storage schema: minimal buckets/objects tables so storage policies compile.
//   - pg_net/http: extensions are not installed; `net.http_post` is a stub that only
//     records the call in test_support.outbound_http. Nothing leaves the machine.
//   - `CREATE EXTENSION ... (http|pg_net)` statements are skipped when applying.
//   - supabase_realtime publication is created empty.
// PostgREST itself is not running: `asUser` reproduces what it does per request
// (one transaction, SET LOCAL ROLE authenticated, request.jwt.claim(s) settings).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const PASSWORD = 'test';

const SUPABASE_STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
  owner uuid, metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

CREATE SCHEMA extensions;
CREATE SCHEMA net;
CREATE SCHEMA test_support;
CREATE TABLE test_support.outbound_http (id bigserial PRIMARY KEY, url text, body jsonb, at timestamptz DEFAULT now());
GRANT USAGE ON SCHEMA test_support TO anon, authenticated, service_role;
GRANT INSERT ON test_support.outbound_http TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE test_support.outbound_http_id_seq TO anon, authenticated, service_role;
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
LANGUAGE sql AS $$
  INSERT INTO test_support.outbound_http (url, body) VALUES (url, body) RETURNING id $$;

CREATE PUBLICATION supabase_realtime;
-- Dummy webhook settings (real ones live in the Supabase dashboard); the URL only lands in outbound_http.
ALTER DATABASE postgres SET app.supabase_project_ref = 'local-test';
ALTER DATABASE postgres SET app.supabase_service_role_key = 'not-a-key';
`;

const SKIPPED_STATEMENT = /^\s*CREATE EXTENSION IF NOT EXISTS (http|pg_net)\b[^;]*;/gim;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function startDatabase() {
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), 'layk-pg-')),
    user: 'postgres',
    password: PASSWORD,
    port,
    persistent: false,
    // Windows locales with non-ASCII names break initdb; tests do not depend on collation.
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();

  const connect = async () => {
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: PASSWORD, database: 'postgres' });
    await client.connect();
    return client;
  };

  const admin = await connect();
  await admin.query(SUPABASE_STUBS);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const file of files) {
    const sql = (await readFile(join(MIGRATIONS_DIR, file), 'utf8')).replace(SKIPPED_STATEMENT, '');
    try {
      await admin.query(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }

  return {
    migrations: files,
    admin,
    connect,
    async stop() {
      await admin.end();
      await server.stop();
    },
  };
}

// Runs `fn(client)` the way PostgREST runs one request for a signed-in user.
// Commits on success, rolls back on error (the error is rethrown).
export async function asUser(client, userId, fn) {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [userId],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
