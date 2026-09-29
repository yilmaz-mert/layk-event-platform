import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Download, Pencil, Users, X } from 'lucide-react';
import { supabase, formatDateTime, formatPrice } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import { cn } from '@layk/core';
import type { EventCategory } from '@/components/CategoryManagerModal';
import EventFormModal, { adminInputClass, type AdminEventRecord } from '@/components/admin/EventFormModal';
import { CategoryLabel, EventStateBadges } from '@/components/admin/eventUi';
import { formatEventDay, formatEventTime } from '@/lib/eventDisplay';

// ── Types ────────────────────────────────────────────────────────────────────

interface EventDetail extends AdminEventRecord {
  closing_comment: string | null;
}

// The note editor edits the cancellation note while cancelled, otherwise the closing note.
const noteField = (e: EventDetail) => (e.status === 'cancelled' ? 'cancellation_note' : 'closing_comment');
const noteOf = (e: EventDetail) => e[noteField(e)];

const eventSelect =
  'id, title, description, image_url, event_date, capacity, booked_count, max_tickets_per_user, category, category_id, price, location, closing_comment, is_published, is_archived, status, cancellation_note, reopen_notice_pending, created_at, event_categories(name, color_code)';

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
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-7 w-64 max-w-full rounded bg-muted" />
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-xl border bg-card" />
        <div className="h-24 rounded-xl border bg-card" />
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

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 sm:block sm:py-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-foreground sm:mt-0.5 sm:text-left">{children}</dd>
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
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cn(
          'relative z-10 flex h-full w-full max-w-sm flex-col overflow-hidden border-l bg-card shadow-lg',
          'transition-transform duration-300 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p id={headingId} className="truncate text-sm font-semibold text-foreground">
              {attendee.users?.full_name ?? 'Bilinmeyen Kullanıcı'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {attendee.users?.email ?? '—'}
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={handleClose}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
            <p className="mb-4 text-sm font-semibold text-foreground">Rezervasyon geçmişi</p>

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

function queryEventDetail(eventId: string) {
  return Promise.all([
    supabase
      .from('events')
      .select(eventSelect)
      .eq('id', eventId)
      .single(),
    supabase
      .from('reservations')
      .select('id, created_at, tickets_requested, users(id, full_name, email)', { count: 'exact' })
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true }),
  ]);
}

