import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronRight, Download, MapPin, Tag, Users, X } from 'lucide-react';
import { supabase, formatDateTime, formatPrice } from '@layk/core';
import { useToast } from '@/components/Toast';
import { cn } from '@layk/core';

// ── Types ────────────────────────────────────────────────────────────────────

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  category: string | null;
  price: number;
  location: string | null;
  closing_comment: string | null;
  is_published: boolean;
  status: 'active' | 'cancelled' | 'completed';
  event_categories: { name: string; color_code: string } | null;
}

interface AttendeeUser {
  id: string;
  full_name: string | null;
  email: string;
}

interface Attendee {
  id: string;
  created_at: string;
  tickets_requested: number;
  users: AttendeeUser | null;
}

interface AuditLog {
  id: string;
  action_type: 'booked' | 'cancelled' | 'edited';
  tickets_changed: number;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

function formatLogAction(log: AuditLog): string {
  const abs = Math.abs(log.tickets_changed);
  const seat = (n: number) => `${n} kişi`;
  switch (log.action_type) {
    case 'booked':
      return `${seat(log.tickets_changed)} rezerve edildi`;
    case 'cancelled':
      return `İptal edildi · ${seat(abs)} serbest bırakıldı`;
    case 'edited':
      if (log.tickets_changed > 0) return `${seat(log.tickets_changed)} artırıldı`;
      if (log.tickets_changed < 0) return `${seat(abs)} azaltıldı`;
      return 'Rezervasyon güncellendi';
  }
}

// ── CSV Export ───────────────────────────────────────────────────────────────
//
// UTF-8 BOM prefix ensures Excel opens the file without encoding prompts.

function exportToCSV(attendees: Attendee[], eventTitle: string) {
  const esc = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const header = ['Ad Soyad', 'E-posta', 'Bilet', 'Rezervasyon Tarihi'].map(esc).join(',');

  const rows = attendees.map((a) =>
    [
      a.users?.full_name ?? '',
      a.users?.email ?? '',
      a.tickets_requested.toString(),
      formatDateTime(a.created_at),
    ]
      .map(esc)
      .join(','),
  );

  const csv = '﻿' + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `katilimcilar-${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
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
      <td className="p-4"><div className="h-4 w-4 rounded bg-muted" /></td>
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

// ── Attendee History Drawer ───────────────────────────────────────────────────

function AttendeeHistoryDrawer({
  attendee,
  onClose,
}: {
  attendee: Attendee;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Tracks the slide-out delay so it can be cancelled on unmount
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger enter animation after first paint
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Clear slide-out timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape key — reads ref to avoid stale closure
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setVisible(false);
        timeoutRef.current = setTimeout(() => onCloseRef.current(), 300);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Fetch audit log for this reservation
  useEffect(() => {
    let cancelled = false;

    supabase
      .from('reservation_audit_logs')
      .select('id, action_type, tickets_changed, created_at')
      .eq('reservation_id', attendee.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setLogs((data ?? []) as AuditLog[]);
          setLoadingLogs(false);
        }
      });

    return () => { cancelled = true; };
  }, [attendee.id]);

  function handleClose() {
    setVisible(false);
    timeoutRef.current = setTimeout(() => onCloseRef.current(), 300);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={handleClose}
      />

      {/* Sliding panel */}
      <div
        className={cn(
          'relative z-10 flex h-full w-full max-w-sm flex-col overflow-hidden border-l bg-card shadow-2xl',
          'transition-transform duration-300 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {attendee.users?.full_name ?? 'Bilinmeyen Kullanıcı'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {attendee.users?.email ?? '—'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Booking meta */}
          <div className="space-y-2 border-b px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bilet</span>
              <span className="font-medium text-foreground">
                {attendee.tickets_requested} kişi
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Rezervasyon tarihi</span>
              <span className="font-medium text-foreground">
                {formatDateTime(attendee.created_at)}
              </span>
            </div>
          </div>

          {/* Activity timeline */}
          <div className="px-5 py-4">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Etkinlik Geçmişi
            </p>

            {loadingLogs ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex animate-pulse gap-3">
                    <div className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full bg-muted" />
                    <div className="flex-1 space-y-1.5 pt-0.5">
                      <div className="h-3.5 w-3/4 rounded bg-muted" />
                      <div className="h-3 w-1/2 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Henüz kayıtlı bir etkinlik yok.
              </p>
            ) : (
              <div>
                {logs.map((log, i) => (
                  <div key={log.id} className="relative flex gap-3">
                    {/* Connecting line to next item */}
                    {i < logs.length - 1 && (
                      <div className="absolute bottom-0 left-[8px] top-5 w-px bg-border" />
                    )}

                    {/* Status dot */}
                    <div
                      className={cn(
                        'relative mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full ring-2 ring-card',
                        log.action_type === 'booked'
                          ? 'bg-green-500'
                          : log.action_type === 'cancelled'
                            ? 'bg-destructive'
                            : 'bg-primary/70',
                      )}
                    />

                    {/* Entry content */}
                    <div className="pb-4">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          log.action_type === 'booked'
                            ? 'text-green-600 dark:text-green-400'
                            : log.action_type === 'cancelled'
                              ? 'text-destructive'
                              : 'text-foreground',
                        )}
                      >
                        {formatLogAction(log)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [closingComment, setClosingComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const fetchData = useCallback(async (eventId: string) => {
    setLoading(true);

    const [eventRes, attendeesRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, description, image_url, event_date, capacity, category, price, location, closing_comment, is_published, status, event_categories(name, color_code)',
        )
        .eq('id', eventId)
        .single(),
      supabase
        .from('reservations')
        .select('id, created_at, tickets_requested, users(id, full_name, email)')
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true }),
    ]);

    if (eventRes.error) {
      toast.error('Etkinlik bulunamadı.');
      navigate('/admin/events', { replace: true });
      return;
    }

    setEvent(eventRes.data as unknown as EventDetail);
    setClosingComment(eventRes.data.closing_comment ?? '');
    setAttendees((attendeesRes.data ?? []) as unknown as Attendee[]);
    setLoading(false);
  }, [toast, navigate]);

  useEffect(() => {
    if (id) fetchData(id);
  }, [id, fetchData]);

  async function handleSaveClosingComment() {
    if (!event) return;
    setSavingComment(true);
    const trimmed = closingComment.trim() || null;
    const { error } = await supabase
      .from('events')
      .update({ closing_comment: trimmed })
      .eq('id', event.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Kapanış notu kaydedildi.');
      setEvent((prev) => (prev ? { ...prev, closing_comment: trimmed } : prev));
    }
    setSavingComment(false);
  }

  const totalBooked = attendees.reduce((sum, a) => sum + (a.tickets_requested || 1), 0);
  const available = event ? Math.max(event.capacity - totalBooked, 0) : 0;
  const fillPct =
    event && event.capacity > 0
      ? Math.min(Math.round((totalBooked / event.capacity) * 100), 100)
      : 0;
  const categoryLabel = event?.event_categories?.name ?? event?.category ?? null;
  const categoryColor = event?.event_categories?.color_code;
  const statusLabel = event
    ? event.status === 'active' ? 'Aktif' : event.status === 'completed' ? 'Tamamlandı' : 'İptal Edildi'
    : '';

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {/* Back navigation */}
        <button
          onClick={() => navigate('/admin/events')}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Etkinliklere Dön
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
              <div className="flex items-center gap-2">
                {!event.is_published && (
                  <span className="rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                    Taslak
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    event.status === 'active'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : event.status === 'completed'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {statusLabel}
                </span>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatDateTime(event.event_date, 'short')}
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </span>
              )}
              {categoryLabel && (
                <span
                  className="flex items-center gap-1.5 rounded-full px-2 py-0.5"
                  style={categoryColor ? { backgroundColor: `${categoryColor}1A`, color: categoryColor } : undefined}
                >
                  <Tag className="h-4 w-4" />
                  {categoryLabel}
                </span>
              )}
              <span className="font-semibold text-primary">{formatPrice(event.price)}</span>
            </div>

            {/* Capacity stats */}
            <div className="mb-8 space-y-3">
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <StatBlock label="Kontenjan" value={event.capacity} />
                <StatBlock label="Rezerve Edilen" value={totalBooked} accent />
                <StatBlock label="Boş Kontenjan" value={available} sub={`%${fillPct} dolu`} />
              </div>

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
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">
                  Katılımcılar
                  {attendees.length > 0 && (
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      ({attendees.length})
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
                  CSV İndir
                </button>
              )}
            </div>

            {attendees.length > 0 ? (
              <>
                {/* Desktop table (md+) */}
                <div className="hidden overflow-x-auto rounded-xl border md:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {['Ad Soyad', 'E-posta', 'Rezervasyon Tarihi', ''].map((h, i) => (
                          <th
                            key={i}
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
                          className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                          onClick={() => setSelectedAttendee(a)}
                        >
                          <td className="p-4">
                            <p className="text-sm font-medium text-foreground">
                              {a.users?.full_name ?? '—'}
                            </p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm text-muted-foreground">
                              {a.users?.email ?? '—'}
                            </p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm text-muted-foreground">
                              {formatDateTime(a.created_at)}
                            </p>
                          </td>
                          <td className="p-4 text-muted-foreground/40">
                            <ChevronRight className="h-4 w-4" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards (< md) */}
                <div className="space-y-3 md:hidden">
                  {attendees.map((a) => (
                    <div
                      key={a.id}
                      className="flex cursor-pointer items-start justify-between rounded-xl border bg-card p-4 transition hover:bg-muted/40 hover:shadow-sm"
                      onClick={() => setSelectedAttendee(a)}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {a.users?.full_name ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">{a.users?.email ?? '—'}</p>
                        <p className="text-xs text-muted-foreground/70">
                          Rezervasyon: {formatDateTime(a.created_at)}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">Henüz katılımcı yok</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Onaylanan rezervasyonlar burada görünecek.
                </p>
              </div>
            )}

            {/* Closing comment editor — only relevant once the event is completed */}
            {event.status === 'completed' && (
              <section className="mt-10 rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-base font-semibold text-foreground">Kapanış Notu</h2>
                <textarea
                  rows={4}
                  value={closingComment}
                  onChange={(e) => setClosingComment(e.target.value)}
                  placeholder="Katılımcılara gösterilecek kapanış notunu yazın…"
                  className={cn(inputClass, 'resize-none')}
                />
                <button
                  onClick={handleSaveClosingComment}
                  disabled={savingComment}
                  className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingComment ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </section>
            )}
          </>
        ) : null}

        {/* Attendee table skeleton while loading */}
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
              {[0, 1, 2].map((i) => (
                <AttendeeCardSkeleton key={i} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Audit log drawer — rendered outside <main> to cover full viewport */}
      {selectedAttendee && (
        <AttendeeHistoryDrawer
          attendee={selectedAttendee}
          onClose={() => setSelectedAttendee(null)}
        />
      )}
    </>
  );
}
