import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Mail, Minus, Phone, Plus, PlusCircle, Tag, Ticket, Trash2, X } from 'lucide-react';
import { supabase, formatShortDate, formatDateTime, cn } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import AdminDialog from '@/components/admin/AdminDialog';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import SearchableCombo, { type ComboOption } from '@/components/admin/SearchableCombo';
import { ApprovalLabel, RoleLabel, type ApprovalStatus, type UserRecord } from '@/components/admin/userAccount';
import { displayName, getInitials } from '@/lib/userDisplay';

// A user's profile for admins: account actions (approve/reject, role), contact details,
// their reservations (edit tickets, cancel) and booking them into an event on their behalf.

interface BookingEvent {
  id: string;
  title: string;
  event_date: string;
  category: string | null;
  status: 'active' | 'completed' | 'cancelled';
  capacity: number;
  booked_count: number;
}

interface Booking {
  id: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  tickets_requested: number;
  events: BookingEvent | null;
}

interface AvailableEvent {
  id: string;
  title: string;
  event_date: string;
  max_tickets_per_user: number;
  capacity: number;
  booked_count: number;
}

async function queryUserBookings(userId: string) {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, status, created_at, tickets_requested, events(id, title, event_date, category, status, capacity, booked_count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { bookings: (data ?? []) as unknown as Booking[], error: error?.message ?? null };
}

/** Active events the user doesn't already hold a confirmed reservation for. */
async function queryAvailableEvents(userId: string) {
  const { data: reserved } = await supabase
    .from('reservations')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  const confirmedIds = (reserved ?? []).map((r: { event_id: string }) => r.event_id);

  let query = supabase
    .from('events')
    .select('id, title, event_date, max_tickets_per_user, capacity, booked_count')
    .eq('status', 'active')
    .order('event_date', { ascending: true });

  if (confirmedIds.length > 0) {
    query = query.not('id', 'in', `(${confirmedIds.join(',')})`);
  }

  const { data } = await query;
  return (data ?? []) as AvailableEvent[];
}

function isUpcomingConfirmed(booking: Booking): boolean {
  return (
    booking.status === 'confirmed' &&
    booking.events !== null &&
    new Date(booking.events.event_date) > new Date()
  );
}

function BookingItemSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-4 w-16 shrink-0 rounded-full bg-muted" />
      </div>
      <div className="mt-2 flex gap-3">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
    </div>
  );
}

// ── Contact rows ────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
  dimmed,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 break-all text-sm',
          dimmed ? 'italic text-muted-foreground/50' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── Ticket counter ────────────────────────────────────────────────────────────

