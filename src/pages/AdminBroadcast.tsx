import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

type TargetType = 'all' | 'specific' | 'event_attendees';

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

interface EventRow {
  id: string;
  title: string;
  event_date: string;
}

function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export default function AdminBroadcast() {
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetEventId, setTargetEventId] = useState('');
  const [sending, setSending] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    async function loadData() {
      const [usersRes, eventsRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, full_name, email, approval_status')
          .order('full_name', { ascending: true }),
        supabase
          .from('events')
          .select('id, title, event_date')
          .eq('status', 'active')
          .order('event_date', { ascending: true }),
      ]);
      if (usersRes.data) setUsers(usersRes.data as UserRow[]);
      if (eventsRes.data) setEvents(eventsRes.data as EventRow[]);
    }
    loadData();
  }, []);

  const approvedUsers = users.filter((u) => u.approval_status === 'approved');

  function recipientHint(): string {
    if (targetType === 'all') {
      return `${approvedUsers.length} approved user${approvedUsers.length !== 1 ? 's' : ''} will receive this.`;
    }
    if (targetType === 'specific') return 'One user will receive this.';
    return 'All confirmed attendees of the selected event will receive this.';
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    let recipientIds: string[] = [];

    if (targetType === 'all') {
      recipientIds = approvedUsers.map((u) => u.id);
    } else if (targetType === 'specific') {
      recipientIds = [targetUserId];
    } else {
      const { data, error } = await supabase
        .from('reservations')
        .select('user_id')
        .eq('event_id', targetEventId)
        .eq('status', 'confirmed');
      if (error) {
        toast.error(error.message);
        setSending(false);
        return;
      }
      recipientIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    }

    if (recipientIds.length === 0) {
      toast.error('No recipients found for the selected audience.');
      setSending(false);
      return;
    }

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      title: title.trim(),
      message: message.trim(),
      type: 'admin_broadcast',
    }));

    const { error } = await supabase.from('notifications').insert(rows);

    if (error) {
      toast.error(error.message);
    } else {
      const count = recipientIds.length;
      const noun =
        targetType === 'event_attendees'
          ? `${count} attendee${count !== 1 ? 's' : ''}`
          : `${count} user${count !== 1 ? 's' : ''}`;
      toast.success(`Broadcast sent to ${noun}.`);
      setTitle('');
      setMessage('');
      setTargetUserId('');
      setTargetEventId('');
    }

    setSending(false);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Broadcast Center</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Send targeted notifications to your members.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <form onSubmit={handleBroadcast} className="space-y-5">
          {/* Audience */}
          <fieldset>
            <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Audience
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5">
              {(
                [
                  ['all', 'All Approved Users'],
                  ['specific', 'Specific User'],
                  ['event_attendees', 'Event Attendees'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="targetType"
                    value={value}
                    checked={targetType === value}
                    onChange={() => {
                      setTargetType(value);
                      setTargetUserId('');
                      setTargetEventId('');
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* User picker */}
          {targetType === 'specific' && (
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                </option>
              ))}
            </select>
          )}

          {/* Event picker */}
          {targetType === 'event_attendees' && (
            <select
              value={targetEventId}
              onChange={(e) => setTargetEventId(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select an event…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {formatEventDate(ev.event_date)}
                </option>
              ))}
            </select>
          )}

          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Message */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message…"
            required
            rows={4}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-xs text-muted-foreground">{recipientHint()}</p>
            <button
              type="submit"
              disabled={sending}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
