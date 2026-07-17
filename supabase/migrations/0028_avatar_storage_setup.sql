-- ============================================================
-- 0028_avatar_storage_setup.sql
-- Public storage bucket + RLS for compressed user avatars.
-- One file per user, permanently overwritten at `<user_id>.webp`.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS is already enabled on storage.objects by Supabase itself; migrations
-- run as a role that doesn't own the table, so altering it here would fail
-- with 42501. Only CREATE POLICY is needed (and permitted) below.

-- Public read: avatars are shown to any visitor (attendee lists, profile cards)
CREATE POLICY "avatars: public read"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars');

-- Authenticated insert: only into the caller's own `<uid>.webp` path
CREATE POLICY "avatars: user insert own"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND name = (auth.uid()::text || '.webp')
    );

-- Authenticated update: upsert overwrite of the caller's own file only
CREATE POLICY "avatars: user update own"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'avatars'
        AND name = (auth.uid()::text || '.webp')
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND name = (auth.uid()::text || '.webp')
    );

-- Authenticated delete: only the caller's own file
CREATE POLICY "avatars: user delete own"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'avatars'
        AND name = (auth.uid()::text || '.webp')
    );
