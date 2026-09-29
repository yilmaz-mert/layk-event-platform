// Migration regression tests against a real PostgreSQL server:
// SEC-001 / BUG-001 / BUG-003 (0031) and in-app-only notifications (0032).
// Run: npm run test:db   (see db-harness.mjs for what is real and what is stubbed)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startDatabase, asUser } from './db-harness.mjs';

let db;
let conn; // one "PostgREST request" connection reused by sequential tests

before(async () => {
  db = await startDatabase();
  conn = await db.connect();
});

after(async () => {
  await conn?.end();
  await db?.stop();
});

const DAY = 24 * 3600 * 1000;
const future = () => new Date(Date.now() + 7 * DAY).toISOString();
const past = () => new Date(Date.now() - DAY).toISOString();

async function makeUser(approval = 'approved', role = 'user') {
  const id = randomUUID();
  await db.admin.query(
    `INSERT INTO public.users (id, email, full_name, role, approval_status) VALUES ($1, $2, 'Test', $3, $4)`,
    [id, `${id}@example.com`, role, approval],
  );
  return id;
}

let adminId;
const getAdmin = async () => (adminId ??= await makeUser('approved', 'admin'));

// Admin creates events through RLS, the way EventFormModal does.
async function makeEvent(overrides = {}) {
  const e = {
    title: `Event ${randomUUID().slice(0, 8)}`,
    event_date: future(),
    capacity: 10,
    max_tickets_per_user: 4,
    status: 'active',
    is_published: true,
    is_archived: false,
    category: null,
    ...overrides,
  };
  const { rows } = await asUser(conn, await getAdmin(), (c) =>
    c.query(
      `INSERT INTO public.events (title, event_date, capacity, max_tickets_per_user, status, is_published, is_archived, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [e.title, e.event_date, e.capacity, e.max_tickets_per_user, e.status, e.is_published, e.is_archived, e.category],
    ),
  );
  return rows[0].id;
}

const adminUpdateEvent = async (eventId, set) =>
  asUser(conn, await getAdmin(), (c) => {
    const keys = Object.keys(set);
    return c.query(
      `UPDATE public.events SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [eventId, ...Object.values(set)],
    );
  });

const book = (actorId, userId, eventId, seats = 1, client = conn) =>
  asUser(client, actorId, (c) => c.query('SELECT public.book_event($1, $2, $3)', [userId, eventId, seats]));

const updateReservation = (actorId, userId, eventId, set) =>
  asUser(conn, actorId, (c) => {
    const keys = Object.keys(set);
    return c.query(
      `UPDATE public.reservations SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}
        WHERE user_id = $1 AND event_id = $2 RETURNING status, tickets_requested`,
      [userId, eventId, ...Object.values(set)],
    );
  });

async function state(eventId) {
  const { rows: [e] } = await db.admin.query('SELECT booked_count FROM public.events WHERE id = $1', [eventId]);
  const { rows } = await db.admin.query(
    'SELECT user_id, status, tickets_requested FROM public.reservations WHERE event_id = $1',
    [eventId],
  );
  const confirmed = rows.filter((r) => r.status === 'confirmed').reduce((n, r) => n + r.tickets_requested, 0);
  return { booked: e.booked_count, confirmed, rows };
}

// Every call that would have left the database (pg_net stub). Must stay 0 after 0032.
const outboundCalls = async () =>
  Number((await db.admin.query('SELECT count(*) FROM test_support.outbound_http')).rows[0].count);

const newEventNotifications = async (eventId) =>
  Number((await db.admin.query(
    `SELECT count(*) FROM public.notifications WHERE type = 'new_event' AND link_url = '/events/' || $1`,
    [eventId],
  )).rows[0].count);

const approvedUserCount = async () =>
  Number((await db.admin.query(`SELECT count(*) FROM public.users WHERE approval_status = 'approved'`)).rows[0].count);

// ── SEC-001: approval ────────────────────────────────────────────────────────

