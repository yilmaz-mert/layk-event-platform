-- ============================================================
-- 0001_initial_schema.sql
-- Initial schema for the Event Reservation App
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.users (
    id          UUID PRIMARY KEY,
    full_name   TEXT,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT,
    image_url   TEXT,
    event_date  TIMESTAMPTZ NOT NULL,
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    category    TEXT,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.reservations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, event_id)
);

-- ============================================================
-- AUTH TRIGGER: mirror new auth.users into public.users
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Helper: returns true when the calling user holds the 'admin' role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role = 'admin'
    );
$$;

-- ---- users ----
CREATE POLICY "users: admin full access"
    ON public.users
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "users: read own row"
    ON public.users
    FOR SELECT
    USING (id = auth.uid());

-- ---- events ----
CREATE POLICY "events: admin full access"
    ON public.events
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "events: users view active"
    ON public.events
    FOR SELECT
    USING (status = 'active');

-- ---- reservations ----
CREATE POLICY "reservations: admin full access"
    ON public.reservations
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "reservations: users view own"
    ON public.reservations
    FOR SELECT
    USING (user_id = auth.uid());

-- ============================================================
-- RPC: book_event — atomic capacity-checked reservation
-- ============================================================

CREATE OR REPLACE FUNCTION public.book_event(
    user_uuid  UUID,
    event_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity          INTEGER;
    v_confirmed_count   INTEGER;
BEGIN
    -- Lock the event row to serialize concurrent booking attempts
    SELECT capacity
    INTO   v_capacity
    FROM   public.events
    WHERE  id = event_uuid
      AND  status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or is not active.';
    END IF;

    SELECT COUNT(*)
    INTO   v_confirmed_count
    FROM   public.reservations
    WHERE  event_id = event_uuid
      AND  status   = 'confirmed';

    IF v_confirmed_count >= v_capacity THEN
        RAISE EXCEPTION 'Event is fully booked (capacity: %).', v_capacity;
    END IF;

    INSERT INTO public.reservations (user_id, event_id, status)
    VALUES (user_uuid, event_uuid, 'confirmed');
END;
$$;
