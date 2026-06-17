import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link_url: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: NotificationRecord;
  old_record: NotificationRecord | null;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const payload: WebhookPayload = await req.json();

    // Only process INSERTs on the notifications table
    if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
      return new Response('Ignored', { status: 200 });
    }

    const { user_id, title, message, link_url } = payload.record;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[send-push] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response('Server misconfiguration', { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: user, error } = await adminClient
      .from('users')
      .select('push_token')
      .eq('id', user_id)
      .single();

    if (error) {
      console.error('[send-push] Failed to fetch user push_token:', error.message);
      return new Response('DB error', { status: 500 });
    }

    if (!user?.push_token) {
      console.log('[send-push] No push_token for user', user_id, '— skipping.');
      return new Response('No token', { status: 200 });
    }

    const expoPayload = {
      to: user.push_token,
      title,
      body: message,
      sound: 'default',
      data: { url: link_url ?? '' },
    };

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPayload),
    });

    if (!expoResponse.ok) {
      const body = await expoResponse.text();
      console.error('[send-push] Expo API error:', expoResponse.status, body);
      return new Response('Expo API error', { status: 502 });
    }

    const expoResult = await expoResponse.json();
    console.log('[send-push] Delivered push for user', user_id, JSON.stringify(expoResult));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-push] Unhandled error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
