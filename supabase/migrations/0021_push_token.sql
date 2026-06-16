-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 24: Expo Push Token Storage
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add push_token column to users (idempotent) ─────────────────────────────
-- Stores the device's Expo Push Token (from getExpoPushTokenAsync) so a future
-- Edge Function / trigger can address this device when sending native pushes.
-- No RLS change needed: "Users can update own profile" (0008) already allows
-- auth.uid() = id to UPDATE any column on their own row, including this one.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS push_token TEXT;
