-- ============================================================
-- 0002_seed_data.sql
-- Mock seed data for development and UI testing
-- ============================================================

-- ---- Users ----
INSERT INTO public.users (id, full_name, email, role, is_approved, created_at) VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'Admin User',
        'admin@example.com',
        'admin',
        TRUE,
        NOW()
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Jane Doe',
        'jane.doe@example.com',
        'user',
        TRUE,
        NOW()
    );

-- ---- Events ----
INSERT INTO public.events (id, title, description, image_url, event_date, capacity, category, status, created_at) VALUES
    (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Future Tech Conference 2026',
        'A deep dive into emerging technologies shaping the next decade.',
        'https://placehold.co/800x400?text=Tech+Conference',
        NOW() + INTERVAL '30 days',
        200,
        'Conference',
        'active',
        NOW()
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000002',
        'Advanced TypeScript Workshop',
        'Hands-on workshop covering generics, decorators, and type inference.',
        'https://placehold.co/800x400?text=TS+Workshop',
        NOW() + INTERVAL '14 days',
        40,
        'Workshop',
        'active',
        NOW()
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000003',
        'Design Systems Summit',
        'Retrospective summit on building scalable design systems.',
        'https://placehold.co/800x400?text=Design+Summit',
        NOW() - INTERVAL '10 days',
        150,
        'Conference',
        'completed',
        NOW()
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000004',
        'Exclusive VIP Masterclass',
        'A single-seat masterclass to test capacity enforcement and race conditions.',
        'https://placehold.co/800x400?text=VIP+Masterclass',
        NOW() + INTERVAL '7 days',
        1,
        'Workshop',
        'active',
        NOW()
    );

-- ---- Reservations ----
INSERT INTO public.reservations (id, user_id, event_id, status, created_at) VALUES
    (
        'bbbbbbbb-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'confirmed',
        NOW()
    );
