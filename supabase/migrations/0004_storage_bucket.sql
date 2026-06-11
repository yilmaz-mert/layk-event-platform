-- ============================================================
-- 0004_storage_bucket.sql
-- Public storage bucket for event banner images
-- ============================================================

-- Create the bucket (public = true makes objects publicly readable via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-banners', 'event-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view banner images (required for the user-facing feed)
CREATE POLICY "event-banners: public read"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'event-banners');

-- Admin insert: only authenticated admins may upload new banners
CREATE POLICY "event-banners: admin insert"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'event-banners'
        AND (
            SELECT role FROM public.users WHERE id = auth.uid()
        ) = 'admin'
    );

-- Admin update: allow admins to replace/overwrite existing banners
CREATE POLICY "event-banners: admin update"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'event-banners'
        AND (
            SELECT role FROM public.users WHERE id = auth.uid()
        ) = 'admin'
    );

-- Admin delete: allow admins to remove old banners
CREATE POLICY "event-banners: admin delete"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'event-banners'
        AND (
            SELECT role FROM public.users WHERE id = auth.uid()
        ) = 'admin'
    );