test('approved user can book; no outbound SMS call is made', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent();
  await book(user, user, ev, 2);
  const s = await state(ev);
  assert.equal(s.booked, 2);
  assert.deepEqual(s.rows.map((r) => r.status), ['confirmed']);
  assert.equal(await outboundCalls(), 0);
});

for (const approval of ['pending', 'rejected']) {
  test(`${approval} user cannot book and the failed call leaves no data`, async () => {
    const user = await makeUser(approval);
    const ev = await makeEvent();
    await assert.rejects(book(user, user, ev, 1), /not approved/i);
    const s = await state(ev);
    assert.equal(s.booked, 0);
    assert.equal(s.rows.length, 0);
  });
}

test('user cannot approve or promote themselves with a direct users UPDATE', async () => {
  const user = await makeUser('pending');
  await asUser(conn, user, (c) =>
    c.query(`UPDATE public.users SET approval_status = 'approved', role = 'admin', full_name = 'Renamed' WHERE id = $1`, [user]),
  );
  const { rows: [u] } = await db.admin.query('SELECT role, approval_status, full_name FROM public.users WHERE id = $1', [user]);
  assert.deepEqual(u, { role: 'user', approval_status: 'pending', full_name: 'Renamed' });
  const ev = await makeEvent();
  await assert.rejects(book(user, user, ev, 1), /not approved/i);
});

test('admin can still change approval status and role', async () => {
  const user = await makeUser('pending');
  await asUser(conn, await getAdmin(), (c) =>
    c.query(`UPDATE public.users SET approval_status = 'approved' WHERE id = $1`, [user]),
  );
  const { rows: [u] } = await db.admin.query('SELECT approval_status FROM public.users WHERE id = $1', [user]);
  assert.equal(u.approval_status, 'approved');
});

test('user cannot book on behalf of another user', async () => {
  const user = await makeUser('approved');
  const other = await makeUser('approved');
  const ev = await makeEvent();
  await assert.rejects(book(user, other, ev, 1), /only book for your own account/);
});

// ── BUG-001: event state ─────────────────────────────────────────────────────

const closedEvents = {
  past: { event_date: past() },
  cancelled: { status: 'cancelled' },
  completed: { status: 'completed' },
  draft: { is_published: false },
  archived: { is_archived: true },
};

for (const [name, overrides] of Object.entries(closedEvents)) {
  test(`approved user cannot book a ${name} event`, async () => {
    const user = await makeUser('approved');
    const ev = await makeEvent(overrides);
    await assert.rejects(book(user, user, ev, 1), /not open for booking/i);
    const s = await state(ev);
    assert.equal(s.booked, 0);
    assert.equal(s.rows.length, 0);
  });
}

// ── Direct reservation UPDATE bypass attempts ────────────────────────────────

test('user cannot reactivate a cancelled reservation with a direct UPDATE, even on an open event', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent();
  await book(user, user, ev, 1);
  await updateReservation(user, user, ev, { status: 'cancelled' });
  await assert.rejects(updateReservation(user, user, ev, { status: 'confirmed' }), /book_event/);
  await assert.rejects(updateReservation(user, user, ev, { status: 'confirmed', tickets_requested: 2 }), /book_event/);
  const s = await state(ev);
  assert.equal(s.booked, 0);
  assert.equal(s.rows[0].status, 'cancelled');
});

for (const [name, change] of Object.entries({
  cancelled: { status: 'cancelled' },
  past: { event_date: past() },
  unpublished: { is_published: false },
  archived: { is_archived: true },
})) {
  test(`user cannot change ticket count on a ${name} event with a direct UPDATE`, async () => {
    const user = await makeUser('approved');
    const ev = await makeEvent();
    await book(user, user, ev, 1);
    await adminUpdateEvent(ev, change);
    await assert.rejects(updateReservation(user, user, ev, { tickets_requested: 3 }), /not open for booking/i);
    assert.equal((await state(ev)).booked, 1);
  });
}

