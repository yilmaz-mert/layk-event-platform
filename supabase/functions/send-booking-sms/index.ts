import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ReservationRecord {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  tickets_requested: number;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ReservationRecord;
  old_record: ReservationRecord | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER SMS/WhatsApp provider config (Twilio-shaped). No real provider
// wired up yet — set these as Edge Function secrets once one is chosen:
//   supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=...
// ─────────────────────────────────────────────────────────────────────────────
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER');

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const payload: WebhookPayload = await req.json();

    if (payload.type !== 'INSERT' || payload.table !== 'reservations') {
      return new Response('Ignored', { status: 200 });
    }

    const { user_id, event_id, tickets_requested } = payload.record;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[send-booking-sms] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response('Server misconfiguration', { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // The trigger payload only carries the raw reservations row — resolve the
    // phone number and event title ourselves with the service-role client.
    const [{ data: user, error: userError }, { data: event, error: eventError }] = await Promise.all([
      adminClient.from('users').select('phone_number, full_name').eq('id', user_id).single(),
      adminClient.from('events').select('title').eq('id', event_id).single(),
    ]);

    if (userError || eventError) {
      console.error(
        '[send-booking-sms] Failed to fetch user/event:',
        userError?.message,
        eventError?.message,
      );
      return new Response('DB error', { status: 500 });
    }

    if (!user?.phone_number) {
      console.log('[send-booking-sms] No phone_number for user', user_id, '— skipping.');
      return new Response('No phone number', { status: 200 });
    }

    const message =
      `Merhaba ${user.full_name ?? ''}, "${event?.title ?? 'etkinlik'}" için ` +
      `${tickets_requested} kişilik rezervasyonunuz onaylandı.`;

    // ── STUB: log what would be sent instead of calling a real provider ──────
    console.log('[send-booking-sms] Would send SMS/WhatsApp:', {
      to: user.phone_number,
      message,
      provider: 'twilio (stub — not yet configured)',
    });

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      console.warn('[send-booking-sms] Twilio credentials not configured — stub only, no request sent.');
      return new Response(JSON.stringify({ ok: true, stub: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Example real integration (left commented — no provider requested) ────
    // const twilioResponse = await fetch(
    //   `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       Authorization: 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
    //       'Content-Type': 'application/x-www-form-urlencoded',
    //     },
    //     body: new URLSearchParams({
    //       To: `whatsapp:${user.phone_number}`,
    //       From: `whatsapp:${TWILIO_FROM_NUMBER}`,
    //       Body: message,
    //     }),
    //   },
    // );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-booking-sms] Unhandled error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
