-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 17: Rich Event Seed Data
-- Idempotent: ON CONFLICT (id) DO NOTHING lets migrations re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.events
  (id, title, description, category, event_date, capacity, max_tickets_per_user, booked_count, status)
VALUES

  -- ── Technology ─────────────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000001',
    'AI & Machine Learning Summit 2026',
    'A premier two-day gathering of data scientists, ML engineers, and AI researchers. Sessions cover large language models, computer-vision pipelines, responsible AI governance, and live coding workshops. Keynote from leading researchers at industry labs, hands-on hackathon finale, and a curated networking dinner on day two.',
    'Technology',
    '2026-07-15 09:00:00+00',
    300,
    2,
    87,
    'active'
  ),

  (
    '11111111-0000-0000-0000-000000000002',
    'Winter Coding Hackathon',
    'A 24-hour intensive hackathon where teams of up to four developers compete to build working prototypes around the theme of sustainable urban tech. Prizes include cloud credits, mentorship sessions, and fast-track interviews with sponsoring companies. Food, coffee, and standing desks provided throughout.',
    'Technology',
    '2025-12-01 08:00:00+00',
    100,
    2,
    100,
    'completed'
  ),

  -- ── Culinary Arts ──────────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000003',
    'Farm-to-Table Masterclass',
    'Join award-winning chef Elena Rossi for an intimate hands-on workshop at her countryside kitchen studio. Learn seasonal ingredient sourcing, knife craft, and three signature courses — roasted heritage beet salad, pan-seared duck breast, and lavender panna cotta. Take home a printed recipe booklet and a jar of house-made herb oil.',
    'Culinary Arts',
    '2026-07-28 18:00:00+00',
    20,
    1,
    19,
    'active'
  ),

  (
    '11111111-0000-0000-0000-000000000004',
    'Sushi & Sake Pairing Evening',
    'Master sushi chef Kenji Nakamura walks guests through the art of nigiri, maki, and omakase presentation alongside a curated four-sake flight sourced directly from Niigata breweries. Maximum fifteen guests ensures an intimate, personalised experience. Vegetarian alternatives available on request.',
    'Culinary Arts',
    '2026-08-14 19:00:00+00',
    15,
    1,
    6,
    'active'
  ),

  -- ── Live Music ─────────────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000005',
    'Summer Jazz Night at the Rooftop',
    'An open-air jazz experience on the city''s most iconic rooftop terrace. Three ensembles perform across two stages — classic bebop, Latin jazz fusion, and an experimental avant-garde set at midnight. Full cocktail bar, charcuterie boards, and city-skyline views. Smart-casual dress code.',
    'Live Music',
    '2026-08-03 20:00:00+00',
    150,
    4,
    72,
    'active'
  ),

  (
    '11111111-0000-0000-0000-000000000006',
    'Indie Acoustic Sessions',
    'Five emerging singer-songwriters perform stripped-back acoustic sets in an intimate 80-seat venue. Each artist plays a 20-minute set followed by a brief Q&A. Vinyl merch tables and signed poster giveaways throughout the evening. Doors open 30 minutes before the first act.',
    'Live Music',
    '2026-09-18 19:30:00+00',
    80,
    2,
    31,
    'active'
  ),

  -- ── Business Networking ────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000007',
    'Startup Pitch Competition',
    'Eight pre-selected early-stage startups present five-minute pitches to a panel of seasoned venture capitalists and angel investors. Audience members vote on a People''s Choice Award. Post-event speed-networking hour with founders, investors, and media contacts. Attendance limited for high signal-to-noise ratio.',
    'Business Networking',
    '2026-08-10 10:00:00+00',
    80,
    2,
    34,
    'active'
  ),

  (
    '11111111-0000-0000-0000-000000000008',
    'New Year Executive Gala',
    'Black-tie gala dinner celebrating the close of the fiscal year. Guest speakers include a Fortune 500 CEO and a celebrated economist. Five-course tasting menu by a Michelin-starred kitchen, live string quartet, and a champagne toast at midnight. Tickets are non-transferable.',
    'Business Networking',
    '2025-12-31 19:00:00+00',
    250,
    4,
    248,
    'completed'
  ),

  -- ── Gaming Tournament ──────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000009',
    'Retro Gaming Championship',
    'Compete in bracket-format tournaments across six classic titles: Street Fighter II, Tetris Attack, Mario Kart 64, Sonic the Hedgehog, GoldenEye 007, and Super Smash Bros. Trophies and cash prizes for top finishers in each category. Arcade cabinets, retro console stations, and a collector trading floor open all day.',
    'Gaming Tournament',
    '2026-08-20 13:00:00+00',
    64,
    1,
    60,
    'active'
  ),

  -- ── Fitness Workshop ──────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000010',
    'HIIT & Mindfulness Bootcamp',
    'A full-day wellness intensive alternating between high-intensity interval training circuits and guided mindfulness meditation. Morning session focuses on metabolic conditioning; afternoon transitions to breathwork, restorative yoga, and a nutrition workshop. All fitness levels welcome. Mats and equipment provided; bring water and a towel.',
    'Fitness Workshop',
    '2026-09-05 07:00:00+00',
    30,
    1,
    12,
    'active'
  ),

  -- ── Photography ────────────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000011',
    'Urban Street Photography Walk',
    'Award-winning documentary photographer Lena Müller leads a curated three-hour walking tour through the city''s most photogenic districts. Learn compositional techniques, light-reading for golden hour, and ethical street photography practice. Post-walk group review and critique session at a nearby café. Bring any camera or smartphone.',
    'Photography',
    '2026-09-12 09:00:00+00',
    15,
    1,
    9,
    'active'
  ),

  -- ── Art Exhibition ─────────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000012',
    'Contemporary Art Exhibition: Liminal Spaces',
    'Exclusive opening-night preview of ''Liminal Spaces'', a group exhibition featuring twelve international artists exploring threshold states — between sleep and waking, digital and physical, self and other. Mixed-media installations, video art, and large-format photography. Champagne reception, artist talks at 21:00, and limited-edition catalogue available for purchase.',
    'Art Exhibition',
    '2026-09-20 19:00:00+00',
    200,
    2,
    145,
    'active'
  )

ON CONFLICT (id) DO NOTHING;