test('user who lost approval cannot change ticket count with a direct UPDATE', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent();
  await book(user, user, ev, 2);
  await asUser(conn, await getAdmin(), (c) => c.query(`UPDATE public.users SET approval_status = 'pending' WHERE id = $1`, [user]));
  await assert.rejects(updateReservation(user, user, ev, { tickets_requested: 3 }), /not approved/i);
  await assert.rejects(updateReservation(user, user, ev, { tickets_requested: 1 }), /not approved/i);
  assert.equal((await state(ev)).booked, 2);
});

test('approved user can change ticket count within limits on an open event (EventDetails flow)', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent({ capacity: 5, max_tickets_per_user: 4 });
  await book(user, user, ev, 1);
  await updateReservation(user, user, ev, { tickets_requested: 4 });
  assert.equal((await state(ev)).booked, 4);
  await updateReservation(user, user, ev, { tickets_requested: 2 });
  assert.equal((await state(ev)).booked, 2);
  await assert.rejects(updateReservation(user, user, ev, { tickets_requested: 5 }), /per-user limit/);
  await assert.rejects(updateReservation(user, user, ev, { tickets_requested: 0 }), /at least 1/);
  assert.equal((await state(ev)).booked, 2);
});

test('ticket increase cannot exceed capacity via direct UPDATE', async () => {
  const a = await makeUser('approved');
  const b = await makeUser('approved');
  const ev = await makeEvent({ capacity: 4, max_tickets_per_user: 4 });
  await book(a, a, ev, 2);
  await book(b, b, ev, 2);
  await assert.rejects(updateReservation(a, a, ev, { tickets_requested: 3 }), /Not enough capacity/);
  assert.equal((await state(ev)).booked, 4);
});

test('user can still cancel their reservation and the seats are released', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent();
  await book(user, user, ev, 3);
  await updateReservation(user, user, ev, { status: 'cancelled' });
  assert.equal((await state(ev)).booked, 0);
});

test("user cannot touch someone else's reservation", async () => {
  const owner = await makeUser('approved');
  const intruder = await makeUser('approved');
  const ev = await makeEvent();
  await book(owner, owner, ev, 1);
  const res = await updateReservation(intruder, owner, ev, { status: 'cancelled' });
  assert.equal(res.rowCount, 0);
  assert.equal((await state(ev)).rows[0].status, 'confirmed');
});

// ── Re-booking after cancel ──────────────────────────────────────────────────

test('user can re-book a cancelled reservation through book_event; checks run again', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent({ capacity: 10, max_tickets_per_user: 3 });
  await book(user, user, ev, 1);
  await updateReservation(user, user, ev, { status: 'cancelled' });
  await assert.rejects(book(user, user, ev, 4), /per-user limit/);
  await book(user, user, ev, 3);
  const s = await state(ev);
  assert.equal(s.booked, 3);
  assert.deepEqual(s.rows.map((r) => [r.status, r.tickets_requested]), [['confirmed', 3]]);
  await assert.rejects(book(user, user, ev, 1), /Already booked/);
});

test('re-booking is refused when the event closed or approval was withdrawn after cancel', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent();
  await book(user, user, ev, 1);
  await updateReservation(user, user, ev, { status: 'cancelled' });
  await adminUpdateEvent(ev, { status: 'cancelled' });
  await assert.rejects(book(user, user, ev, 1), /not open for booking/i);

  const user2 = await makeUser('approved');
  const ev2 = await makeEvent();
  await book(user2, user2, ev2, 1);
  await updateReservation(user2, user2, ev2, { status: 'cancelled' });
  await asUser(conn, await getAdmin(), (c) => c.query(`UPDATE public.users SET approval_status = 'pending' WHERE id = $1`, [user2]));
  await assert.rejects(book(user2, user2, ev2, 1), /not approved/i);
  assert.equal((await state(ev)).booked + (await state(ev2)).booked, 0);
});

// ── Capacity and per-user limits ─────────────────────────────────────────────

test('book_event enforces capacity, per-user limit and minimum seat count', async () => {
  const a = await makeUser('approved');
  const b = await makeUser('approved');
  const ev = await makeEvent({ capacity: 3, max_tickets_per_user: 2 });
  await assert.rejects(book(a, a, ev, 3), /per-user limit/);
  await assert.rejects(book(a, a, ev, 0), /at least 1/);
  await book(a, a, ev, 2);
  await assert.rejects(book(b, b, ev, 2), /fully booked/);
  await book(b, b, ev, 1);
  const s = await state(ev);
  assert.equal(s.booked, 3);
  assert.equal(s.confirmed, 3);
});