export default function AdminEventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  // Total confirmed reservation rows server-side; the fetched list can be capped (PostgREST max rows).
  const [reservationCount, setReservationCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [closingComment, setClosingComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const closingId = useId();

  const applyDetail = useCallback(
    ([eventRes, attendeesRes]: Awaited<ReturnType<typeof queryEventDetail>>) => {
      if (eventRes.error) {
        toast.error('Etkinlik bulunamadı.');
        navigate('/admin/events', { replace: true });
        return;
      }
      setEvent(eventRes.data as unknown as EventDetail);
      setClosingComment(noteOf(eventRes.data as unknown as EventDetail) ?? '');
      setAttendees((attendeesRes.data ?? []) as unknown as Attendee[]);
      setReservationCount(attendeesRes.error ? null : attendeesRes.count);
      setLoading(false);
    },
    [toast, navigate],
  );

  // The route reuses this page when :id changes, so show the skeleton again for a new id
  // (adjusted during render; the effect below then loads that event).
  const [shownId, setShownId] = useState(id);
  if (id !== shownId) {
    setShownId(id);
    setLoading(true);
  }

  useEffect(() => {
    if (!id) return;
    let ignore = false; // a newer id (or unmount) wins over a slower earlier response
    queryEventDetail(id).then((result) => { if (!ignore) applyDetail(result); });
    return () => { ignore = true; };
  }, [id, applyDetail]);

  async function openEdit() {
    if (categories.length === 0) {
      const { data } = await supabase.from('event_categories').select('id, name, color_code').order('name');
      setCategories(data ?? []);
    }
    setEditing(true);
  }

  async function handleSaveClosingComment() {
    if (!event) return;
    setSavingComment(true);
    const trimmed = closingComment.trim() || null;
    const field = noteField(event);
    const { error } = await supabase
      .from('events')
      .update({ [field]: trimmed })
      .eq('id', event.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(field === 'cancellation_note' ? 'İptal açıklaması kaydedildi.' : 'Kapanış notu kaydedildi.');
      setEvent((prev) => (prev ? { ...prev, [field]: trimmed } : prev));
    }
    setSavingComment(false);
  }

  // Occupancy comes from events.booked_count — the ticket total the 0014/0015
  // trigger keeps in sync and book_event checks capacity against. The attendee
  // list below is a separate, possibly capped query and is never used as the total.
  const booked = event?.booked_count ?? 0;
  const available = event ? Math.max(event.capacity - booked, 0) : 0;
  const fillPct =
    event && event.capacity > 0
      ? Math.min(Math.round((booked / event.capacity) * 100), 100)
      : 0;
  const listedTickets = attendees.reduce((sum, a) => sum + a.tickets_requested, 0);
  const listIsPartial = reservationCount !== null && reservationCount > attendees.length;
  const listUnknown = reservationCount === null;
  const listDiffers = !listIsPartial && !listUnknown && listedTickets !== booked;
  const closingDirty = (closingComment.trim() || null) !== ((event && noteOf(event)) ?? null);

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:pt-6">
        <Link
          to="/admin/events"
          className="-ml-2 mb-4 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Etkinlikler
        </Link>

        {loading ? (
          <HeaderSkeleton />
        ) : event ? (
          <>
            {/* Event summary */}
            <section aria-labelledby="event-title" className="mb-8">
              {(event.status === 'cancelled' || event.is_archived) && (
                <p className={cn(
                  'mb-4 rounded-lg px-3 py-2 text-sm',
                  event.status === 'cancelled' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
                )}>
                  {event.status === 'cancelled'
                    ? 'Bu etkinlik iptal edildi. Kullanıcılar yeni rezervasyon yapamaz.'
                    : 'Bu etkinlik arşivde. Etkinlik listesinde Arşiv sekmesinde görünür.'}
                </p>
              )}

              <div className="flex flex-col gap-5 md:flex-row md:items-start">
                {/* Whole image at its own ratio (4:5 posters too) — capped height instead of a crop. */}
                {event.image_url && (
                  <div className="md:order-2 md:w-72 md:shrink-0">
                    <img
                      src={event.image_url}
                      alt=""
                      className="block h-auto w-full rounded-xl md:mx-auto md:max-h-96 md:w-auto md:max-w-full"
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <EventStateBadges status={event.status} published={event.is_published} archived={event.is_archived} />
                  <h1 id="event-title" className="mt-2 break-words text-pretty text-2xl font-semibold tracking-tight text-foreground">
                    {event.title}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <time dateTime={event.event_date}>
                      {formatEventDay(event.event_date)}, {formatEventTime(event.event_date)}
                    </time>
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openEdit}
                      className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 sm:h-10 sm:pointer-coarse:h-11 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      Etkinliği düzenle
                    </button>
                    {attendees.length > 0 && (
                      <button
                        type="button"
                        onClick={() => exportToCSV(attendees, event.title)}
                        className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 sm:h-10 sm:pointer-coarse:h-11 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        Katılımcıları indir (CSV)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <dl className="mt-6 grid divide-y rounded-xl border px-4 sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:py-4 lg:grid-cols-4">
                <MetaRow label="Konum">{event.location ?? '—'}</MetaRow>
                <MetaRow label="Kategori">
                  <CategoryLabel
                    name={event.event_categories?.name ?? event.category}
                    color={event.event_categories?.color_code}
                    className="text-sm text-foreground"
                  />
                </MetaRow>
                <MetaRow label="Fiyat">{formatPrice(event.price)}</MetaRow>
                <MetaRow label="Kişi başı bilet">{event.max_tickets_per_user}</MetaRow>
              </dl>
              {event.description && (
                <p className="mt-4 max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {event.description}
                </p>
              )}
            </section>

            {/* Occupancy */}
            <section aria-labelledby="occupancy-title" className="mb-8">
              <h2 id="occupancy-title" className="mb-3 text-base font-semibold text-foreground">Doluluk</h2>
              <div className="rounded-xl border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="tabular-nums text-foreground">
                    <span className="text-2xl font-semibold">{booked}</span>
                    <span className="text-muted-foreground"> / {event.capacity} bilet</span>
                  </p>
                  <p className={cn('text-sm tabular-nums', available === 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {available === 0 ? 'Kontenjan doldu' : `${available} boş yer, %${fillPct} dolu`}
                  </p>
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="meter"
                  aria-label="Doluluk"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fillPct}
                >
                  <div
                    className={cn('h-full rounded-full', fillPct >= 100 ? 'bg-destructive' : 'bg-foreground/70')}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Attendees */}
            <section aria-labelledby="attendees-title">
              <h2 id="attendees-title" className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                Katılımcılar
              </h2>
              {attendees.length > 0 && (
                <p className="-mt-1 mb-3 text-sm tabular-nums text-muted-foreground">
                  {listIsPartial
                    ? `${reservationCount} onaylı rezervasyonun ilk ${attendees.length} tanesi listeleniyor (${listedTickets} bilet). CSV de yalnızca listelenenleri içerir.`
                    : `${attendees.length} onaylı rezervasyon, toplam ${listedTickets} bilet`}
                </p>
              )}
              {(listDiffers || listUnknown) && (
                <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                  {listUnknown
                    ? 'Rezervasyon sayısı doğrulanamadı; liste eksik olabilir.'
                    : `Listelenen biletler (${listedTickets}) doluluk sayacıyla (${booked}) eşleşmiyor. Doluluk sayacı esas alınır; fark, rezervasyonsuz girilmiş örnek veriden kaynaklanabilir.`}
                </p>
              )}

              {attendees.length > 0 ? (
                <>
                  {/* Desktop table (md+) */}
                  <div className="hidden overflow-x-auto rounded-xl border md:block">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th scope="col" className="px-4 py-2.5 font-medium">Ad soyad</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">E-posta</th>
                          <th scope="col" className="px-4 py-2.5 text-right font-medium">Bilet</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">Rezervasyon</th>
                          <th scope="col" className="w-10 px-4 py-2.5"><span className="sr-only">Geçmiş</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendees.map((a) => (
                          <tr
                            key={a.id}
                            className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                            onClick={() => setSelectedAttendee(a)}
                          >
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedAttendee(a); }}
                                className="text-left text-sm font-medium text-foreground hover:underline"
                              >
                                {a.users?.full_name ?? '—'}
                              </button>
                            </td>
                            <td className="max-w-[16rem] truncate px-4 py-3 text-sm text-muted-foreground" title={a.users?.email}>
                              {a.users?.email ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{a.tickets_requested}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-muted-foreground">
                              {formatDateTime(a.created_at)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile list (< md) */}
                  <ul className="divide-y rounded-xl border md:hidden">
                    {attendees.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedAttendee(a)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-medium text-foreground">
                              {a.users?.full_name ?? '—'}
                            </span>
                            <span className="block break-all text-xs text-muted-foreground">{a.users?.email ?? '—'}</span>
                            <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                              {formatDateTime(a.created_at)}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-foreground">{a.tickets_requested} bilet</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">Henüz katılımcı yok</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Onaylanan rezervasyonlar burada görünecek.
                  </p>
                </div>
              )}
            </section>

            {/* Organiser note: closing note once completed, cancellation note while cancelled */}
            {(event.status === 'completed' || event.status === 'cancelled') && (
              <section className="mt-8 rounded-xl border p-4 sm:p-5">
                <label htmlFor={closingId} className="block text-base font-semibold text-foreground">
                  {event.status === 'cancelled' ? 'İptal açıklaması' : 'Kapanış notu'}
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.status === 'cancelled'
                    ? 'Rezervasyonu olan kullanıcılara etkinlik sayfasında gösterilir.'
                    : 'Etkinlik sayfasında katılımcılara gösterilir.'}
                </p>
                <textarea
                  id={closingId}
                  rows={4}
                  value={closingComment}
                  onChange={(e) => setClosingComment(e.target.value)}
                  placeholder={event.status === 'cancelled' ? 'İptalin nedenini kısaca yazın…' : 'Katılımcılara gösterilecek kapanış notunu yazın…'}
                  className={cn(adminInputClass, 'mt-3 resize-y')}
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveClosingComment}
                    disabled={savingComment || !closingDirty}
                    className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold sm:h-10 sm:pointer-coarse:h-11 text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingComment ? 'Kaydediliyor…' : 'Notu kaydet'}
                  </button>
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {closingDirty ? 'Kaydedilmemiş değişiklik var' : event.closing_comment ? 'Kaydedildi' : ''}
                  </span>
                </div>
              </section>
            )}
          </>
        ) : null}

        {/* Attendee list skeleton while loading */}
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

      {editing && event && (
        <EventFormModal
          editEvent={event}
          categories={categories}
          onClose={() => setEditing(false)}
          // Silent refresh (no skeleton) so the page — and the edit button focus returns to — stays mounted.
          onSaved={() => { queryEventDetail(event.id).then(applyDetail); }}
        />
      )}
    </>
  );
}
