import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, Tag, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  category: string | null;
  status: 'active' | 'cancelled' | 'completed';
}

interface AttendeeUser {
  id: string;
  full_name: string | null;
  email: string;
}

interface Attendee {
  id: string;
  created_at: string;
  users: AttendeeUser | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ── CSV Export ───────────────────────────────────────────────────────────────
//
// Each cell is wrapped in double-quotes and internal double-quotes are escaped
// by doubling them (RFC 4180). Lines are separated by \r\n. A UTF-8 BOM prefix
// (﻿) is prepended so that Excel on Windows opens the file without an
// encoding prompt and renders non-ASCII characters (accented names, etc.) correctly.

function exportToCSV(attendees: Attendee[], eventTitle: string) {
  const esc = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const header = ['Name', 'Email', 'Booked At'].map(esc).join(',');

  const rows = attendees.map((a) =>
    [
      a.users?.full_name ?? '',
      a.users?.email ?? '',
      formatShortDate(a.created_at),
    ]
      .map(esc)
      .join(','),
  );

  const csv = '﻿' + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `attendees-${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ── Skeleton loaders ─────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-48 w-full rounded-2xl bg-muted" />
      <div className="h-7 w-64 rounded bg-muted" />
      <div className="flex gap-3">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="h-5 w-24 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}

function TableSkeletonRow() {
  return (
    <tr className="animate-pulse border-b">
      <td className="p-4"><div className="h-4 w-32 rounded bg-muted" /></td>
      <td className="p-4"><div className="h-4 w-48 rounded bg-muted" /></td>
      <td className="p-4"><div className="h-4 w-28 rounded bg-muted" /></td>
    </tr>
  );
}

function AttendeeCardSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl border bg-card p-4">
      <div className="h-4 w-36 rounded bg-muted" />
      <div className="h-3 w-48 rounded bg-muted" />
      <div className="h-3 w-28 rounded bg-muted" />
    </div>
  );
}

// ── Stat block ───────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold', accent ? 'text-primary' : 'text-foreground')}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminEventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchData(id);
  }, [id]);

  async function fetchData(eventId: string) {
    setLoading(true);

    const [eventRes, attendeesRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, description, image_url, event_date, capacity, category, status')
        .eq('id', eventId)
        .single(),
      supabase
        .from('reservations')
        .select('id, created_at, users(id, full_name, email)')
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true }),
    ]);

    if (eventRes.error) {
      toast.error('Event not found.');
      navigate('/admin/events', { replace: true });
      return;
    }

    setEvent(eventRes.data);
    setAttendees((attendeesRes.data ?? []) as unknown as Attendee[]);
    setLoading(false);
  }

  const booked = attendees.length;
  const available = event ? Math.max(event.capacity - booked, 0) : 0;
  const fillPct = event && event.capacity > 0
    ? Math.min(Math.round((booked / event.capacity) * 100), 100)
    : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      {/* Back navigation */}
      <button
        onClick={() => navigate('/admin/events')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events
      </button>

      {loading ? (
        <HeaderSkeleton />
      ) : event ? (
        <>
          {/* Event header */}
          {event.image_url && (
            <div className="mb-5 overflow-hidden rounded-2xl">
              <img
                src={event.image_url}
                alt={event.title}
                className="h-48 w-full object-cover sm:h-64"
              />
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                event.status === 'active'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : event.status === 'completed'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              {event.status}
            </span>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {formatDate(event.event_date)}
            </span>
            {event.category && (
              <span className="flex items-center gap-1.5">
                <Tag className="h-4 w-4" />
                {event.category}
              </span>
            )}
          </div>

          {/* Capacity stats */}
          <div className="mb-8 space-y-3">
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <StatBlock label="Capacity" value={event.capacity} />
              <StatBlock label="Booked" value={booked} accent />
              <StatBlock label="Available" value={available} sub={`${fillPct}% full`} />
            </div>

            {/* Fill bar */}
            <div className="overflow-hidden rounded-full bg-muted" style={{ height: '6px' }}>
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  fillPct >= 100 ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {/* Attendees section */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">
                Attendees
                {booked > 0 && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    ({booked})
                  </span>
                )}
              </h2>
            </div>

            {attendees.length > 0 && (
              <button
                onClick={() => exportToCSV(attendees, event.title)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          {/* ── Desktop attendee table (md+) ─────────────────────────────── */}
          {attendees.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto rounded-xl border md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {['Name', 'Email', 'Booked At'].map((h) => (
                        <th
                          key={h}
                          className="p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendees.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b last:border-0 transition-colors hover:bg-muted/40"
                      >
                        <td className="p-4">
                          <p className="text-sm font-medium text-foreground">
                            {a.users?.full_name ?? '—'}
                          </p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-muted-foreground">{a.users?.email ?? '—'}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-muted-foreground">
                            {formatShortDate(a.created_at)}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile attendee cards (< md) ───────────────────────── */}
              <div className="space-y-3 md:hidden">
                {attendees.map((a) => (
                  <div key={a.id} className="rounded-xl border bg-card p-4 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {a.users?.full_name ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">{a.users?.email ?? '—'}</p>
                    <p className="text-xs text-muted-foreground/70">
                      Booked {formatShortDate(a.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No attendees yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Confirmed bookings will appear here.
              </p>
            </div>
          )}
        </>
      ) : null}

      {/* Skeleton for attendee table while still loading */}
      {loading && (
        <div className="mt-8 space-y-3">
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full">
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <TableSkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {[0, 1, 2].map((i) => <AttendeeCardSkeleton key={i} />)}
          </div>
        </div>
      )}
    </main>
  );
}