// Holds the event row lock until every competitor is queued on it, then releases,
// so the requests genuinely contend on separate server connections.
async function race(eventId, competitors) {
  const blocker = await db.connect();
  const clients = await Promise.all(competitors.map(() => db.connect()));
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT 1 FROM public.events WHERE id = $1 FOR UPDATE', [eventId]);
    const pids = await Promise.all(clients.map(async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
    const settled = Promise.allSettled(competitors.map((run, i) => run(clients[i])));
    for (let i = 0; ; i++) {
      const { rows: [w] } = await db.admin.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = ANY($1) AND wait_event_type = 'Lock'`,
        [pids],
      );
      if (w.n === competitors.length) break;
      if (i > 200) throw new Error(`only ${w.n}/${competitors.length} competitors queued on the lock`);
      await new Promise((r) => setTimeout(r, 25));
    }
    await blocker.query('COMMIT');
    return await settled;
  } finally {
    await Promise.all([blocker, ...clients].map((c) => c.end()));
  }
}

test('concurrent requests for the last seat: exactly one wins', async () => {
  const holder = await makeUser('approved');
  const ev = await makeEvent({ capacity: 3, max_tickets_per_user: 2 });
  await book(holder, holder, ev, 2);
  const users = await Promise.all(Array.from({ length: 6 }, () => makeUser('approved')));
  const results = await race(ev, users.map((u) => (c) => book(u, u, ev, 1, c)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results.filter((r) => r.status === 'rejected')) assert.match(r.reason.message, /fully booked/);
  const s = await state(ev);
  assert.equal(s.booked, 3);
  assert.equal(s.confirmed, 3);
});

test('concurrent ticket increase and new booking for the last seat: exactly one wins', async () => {
  const holder = await makeUser('approved');
  const newcomer = await makeUser('approved');
  const ev = await makeEvent({ capacity: 2, max_tickets_per_user: 2 });
  await book(holder, holder, ev, 1);
  const results = await race(ev, [
    (c) => asUser(c, holder, (x) => x.query('UPDATE public.reservations SET tickets_requested = 2 WHERE user_id = $1 AND event_id = $2', [holder, ev])),
    (c) => book(newcomer, newcomer, ev, 1, c),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const s = await state(ev);
  assert.equal(s.booked, 2);
  assert.equal(s.confirmed, 2);
});

// ── Existing admin exceptions ────────────────────────────────────────────────

test('admin keeps booking overrides: other users, over capacity, over limit, closed events', async () => {
  const admin = await getAdmin();
  const pending = await makeUser('pending');
  const ev = await makeEvent({ capacity: 1, max_tickets_per_user: 1 });
  await book(admin, pending, ev, 3);
  assert.equal((await state(ev)).booked, 3);

  const closed = await makeEvent({ status: 'completed' });
  await book(admin, pending, closed, 1);
  assert.equal((await state(closed)).booked, 1);
});

test('admin keeps direct reservation edits: ticket change, cancel, reactivate', async () => {
  const admin = await getAdmin();
  const user = await makeUser('approved');
  const ev = await makeEvent({ capacity: 2, max_tickets_per_user: 1 });
  await book(user, user, ev, 1);
  await updateReservation(admin, user, ev, { tickets_requested: 5 });
  assert.equal((await state(ev)).booked, 5);
  await updateReservation(admin, user, ev, { status: 'cancelled' });
  assert.equal((await state(ev)).booked, 0);
  await updateReservation(admin, user, ev, { status: 'confirmed' });
  assert.equal((await state(ev)).booked, 5);
});

// ── BUG-003: new-event notification ──────────────────────────────────────────

test('creating a draft sends no new-event notification', async () => {
  const ev = await makeEvent({ is_published: false });
  assert.equal(await newEventNotifications(ev), 0);
});

test('creating a published event notifies every approved user once', async () => {
  await makeUser('pending');
  const ev = await makeEvent();
  assert.equal(await newEventNotifications(ev), await approvedUserCount());
  const { rows } = await db.admin.query(
    `SELECT count(*)::int AS n FROM public.notifications n JOIN public.users u ON u.id = n.user_id
      WHERE n.link_url = '/events/' || $1 AND u.approval_status <> 'approved'`,
    [ev],
  );
  assert.equal(rows[0].n, 0);
});

test('first publish of a draft notifies once; edits and unpublish/re-publish do not repeat it', async () => {
  const ev = await makeEvent({ is_published: false });
  await adminUpdateEvent(ev, { title: 'Draft edited' });
  assert.equal(await newEventNotifications(ev), 0);

  await adminUpdateEvent(ev, { is_published: true });
  const once = await approvedUserCount();
  assert.equal(await newEventNotifications(ev), once);

  await adminUpdateEvent(ev, { title: 'Edited after publish', capacity: 20 });
  await adminUpdateEvent(ev, { is_published: false });
  await adminUpdateEvent(ev, { is_published: true });
  assert.equal(await newEventNotifications(ev), once);
});

test('publishing an event that is not bookable (cancelled, archived, past) sends nothing', async () => {
  for (const overrides of [{ status: 'cancelled' }, { is_archived: true }, { event_date: past() }]) {
    const created = await makeEvent(overrides);
    assert.equal(await newEventNotifications(created), 0, JSON.stringify(overrides));
    const draft = await makeEvent({ ...overrides, is_published: false });
    await adminUpdateEvent(draft, { is_published: true });
    assert.equal(await newEventNotifications(draft), 0, JSON.stringify(overrides));
  }
});

test('a failed event insert leaves no notifications behind', async () => {
  const before = Number((await db.admin.query('SELECT count(*) FROM public.notifications')).rows[0].count);
  await assert.rejects(makeEvent({ capacity: 0 }), /check constraint/);
  const afterCount = Number((await db.admin.query('SELECT count(*) FROM public.notifications')).rows[0].count);
  assert.equal(afterCount, before);
});

// ── In-app notifications only (0032) ─────────────────────────────────────────

const notificationsOf = async (userId, type) =>
  (await db.admin.query(
    'SELECT id, link_url, is_read FROM public.notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at, id',
    [userId, type],
  )).rows;

test('push/SMS triggers and the http_post wrapper are removed; in-app triggers remain', async () => {
  const { rows } = await db.admin.query(
    `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid IN ('public.notifications'::regclass, 'public.reservations'::regclass,
                        'public.events'::regclass, 'public.ticket_messages'::regclass)`,
  );
  const names = rows.map((r) => r.tgname);
  for (const gone of ['trg_send_push_on_notification', 'trg_send_booking_sms_on_reservation']) {
    assert.ok(!names.includes(gone), gone);
  }
  for (const kept of ['trg_notify_on_new_event', 'trg_notify_on_event_cancel', 'trg_notify_on_capacity_threshold', 'trg_notify_on_ticket_reply']) {
    assert.ok(names.includes(kept), kept);
  }
  const { rows: fns } = await db.admin.query(
    `SELECT p.oid::regprocedure::text AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname IN ('trigger_send_push_notification', 'trigger_send_booking_sms'))
         OR (n.nspname = 'extensions' AND p.proname = 'http_post')`,
  );
  assert.deepEqual(fns, []);
});

test('event cancellation writes an in-app notification for confirmed attendees', async () => {
  const user = await makeUser('approved');
  const ev = await makeEvent();
  await book(user, user, ev, 1);
  await adminUpdateEvent(ev, { status: 'cancelled' });
  assert.deepEqual((await notificationsOf(user, 'cancelled_event')).map((n) => n.link_url), [`/events/${ev}`]);
});

test('capacity threshold writes an in-app alert for interested users', async () => {
  const fan = await makeUser('approved');
  const other = await makeUser('approved');
  const ev = await makeEvent({ capacity: 20, category: `Cat-${randomUUID().slice(0, 6)}` });
  await book(fan, fan, ev, 1); // records the fan's category interest
  await book(await getAdmin(), other, ev, 14); // admin override: 15/20 → threshold
  assert.equal((await notificationsOf(fan, 'capacity_alert')).length, 1);
});

test('admin support reply writes an in-app notification for the ticket owner', async () => {
  const user = await makeUser('approved');
  const { rows: [ticket] } = await asUser(conn, user, (c) =>
    c.query(`INSERT INTO public.support_tickets (user_id, subject) VALUES ($1, 'Yardım') RETURNING id`, [user]),
  );
  await asUser(conn, await getAdmin(), (c) =>
    c.query(
      `INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_role, message) VALUES ($1, auth.uid(), 'admin', 'Merhaba')`,
      [ticket.id],
    ),
  );
  assert.deepEqual(
    (await notificationsOf(user, 'ticket_reply')).map((n) => n.link_url),
    [`/profile?tab=support&ticketId=${ticket.id}`],
  );
});

const insertNotification = (actorId, userId) =>
  asUser(conn, actorId, (c) =>
    c.query(`INSERT INTO public.notifications (user_id, title, message, type) VALUES ($1, 'Duyuru', 'Metin', 'announcement')`, [userId]),
  );

test('admin can insert notifications directly (broadcast / user detail); users cannot', async () => {
  const user = await makeUser('approved');
  await insertNotification(await getAdmin(), user);
  assert.equal((await notificationsOf(user, 'announcement')).length, 1);
  await assert.rejects(insertNotification(user, user), /row-level security/);
});

test('users see, mark read and delete only their own notifications (NotificationBell)', async () => {
  const owner = await makeUser('approved');
  const other = await makeUser('approved');
  await insertNotification(await getAdmin(), owner);
  await insertNotification(await getAdmin(), owner);
  const [first, second] = await notificationsOf(owner, 'announcement');

  const asOther = (sql, params) => asUser(conn, other, (c) => c.query(sql, params));
  assert.equal((await asOther('SELECT id FROM public.notifications WHERE user_id = $1', [owner])).rowCount, 0);
  assert.equal((await asOther('UPDATE public.notifications SET is_read = true WHERE id = $1', [first.id])).rowCount, 0);
  assert.equal((await asOther('DELETE FROM public.notifications WHERE id = $1', [first.id])).rowCount, 0);

  const asOwner = (sql, params) => asUser(conn, owner, (c) => c.query(sql, params));
  assert.equal((await asOwner('SELECT id FROM public.notifications', [])).rowCount, 2);
  await asOwner('UPDATE public.notifications SET is_read = true WHERE id = ANY($1)', [[first.id, second.id]]);
  assert.deepEqual((await notificationsOf(owner, 'announcement')).map((n) => n.is_read), [true, true]);
  await asOwner('DELETE FROM public.notifications WHERE id = $1', [second.id]);
  assert.equal((await notificationsOf(owner, 'announcement')).length, 1);
});

test('notifications stay in the supabase_realtime publication', async () => {
  const { rows } = await db.admin.query(
    `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' ORDER BY 1`,
  );
  assert.deepEqual(rows.map((r) => r.tablename), ['notifications', 'support_tickets', 'ticket_messages']);
});

test('live verification query (supabase/checks/verify_0031_0032.sql) reports no HATA', async () => {
  const sql = await readFile(new URL('../checks/verify_0031_0032.sql', import.meta.url), 'utf8');
  const { rows } = await db.admin.query(sql);
  assert.ok(rows.length >= 25);
  assert.deepEqual(rows.filter((r) => r.durum === 'HATA'), []);
});

// Keep last: every flow above (bookings, re-bookings, races, all notification
// triggers, direct inserts) must have produced zero outbound HTTP calls.
test('no flow produced an outbound HTTP / SMS / push call', async () => {
  assert.ok(Number((await db.admin.query('SELECT count(*) FROM public.notifications')).rows[0].count) > 0);
  assert.equal(await outboundCalls(), 0);
});
