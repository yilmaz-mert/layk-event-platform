import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Mail,
  Minus,
  Phone,
  Plus,
  PlusCircle,
  Search,
  ShieldCheck,
  Tag,
  Ticket,
  Trash2,
  User as UserIcon,
  X,
  XCircle,
} from 'lucide-react';
import { supabase, formatShortDate, formatDateTime } from '@layk/core';
import { useAuth } from '@layk/core';
import { useToast } from '@/components/Toast';
import { cn } from '@layk/core';

// ── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type SortCol = 'name' | 'status' | 'date';
type SortDir = 'asc' | 'desc';

interface UserRecord {
  id: string;
  full_name: string | null;
  email: string;
  phone_number: string | null;
  role: 'admin' | 'user';
  approval_status: ApprovalStatus;
  created_at: string;
}

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

// pending floats to the top on first load
const STATUS_ORDER: Record<ApprovalStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function isUpcomingConfirmed(booking: Booking): boolean {
  return (
    booking.status === 'confirmed' &&
    booking.events !== null &&
    new Date(booking.events.event_date) > new Date()
  );
}

// ── Skeleton loaders ─────────────────────────────────────────────────────────

function TableSkeletonRow() {
  return (
    <tr className="animate-pulse border-b">
      <td className="p-4">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-1 h-3 w-44 rounded bg-muted" />
      </td>
      <td className="p-4"><div className="h-7 w-24 rounded-lg bg-muted" /></td>
      <td className="p-4"><div className="h-7 w-28 rounded-lg bg-muted" /></td>
      <td className="p-4"><div className="h-4 w-24 rounded bg-muted" /></td>
    </tr>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border bg-card p-4">
      <div className="flex justify-between gap-2">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-44 rounded bg-muted" />
        </div>
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
      <div className="flex gap-2">
        <div className="h-7 w-24 rounded-lg bg-muted" />
        <div className="h-7 w-28 rounded-lg bg-muted" />
      </div>
      <div className="h-3 w-28 rounded bg-muted" />
    </div>
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

// ── Status / role badges ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApprovalStatus }) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Onaylandı
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        <XCircle className="h-3 w-3" />
        Reddedildi
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
      <Clock className="h-3 w-3" />
      Beklemede
    </span>
  );
}

function RoleBadge({ role }: { role: UserRecord['role'] }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
      <ShieldCheck className="h-3 w-3" />
      Yönetici
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <UserIcon className="h-3 w-3" />
      Kullanıcı
    </span>
  );
}

// ── Inline select controls ───────────────────────────────────────────────────

const selectClass =
  'rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition';

function ApprovalSelect({
  value,
  disabled,
  onChange,
}: {
  value: ApprovalStatus;
  disabled: boolean;
  onChange: (v: ApprovalStatus) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ApprovalStatus)}
      className={selectClass}
    >
      <option value="pending">Beklemede</option>
      <option value="approved">Onaylandı</option>
      <option value="rejected">Reddedildi</option>
    </select>
  );
}

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: 'admin' | 'user';
  disabled: boolean;
  onChange: (v: 'admin' | 'user') => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as 'admin' | 'user')}
      className={selectClass}
    >
      <option value="user">Kullanıcı</option>
      <option value="admin">Yönetici</option>
    </select>
  );
}

// ── Sortable column header ────────────────────────────────────────────────────