function TicketCounter({
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  // Local string so the user can clear and retype freely; clamped on blur.
  // Re-synced during render when the value changes from outside (e.g. after a save).
  const [raw, setRaw] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setRaw(String(value));
  }

  function commit(str: string) {
    const n = parseInt(str, 10);
    if (isNaN(n) || n < min) { setRaw(String(min)); onChange(min); return; }
    if (n > max) { setRaw(String(max)); onChange(max); return; }
    setRaw(String(n));
    onChange(n);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { const next = Math.max(min, value - 1); setRaw(String(next)); onChange(next); }}
        disabled={disabled || value <= min}
        aria-label="Bileti azalt"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        type="number"
        value={raw}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        onBlur={(e) => commit(e.target.value)}
        aria-label="Bilet sayısı"
        className={cn(
          'h-9 w-12 rounded-lg border border-input bg-background text-center text-base font-semibold tabular-nums text-foreground sm:text-sm pointer-coarse:h-11',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-40',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { const next = Math.min(max, value + 1); setRaw(String(next)); onChange(next); }}
        disabled={disabled || value >= max}
        aria-label="Bileti artır"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

// ── Booking item (with admin controls for upcoming confirmed bookings) ─────────

function AdminBookingItem({
  booking,
  draft,
  onDraftChange,
  onCancel,
  onUpdateTickets,
  busy,
}: {
  booking: Booking;
  /** Unsaved ticket count (lives in the drawer so closing can warn about it). */
  draft: number | undefined;
  onDraftChange: (id: string, count: number) => void;
  onCancel: (booking: Booking) => void;
  onUpdateTickets: (id: string, count: number) => void;
  busy: boolean;
}) {
  const ev = booking.events;
  const upcoming = isUpcomingConfirmed(booking);
  const localTickets = draft ?? booking.tickets_requested;
  const isDirty = localTickets !== booking.tickets_requested;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3',
        upcoming && 'border-primary/20 bg-primary/5',
      )}
    >
      {/* Title + status badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-foreground">
          {ev?.title ?? 'Etkinlik bilgisi yok'}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
            booking.status === 'confirmed'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground line-through',
          )}
        >
          {booking.status === 'confirmed' ? 'Onaylandı' : 'İptal Edildi'}
        </span>
      </div>

      {/* Meta */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {ev?.event_date && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" />
            {formatDateTime(ev.event_date)}
          </span>
        )}
        {ev?.category && (
          <span className="flex items-center gap-1">
            <Tag className="h-3 w-3 shrink-0" />
            {ev.category}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Ticket className="h-3 w-3 shrink-0" />
          {booking.tickets_requested} kişi
        </span>
        {ev && (
          <span
            className={cn(
              'font-medium',
              ev.booked_count > ev.capacity
                ? 'text-destructive'
                : ev.booked_count === ev.capacity
                  ? 'text-amber-600 dark:text-amber-400'
                  : '',
            )}
          >
            {ev.booked_count}/{ev.capacity} kontenjan
            {ev.booked_count > ev.capacity && ' ⚠ aşırı rezervasyon'}
          </span>
        )}
        {ev?.status && (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5',
              ev.status === 'active'
                ? 'bg-primary/10 text-primary'
                : ev.status === 'completed'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-destructive/10 text-destructive',
            )}
          >
            {ev.status === 'active' ? 'Aktif' : ev.status === 'completed' ? 'Tamamlandı' : 'İptal Edildi'}
          </span>
        )}
      </div>

      {/* Admin controls — only for upcoming confirmed bookings */}
      {upcoming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Bilet:</span>
            <TicketCounter
              value={localTickets}
              min={1}
              max={9999}
              onChange={(n) => onDraftChange(booking.id, n)}
              disabled={busy}
            />
          </div>

          {isDirty && (
            <button
              type="button"
              onClick={() => onUpdateTickets(booking.id, localTickets)}
              disabled={busy}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11"
            >
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onCancel(booking)}
            disabled={busy}
            className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {busy ? 'İptal ediliyor…' : 'İptal Et'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────────


// Account actions: equal columns, text may wrap inside the button instead of pushing it to a new row.
const accountBtn =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1.5 text-center text-sm font-medium leading-tight transition-colors disabled:opacity-50 md:min-h-10 md:pointer-coarse:min-h-11';

const panelBtn =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50 pointer-coarse:h-11';

export default function UserProfileDialog({
  user,
  isSelf,
  updating,
  onStatusChange,
  onRoleChange,
  onClose,
}: {
  user: UserRecord;
  isSelf: boolean;
  updating: boolean;
  onStatusChange: (user: UserRecord, status: ApprovalStatus) => void;
  onRoleChange: (user: UserRecord, role: UserRecord['role']) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, number>>({});
  const [pendingCancel, setPendingCancel] = useState<Booking | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // New booking form state
  const [availableEvents, setAvailableEvents] = useState<AvailableEvent[]>([]);
  const [newEventId, setNewEventId] = useState('');
  const [newTickets, setNewTickets] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const applyLoaded = useCallback(
    ([b, events]: [Awaited<ReturnType<typeof queryUserBookings>>, AvailableEvent[]]) => {
      setBookingsError(b.error);
      setBookings(b.bookings);
      setAvailableEvents(events);
      setLoadingBookings(false);
    },
    [],
  );

  useEffect(() => {
    let ignore = false; // the dialog can close before the requests resolve
    Promise.all([queryUserBookings(user.id), queryAvailableEvents(user.id)]).then((r) => {
      if (!ignore) applyLoaded(r);
    });
    return () => { ignore = true; };
  }, [user.id, applyLoaded]);

  /** Re-read bookings + bookable events after a change (no skeleton, the list stays in place). */
  async function refreshData() {
    applyLoaded(await Promise.all([queryUserBookings(user.id), queryAvailableEvents(user.id)]));
  }

  function retryLoad() {
    setLoadingBookings(true);
    void refreshData();
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  function clearDraft(bookingId: string) {
    setTicketDrafts((d) => {
      const next = { ...d };
      delete next[bookingId];
      return next;
    });
  }

  async function handleUpdateTickets(bookingId: string, newCount: number) {
    setBusyId(bookingId);
    const booking = bookings.find((b) => b.id === bookingId);
    const { error } = await supabase
      .from('reservations')
      .update({ tickets_requested: newCount })
      .eq('id', bookingId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Bilet sayısı güncellendi.');
      clearDraft(bookingId);
      if (booking?.events?.title) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Rezervasyon Güncellendi',
          message: `Bir yönetici "${booking.events.title}" için rezervasyonunuzu ${newCount} kişilik olarak güncelledi.`,
          type: 'admin_broadcast',
        });
      }
      await refreshData();
    }
    setBusyId(null);
  }

  async function handleCancelBooking(booking: Booking) {
    setBusyId(booking.id);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', booking.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Rezervasyon iptal edildi.');
      clearDraft(booking.id);
      if (booking.events?.title) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Rezervasyon İptal Edildi',
          message: `"${booking.events.title}" için rezervasyonunuz bir yönetici tarafından iptal edildi.`,
          type: 'admin_broadcast',
        });
      }
      await refreshData();
    }
    setBusyId(null);
  }

  async function handleCreateBooking() {
    if (!newEventId) return;
    setCreating(true);
    const eventTitle = availableEvents.find((e) => e.id === newEventId)?.title ?? '';

    const { error } = await supabase.rpc('book_event', {
      p_user_uuid: user.id,
      p_event_uuid: newEventId,
      p_requested_seats: newTickets,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Rezervasyon başarıyla oluşturuldu.');
      if (eventTitle) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Rezervasyon Oluşturuldu',
          message: `Bir yönetici sizi "${eventTitle}" etkinliğine ${newTickets} kişilik olarak kaydetti.`,
          type: 'admin_broadcast',
        });
      }
      setNewEventId('');
      setNewTickets(1);
      setShowNewForm(false);
      await refreshData();
    }
    setCreating(false);
  }

  // ── Close ──────────────────────────────────────────────────────────────────

  const dirty =
    (showNewForm && newEventId !== '') ||
    bookings.some((b) => ticketDrafts[b.id] !== undefined && ticketDrafts[b.id] !== b.tickets_requested);
  const busy = busyId !== null || creating;

  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const initials = getInitials(user.full_name, user.email);
  const selectedEvent = availableEvents.find((e) => e.id === newEventId);
  const eventOptions: ComboOption[] = availableEvents.map((e) => {
    const spotsLeft = e.capacity - e.booked_count;
    return {
      id: e.id,
      label: e.title,
      sublabel: `${formatDateTime(e.event_date)} · ${
        spotsLeft < 0 ? `${Math.abs(spotsLeft)} kontenjan aşıldı ⚠` : spotsLeft === 0 ? 'Kontenjan doldu' : `${spotsLeft} kontenjan kaldı`
      }`,
      sublabelTone: spotsLeft < 0 ? 'danger' : spotsLeft === 0 ? 'warning' : undefined,
    };
  });
  // Admins bypass per-user limits; 9999 is the effective no-limit sentinel
  const maxNewTickets = 9999;
  const otherStatuses = (['approved', 'rejected', 'pending'] as const).filter((s) => s !== user.approval_status);

  return (
    <>
      <AdminDialog
        labelledBy={titleId}
        initialFocus={headingRef}
        onRequestClose={requestClose}
        onForcedClose={onClose}
        className="fixed inset-0 h-full w-full justify-end open:flex"
      >
        <div className="flex h-full w-full flex-col bg-card sm:max-w-md sm:border-l sm:shadow-lg">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground" aria-hidden>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} ref={headingRef} tabIndex={-1} className="break-words text-base font-semibold text-foreground focus:outline-none">
                {displayName(user)}
              </h2>
              {user.full_name?.trim() && <p className="break-all text-xs text-muted-foreground">{user.email}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              aria-label="Kullanıcı panelini kapat"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {/* ── Account ───────────────────────────────────────────────── */}
            <section aria-labelledby={`${titleId}-account`}>
              {/* Status and role read as one line; the three actions share one row and only wrap
                  (to two columns) when the screen is very narrow or text is enlarged. */}
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 id={`${titleId}-account`} className="text-sm font-semibold text-foreground">Hesap</h3>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ApprovalLabel status={user.approval_status} />
                  <RoleLabel role={user.role} />
                </span>
              </div>
              {isSelf ? (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Kendi hesabınızın durumunu ve rolünü değiştiremezsiniz.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
                  {otherStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={updating}
                      onClick={() => onStatusChange(user, s)}
                      className={cn(
                        accountBtn,
                        s === 'approved' && 'bg-primary text-primary-foreground hover:opacity-90',
                        s === 'rejected' && 'border border-destructive/40 text-destructive hover:bg-destructive/10',
                        s === 'pending' && 'border text-foreground hover:bg-muted',
                      )}
                    >
                      {s === 'approved' ? 'Onayla' : s === 'rejected' ? 'Reddet' : 'Beklemeye al'}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => onRoleChange(user, user.role === 'admin' ? 'user' : 'admin')}
                    className={cn(accountBtn, 'border text-foreground hover:bg-muted')}
                  >
                    {user.role === 'admin' ? 'Yetkiyi kaldır' : 'Yönetici yap'}
                  </button>
                </div>
              )}
            </section>

            {/* ── Contact ───────────────────────────────────────────────── */}
            <section aria-labelledby={`${titleId}-contact`}>
              <h3 id={`${titleId}-contact`} className="mb-2 text-sm font-semibold text-foreground">İletişim</h3>
              <div className="divide-y rounded-xl border">
                <MetaRow icon={<Mail className="h-4 w-4" />} label="E-posta" value={user.email} />
                <MetaRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Telefon"
                  value={user.phone_number ?? 'Telefon girilmemiş'}
                  dimmed={!user.phone_number}
                />
                <MetaRow
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Katıldı"
                  value={formatShortDate(user.created_at)}
                />
              </div>
            </section>

            {/* ── Booking history ───────────────────────────────────────── */}
            <section aria-labelledby={`${titleId}-bookings`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 id={`${titleId}-bookings`} className="text-sm font-semibold text-foreground">Rezervasyonlar</h3>
                {!loadingBookings && !bookingsError && (
                  <span className="text-xs tabular-nums text-muted-foreground">{bookings.length} rezervasyon</span>
                )}
              </div>

              {loadingBookings ? (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2].map((i) => <BookingItemSkeleton key={i} />)}
                </div>
              ) : bookingsError ? (
                <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5 text-center">
                  <p className="text-sm text-foreground">Rezervasyonlar yüklenemedi.</p>
                  <button type="button" onClick={retryLoad} className={cn(panelBtn, 'mt-2 border bg-background text-foreground hover:bg-muted')}>
                    Tekrar dene
                  </button>
                </div>
              ) : bookings.length === 0 ? (
                <div className="rounded-xl border border-dashed py-8 text-center">
                  <p className="text-sm text-muted-foreground">Henüz rezervasyon yok.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b) => (
                    <AdminBookingItem
                      key={b.id}
                      booking={b}
                      draft={ticketDrafts[b.id]}
                      onDraftChange={(id, n) => setTicketDrafts((d) => ({ ...d, [id]: n }))}
                      onUpdateTickets={handleUpdateTickets}
                      onCancel={setPendingCancel}
                      busy={busyId === b.id}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── New reservation ───────────────────────────────────────── */}
            <section aria-labelledby={`${titleId}-new`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 id={`${titleId}-new`} className="text-sm font-semibold text-foreground">Yeni rezervasyon</h3>
                {!showNewForm && availableEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNewForm(true)}
                    className={cn(panelBtn, 'border text-foreground hover:bg-muted')}
                  >
                    <PlusCircle className="h-4 w-4" aria-hidden />
                    Ekle
                  </button>
                )}
              </div>

              {showNewForm && (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-3 sm:p-4">
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Etkinlik seçin</p>
                    <SearchableCombo
                      ariaLabel="Etkinlik ara"
                      placeholder="Aktif etkinlik ara…"
                      emptyMessage="Uygun etkinlik yok"
                      options={eventOptions}
                      value={newEventId}
                      onSelect={setNewEventId}
                      onClear={() => { setNewEventId(''); setNewTickets(1); }}
                      disabled={creating}
                    />
                  </div>

                  {newEventId && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Bilet
                        {selectedEvent && (
                          <span className="block text-muted-foreground/70">
                            Kullanıcı limiti {selectedEvent.max_tickets_per_user}; yönetici olarak aşabilirsiniz.
                          </span>
                        )}
                      </p>
                      <TicketCounter value={newTickets} min={1} max={maxNewTickets} onChange={setNewTickets} disabled={creating} />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCreateBooking}
                      disabled={!newEventId || creating}
                      className={cn(panelBtn, 'flex-1 bg-primary font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed')}
                    >
                      <Ticket className="h-4 w-4" aria-hidden />
                      {creating ? 'Rezerve ediliyor…' : 'Etkinliğe kaydet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewForm(false); setNewEventId(''); setNewTickets(1); }}
                      disabled={creating}
                      className={cn(panelBtn, 'border text-foreground hover:bg-muted')}
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}

              {!showNewForm && availableEvents.length === 0 && !loadingBookings && (
                <p className="text-xs text-muted-foreground">Bu kullanıcı tüm aktif etkinliklere zaten kayıtlı.</p>
              )}
            </section>
          </div>
        </div>
      </AdminDialog>

      {pendingCancel && (
        <ConfirmDialog
          title="Rezervasyon iptal edilsin mi?"
          confirmLabel="Rezervasyonu iptal et"
          onConfirm={() => { const b = pendingCancel; setPendingCancel(null); void handleCancelBooking(b); }}
          onCancel={() => setPendingCancel(null)}
        >
          <p>
            <span className="font-medium text-foreground">{pendingCancel.events?.title ?? 'Bu etkinlik'}</span> için
            rezervasyon iptal edilecek ve kullanıcıya bildirim gönderilecek.
          </p>
        </ConfirmDialog>
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title="Kaydedilmemiş değişiklikler var"
          confirmLabel="Değişiklikleri at"
          cancelLabel="Panele dön"
          onConfirm={() => { setConfirmDiscard(false); onClose(); }}
          onCancel={() => setConfirmDiscard(false)}
        >
          <p>Bilet değişiklikleri veya yeni rezervasyon seçimi kaydedilmedi. Paneli kapatırsanız kaybolacak.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

