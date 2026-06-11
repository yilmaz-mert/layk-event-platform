-- ============================================================
-- 0005_core_overhaul.sql
-- Phase 6.1: Database & Concurrency Overhaul
-- Safe to run on live data: all table changes use ADD COLUMN IF NOT EXISTS
-- and DROP COLUMN IF EXISTS; functions use CREATE OR REPLACE.
-- ============================================================


-- ── 1. events: booked_count ───────────────────────────────────────────────────
--    Tracks confirmed bookings in-row so the book_event RPC can check
--    capacity with a single FOR UPDATE row lock instead of a COUNT subquery.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS booked_count integer NOT NULL DEFAULT 0;

-- Backfill from confirmed reservations so the column is accurate for
-- any events that already have bookings in the seed / production data.
UPDATE public.events e
SET booked_count = (
  SELECT COUNT(*)
  FROM   public.reservations r
  WHERE  r.event_id = e.id
  AND    r.status   = 'confirmed'
);


-- ── 2. users: phone_number ────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number text;


-- ── 3. users: approval_status (replaces binary is_approved) ──────────────────
--    Three-value approval lifecycle: pending → approved | rejected.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CONSTRAINT users_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Migrate existing boolean values before the column is dropped.
-- NULL is_approved (e.g. admin rows where the column was never set) is
-- treated as 'approved' so that admin accounts remain accessible.
UPDATE public.users
SET approval_status = CASE
  WHEN is_approved IS NULL  THEN 'approved'
  WHEN is_approved = true   THEN 'approved'
  ELSE                           'pending'
END;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS is_approved;


-- ── 4. handle_new_user: extract full_name from Auth metadata ─────────────────
--    The previous version used a hard-coded placeholder. This version reads
--    the name the user supplied during sign-up via raw_user_meta_data.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, approval_status)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'user',
    'pending'
  );
  RETURN new;
END;
$$;


-- ── 5. book_event: capacity check via booked_count + FOR UPDATE ──────────────
--    Locks the event row for the lifetime of the transaction so that two
--    concurrent calls cannot both read booked_count < capacity and both
--    succeed when only one spot remains.

CREATE OR REPLACE FUNCTION public.book_event(
  user_uuid  uuid,
  event_uuid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_capacity   integer;
  v_booked     integer;
BEGIN
  -- Exclusive row lock prevents concurrent overbooking.
  SELECT capacity, booked_count
  INTO   v_capacity, v_booked
  FROM   public.events
  WHERE  id = event_uuid
  FOR UPDATE;

  IF v_booked >= v_capacity THEN
    RAISE EXCEPTION 'Event is fully booked'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.events
  SET    booked_count = booked_count + 1
  WHERE  id = event_uuid;

  INSERT INTO public.reservations (user_id, event_id, status)
  VALUES (user_uuid, event_uuid, 'confirmed');
END;
$$;