function SortableHeader({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="cursor-pointer select-none p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          sortDir === 'asc'
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ── Profile drawer sub-components ────────────────────────────────────────────

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
          'min-w-0 truncate text-sm',
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
  // Local string so the user can clear and retype freely; clamped on blur
  const [raw, setRaw] = useState(String(value));

  useEffect(() => { setRaw(String(value)); }, [value]);

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
        className="flex h-6 w-6 items-center justify-center rounded border border-input bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-3 w-3" />
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
        className={cn(
          'w-10 rounded border border-input bg-background text-center text-sm font-semibold tabular-nums text-foreground',
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
        className="flex h-6 w-6 items-center justify-center rounded border border-input bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Booking item (with admin controls for upcoming confirmed bookings) ─────────

function AdminBookingItem({
  booking,
  onCancel,
  onUpdateTickets,
  busy,
}: {
  booking: Booking;
  onCancel: (id: string) => void;
  onUpdateTickets: (id: string, count: number) => void;
  busy: boolean;
}) {
  const ev = booking.events;
  const upcoming = isUpcomingConfirmed(booking);

  const [localTickets, setLocalTickets] = useState(booking.tickets_requested);

  // Sync local state after a successful save (parent refreshes bookings)
  useEffect(() => {
    setLocalTickets(booking.tickets_requested);
  }, [booking.tickets_requested]);

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
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {ev?.title ?? '—'}
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
              onChange={setLocalTickets}
              disabled={busy}
            />
          </div>

          {isDirty && (
            <button
              type="button"
              onClick={() => onUpdateTickets(booking.id, localTickets)}
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onCancel(booking.id)}
            disabled={busy}
            className="ml-auto flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {busy ? 'İptal ediliyor…' : 'İptal Et'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Mini searchable event combo (used in drawer new-booking form) ─────────────

interface EventComboOption {
  id: string;
  title: string;
  event_date: string;
  max_tickets_per_user: number;
  capacity: number;
  booked_count: number;
}

function EventCombo({
  options,
  value,
  onSelect,
  onClear,
  disabled,
}: {
  options: EventComboOption[];
  value: string;
  onSelect: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selected = options.find((o) => o.id === value);

  const filtered = query.trim()
    ? options.filter((o) => o.title.toLowerCase().includes(query.toLowerCase()))
    : options;

  if (selected) {
    const spotsLeft = selected.capacity - selected.booked_count;
    const overbooked = spotsLeft < 0;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{selected.title}</p>
          <p
            className={cn(
              'text-xs',
              overbooked
                ? 'font-medium text-destructive'
                : spotsLeft === 0
                  ? 'font-medium text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
            )}
          >
            {formatDateTime(selected.event_date)}
            {overbooked
              ? ` · ${Math.abs(spotsLeft)} kontenjan aşıldı ⚠`
              : spotsLeft === 0
                ? ' · Kontenjan doldu'
                : ` · ${spotsLeft} kontenjan kaldı`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label="Seçimi temizle"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2',
          open && 'ring-2 ring-ring',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Aktif etkinlik ara…"
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-input bg-background shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {query.trim() ? `"${query}" için sonuç yok` : 'Uygun etkinlik yok'}
            </p>
          ) : (
            filtered.map((o) => {
              const spotsLeft = o.capacity - o.booked_count;
              const overbooked = spotsLeft < 0;
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSelect(o.id); setOpen(false); setQuery(''); }}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-muted"
                >
                  <span className="text-sm font-medium text-foreground">{o.title}</span>
                  <span
                    className={cn(
                      'text-xs',
                      overbooked
                        ? 'font-medium text-destructive'
                        : spotsLeft === 0
                          ? 'font-medium text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground',
                    )}
                  >
                    {formatDateTime(o.event_date)}
                    {overbooked
                      ? ` · ${Math.abs(spotsLeft)} kontenjan aşıldı ⚠`
                      : spotsLeft === 0
                        ? ' · Kontenjan doldu'
                        : ` · ${spotsLeft} kontenjan kaldı`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile drawer ────────────────────────────────────────────────────────────

function UserProfileDrawer({
  user,
  onClose,
}: {
  user: UserRecord;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [visible, setVisible] = useState(false);

  // Admin action busy states
  const [busyId, setBusyId] = useState<string | null>(null);

  // New booking form state
  const [availableEvents, setAvailableEvents] = useState<AvailableEvent[]>([]);
  const [newEventId, setNewEventId] = useState('');
  const [newTickets, setNewTickets] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // Stable ref so the Escape handler always calls the latest onClose
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Tracks the slide-out delay so it can be cancelled on unmount
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger slide-in after mount
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

  // Lock background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true);
    const { data } = await supabase
      .from('reservations')
      .select('id, status, created_at, tickets_requested, events(id, title, event_date, category, status, capacity, booked_count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setBookings((data ?? []) as unknown as Booking[]);
    setLoadingBookings(false);
  }, [user.id]);

  const fetchAvailableEvents = useCallback(async () => {
    // Active events the user hasn't already confirmed
    const { data: reserved } = await supabase
      .from('reservations')
      .select('event_id')
      .eq('user_id', user.id)
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
    setAvailableEvents((data ?? []) as AvailableEvent[]);
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchBookings(), fetchAvailableEvents()]).then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [fetchBookings, fetchAvailableEvents]);

  // ── Admin actions ──────────────────────────────────────────────────────────

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
      if (booking?.events?.title) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Rezervasyon Güncellendi',
          message: `Bir yönetici "${booking.events.title}" için rezervasyonunuzu ${newCount} kişilik olarak güncelledi.`,
          type: 'admin_broadcast',
        });
      }
      await Promise.all([fetchBookings(), fetchAvailableEvents()]);
    }
    setBusyId(null);
  }

  async function handleCancelBooking(bookingId: string) {
    setBusyId(bookingId);
    const booking = bookings.find((b) => b.id === bookingId);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Rezervasyon iptal edildi.');
      if (booking?.events?.title) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Rezervasyon İptal Edildi',
          message: `"${booking.events.title}" için rezervasyonunuz bir yönetici tarafından iptal edildi.`,
          type: 'admin_broadcast',
        });
      }
      await Promise.all([fetchBookings(), fetchAvailableEvents()]);
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
      await Promise.all([fetchBookings(), fetchAvailableEvents()]);
    }
    setCreating(false);
  }

  // ── Close helpers ──────────────────────────────────────────────────────────

  // Escape key closes drawer
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

  function handleClose() {
    setVisible(false);
    timeoutRef.current = setTimeout(() => onCloseRef.current(), 300);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const initials = getInitials(user.full_name, user.email);
  const selectedEvent = availableEvents.find((e) => e.id === newEventId);
  // Admins bypass per-user limits; 9999 is the effective no-limit sentinel
  const maxNewTickets = 9999;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'relative z-10 flex h-full w-full max-w-md flex-col border-l bg-card shadow-2xl',
          'transition-transform duration-300 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.full_name ?? user.email}
            </p>
            {user.full_name && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            aria-label="Profil panelini kapat"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">

          {/* ── Profile metadata ───────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Profil Bilgileri
            </h3>
            <div className="divide-y rounded-xl border bg-muted/30">
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
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Rol</span>
                <RoleBadge role={user.role} />
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Durum</span>
                <StatusBadge status={user.approval_status} />
              </div>
            </div>
          </section>

          {/* ── Booking history ────────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rezervasyon Geçmişi
              </h3>
              {!loadingBookings && (
                <span className="text-xs text-muted-foreground">
                  {bookings.length} rezervasyon
                </span>
              )}
            </div>

            {loadingBookings ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <BookingItemSkeleton key={i} />)}
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground">Henüz rezervasyon yok.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <AdminBookingItem
                    key={b.id}
                    booking={b}
                    onUpdateTickets={handleUpdateTickets}
                    onCancel={handleCancelBooking}
                    busy={busyId === b.id}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── New reservation ────────────────────────────────────────────── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Yeni Rezervasyon
              </h3>
              {!showNewForm && (
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Ekle
                </button>
              )}
            </div>

            {showNewForm && (
              <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                {/* Event selector */}
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">Etkinlik seçin</p>
                  <EventCombo
                    options={availableEvents}
                    value={newEventId}
                    onSelect={setNewEventId}
                    onClear={() => { setNewEventId(''); setNewTickets(1); }}
                    disabled={creating}
                  />
                </div>

                {/* Ticket count */}
                {newEventId && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Bilet
                      {selectedEvent && (
                        <span className="ml-1 text-muted-foreground/50">
                          (kullanıcı limiti: {selectedEvent.max_tickets_per_user}, yönetici geçersiz kılması aktif)
                        </span>
                      )}
                    </p>
                    <TicketCounter
                      value={newTickets}
                      min={1}
                      max={maxNewTickets}
                      onChange={setNewTickets}
                      disabled={creating}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCreateBooking}
                    disabled={!newEventId || creating}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Ticket className="h-4 w-4" />
                    {creating ? 'Rezerve ediliyor…' : 'Etkinliğe Kaydet'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewForm(false);
                      setNewEventId('');
                      setNewTickets(1);
                    }}
                    disabled={creating}
                    className="rounded-lg border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}

            {!showNewForm && availableEvents.length === 0 && !loadingBookings && (
              <p className="text-xs text-muted-foreground">
                Bu kullanıcı tüm aktif etkinliklere zaten kayıtlı.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Desktop table row ────────────────────────────────────────────────────────

function UserTableRow({
  user,
  isSelf,
  updating,
  onStatusChange,
  onRoleChange,
  onView,
}: {
  user: UserRecord;
  isSelf: boolean;
  updating: boolean;
  onStatusChange: (userId: string, status: ApprovalStatus) => void;
  onRoleChange: (userId: string, role: 'admin' | 'user') => void;
  onView: (user: UserRecord) => void;
}) {
  return (
    <tr
      className={cn(
        'cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40',
        isSelf && 'bg-primary/5',
      )}
      onClick={() => onView(user)}
    >
      {/* Name + email + phone */}
      <td className="p-4">
        <p className="text-sm font-medium text-foreground">
          {user.full_name ?? <span className="italic text-muted-foreground/50">Ad girilmemiş</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
        <p className={cn(
          'mt-0.5 text-xs',
          user.phone_number ? 'text-muted-foreground' : 'italic text-muted-foreground/40',
        )}>
          {user.phone_number ?? 'Telefon girilmemiş'}
        </p>
      </td>

      {/* Role select */}
      <td className="p-4" onClick={(e) => e.stopPropagation()}>
        <RoleSelect
          value={user.role}
          disabled={isSelf || updating}
          onChange={(v) => onRoleChange(user.id, v)}
        />
      </td>

      {/* Status select */}
      <td className="p-4" onClick={(e) => e.stopPropagation()}>
        <ApprovalSelect
          value={user.approval_status}
          disabled={isSelf || updating}
          onChange={(v) => onStatusChange(user.id, v)}
        />
      </td>

      {/* Joined date */}
      <td className="p-4">
        <span className="text-xs text-muted-foreground">{formatShortDate(user.created_at)}</span>
        {isSelf && (
          <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
            Siz
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function UserCard({
  user,
  isSelf,
  updating,
  onStatusChange,
  onRoleChange,
  onView,
}: {
  user: UserRecord;
  isSelf: boolean;
  updating: boolean;
  onStatusChange: (userId: string, status: ApprovalStatus) => void;
  onRoleChange: (userId: string, role: 'admin' | 'user') => void;
  onView: (user: UserRecord) => void;
}) {
  return (
    <div className={cn('space-y-3 rounded-xl border bg-card p-4', isSelf && 'border-primary/30 bg-primary/5')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {user.full_name ?? '—'}
            </p>
            {isSelf && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                Siz
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className={cn(
            'truncate text-xs',
            user.phone_number ? 'text-muted-foreground' : 'italic text-muted-foreground/40',
          )}>
            {user.phone_number ?? 'Telefon girilmemiş'}
          </p>
        </div>
        <StatusBadge status={user.approval_status} />
      </div>

      <div className="flex items-center gap-2">
        <RoleBadge role={user.role} />
      </div>

      {/* Inline controls */}
      <div className="flex flex-wrap items-center gap-2">
        <RoleSelect
          value={user.role}
          disabled={isSelf || updating}
          onChange={(v) => onRoleChange(user.id, v)}
        />
        <ApprovalSelect
          value={user.approval_status}
          disabled={isSelf || updating}
          onChange={(v) => onStatusChange(user.id, v)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground/70">
          Katıldı: {formatShortDate(user.created_at)}
        </p>
        <button
          onClick={() => onView(user)}
          className="rounded-lg border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          Profili Görüntüle →
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Search + sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Profile drawer
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, phone_number, role, approval_status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setUsers(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleStatusChange(userId: string, newStatus: ApprovalStatus) {
    setUpdatingId(userId);
    const { error } = await supabase
      .from('users')
      .update({ approval_status: newStatus })
      .eq('id', userId);

    if (error) {
      toast.error(error.message);
    } else {
      const label = newStatus === 'approved' ? 'Onaylandı' : newStatus === 'rejected' ? 'Reddedildi' : 'Beklemede olarak ayarlandı';
      toast.success(`Durum: ${label}.`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, approval_status: newStatus } : u)),
      );
    }
    setUpdatingId(null);
  }

  async function handleRoleChange(userId: string, newRole: 'admin' | 'user') {
    setUpdatingId(userId);
    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Rol ${newRole === 'admin' ? 'Yönetici' : 'Kullanıcı'} olarak ayarlandı.`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
    }
    setUpdatingId(null);
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const pendingCount = users.filter((u) => u.approval_status === 'pending').length;
  const searchLower = searchQuery.toLowerCase().trim();

  const displayedUsers = [...users]
    .filter((u) =>
      !searchLower ||
      (u.full_name?.toLowerCase().includes(searchLower) ?? false) ||
      u.email.toLowerCase().includes(searchLower),
    )
    .sort((a, b) => {
      const cmp =
        sortCol === 'name'
          ? (a.full_name ?? a.email).toLowerCase().localeCompare((b.full_name ?? b.email).toLowerCase())
          : sortCol === 'status'
            ? STATUS_ORDER[a.approval_status] - STATUS_ORDER[b.approval_status]
            : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">Kullanıcı Yönetimi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-block h-4 w-32 animate-pulse rounded bg-muted" />
            ) : (
              <>
                {searchQuery
                  ? `${displayedUsers.length} / ${users.length} üye`
                  : `${users.length} üye kayıtlı`}
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                    {pendingCount} beklemede
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ad veya e-postaya göre ara…"
            className={
              'w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm ' +
              'text-foreground placeholder:text-muted-foreground focus:outline-none ' +
              'focus:ring-2 focus:ring-ring focus:ring-offset-1 transition'
            }
          />
        </div>

        {/* ── Desktop table (md+) ───────────────────────────────────────────── */}
        <div className="hidden overflow-x-auto rounded-xl border md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-muted/40">
                <SortableHeader label="Ad Soyad" col="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rol</th>
                <SortableHeader label="Durum" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Katıldı" col="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map((i) => <TableSkeletonRow key={i} />)
                : displayedUsers.map((user) => (
                    <UserTableRow
                      key={user.id}
                      user={user}
                      isSelf={user.id === profile?.id}
                      updating={updatingId === user.id}
                      onStatusChange={handleStatusChange}
                      onRoleChange={handleRoleChange}
                      onView={(u) => setSelectedUserId(u.id)}
                    />
                  ))}
            </tbody>
          </table>

          {!loading && displayedUsers.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {searchQuery ? `"${searchQuery}" ile eşleşen kullanıcı yok.` : 'Kullanıcı bulunamadı.'}
            </p>
          )}
        </div>

        {/* ── Mobile card list (< md) ───────────────────────────────────────── */}
        <div className="space-y-3 md:hidden">
          {loading
            ? [0, 1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)
            : displayedUsers.length === 0
              ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {searchQuery ? `"${searchQuery}" ile eşleşen kullanıcı yok.` : 'Kullanıcı bulunamadı.'}
                </p>
              )
              : displayedUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    isSelf={user.id === profile?.id}
                    updating={updatingId === user.id}
                    onStatusChange={handleStatusChange}
                    onRoleChange={handleRoleChange}
                    onView={(u) => setSelectedUserId(u.id)}
                  />
                ))}
        </div>
      </main>

      {/* Profile drawer — rendered outside <main> to cover the full viewport */}
      {selectedUser && (
        <UserProfileDrawer
          user={selectedUser}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  );
}
