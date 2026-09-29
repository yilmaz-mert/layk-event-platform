import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
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
  X,
  XCircle,
} from 'lucide-react';
import { supabase, formatShortDate, formatDateTime } from '@layk/core';
import { useAuth } from '@layk/core';
import { useToast } from '@/components/Toast';
import { cn } from '@layk/core';
import AdminDialog from '@/components/admin/AdminDialog';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import FilterTabs from '@/components/admin/FilterTabs';

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

// ── Inline select controls ───────────────────────────────────────────────────

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground pointer-coarse:h-11 ' +
  'focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition';

function ApprovalSelect({
  value,
  disabled,
  onChange,
  label,
}: {
  value: ApprovalStatus;
  disabled: boolean;
  onChange: (v: ApprovalStatus) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
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
  label,
}: {
  value: 'admin' | 'user';
  disabled: boolean;
  onChange: (v: 'admin' | 'user') => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
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
  className,
}: {
  label: string;
  col: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  className?: string;
}) {
  const active = sortCol === col;
  return (
    <th
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground', className)}
    >
      <button type="button" onClick={() => onSort(col)} className="-mx-1 flex items-center gap-1 rounded px-1 uppercase tracking-wider transition hover:text-foreground">
        {label}
        {active ? (
          sortDir === 'asc'
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
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
          aria-label="Etkinlik seçimini temizle"
          className="-my-1 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <X className="h-4 w-4" aria-hidden />
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
          onKeyDown={(e) => {
            // Escape closes the list first; only a second Escape reaches the dialog.
            if (e.key === 'Escape' && open) { e.stopPropagation(); e.preventDefault(); setOpen(false); setQuery(''); }
          }}
          aria-label="Etkinlik ara"
          aria-expanded={open}
          placeholder="Aktif etkinlik ara…"
          disabled={disabled}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed sm:text-sm pointer-coarse:min-h-11"
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
                  className="flex min-h-11 w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-muted"
                >
                  <span className="break-words text-sm font-medium text-foreground">{o.title}</span>
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

// ── Account state labels ─────────────────────────────────────────────────────

const approvalLabels: Record<ApprovalStatus, string> = {
  pending: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

const approvalTone: Record<ApprovalStatus, string> = {
  pending: 'text-warning',
  approved: 'text-success',
  rejected: 'text-destructive',
};

function ApprovalLabel({ status }: { status: ApprovalStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', approvalTone[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {approvalLabels[status]}
    </span>
  );
}

function RoleLabel({ role }: { role: UserRecord['role'] }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      Yönetici
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Kullanıcı</span>
  );
}

function SelfBadge() {
  return <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Siz</span>;
}

const displayName = (u: UserRecord) => u.full_name?.trim() || u.email;

// ── Profile dialog ───────────────────────────────────────────────────────────

// Account actions: equal columns, text may wrap inside the button instead of pushing it to a new row.
const accountBtn =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1.5 text-center text-sm font-medium leading-tight transition-colors disabled:opacity-50 md:min-h-10 md:pointer-coarse:min-h-11';

const panelBtn =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50 pointer-coarse:h-11';

function UserProfileDialog({
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

  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true);
    const { data, error } = await supabase
      .from('reservations')
      .select('id, status, created_at, tickets_requested, events(id, title, event_date, category, status, capacity, booked_count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setBookingsError(error ? error.message : null);
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
    fetchBookings();
    fetchAvailableEvents();
  }, [fetchBookings, fetchAvailableEvents]);

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
      await Promise.all([fetchBookings(), fetchAvailableEvents()]);
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
                  <button type="button" onClick={fetchBookings} className={cn(panelBtn, 'mt-2 border bg-background text-foreground hover:bg-muted')}>
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
                    <EventCombo
                      options={availableEvents}
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
  onStatusChange: (user: UserRecord, status: ApprovalStatus) => void;
  onRoleChange: (user: UserRecord, role: 'admin' | 'user') => void;
  onView: (user: UserRecord) => void;
}) {
  return (
    <tr
      className={cn(
        'cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40',
        isSelf && 'bg-muted/30',
      )}
      onClick={() => onView(user)}
    >
      {/* Name + email + phone */}
      <td className="max-w-0 p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView(user); }}
            className="min-w-0 truncate text-left text-sm font-medium text-foreground hover:underline"
            title={displayName(user)}
          >
            {user.full_name?.trim() || <span className="italic text-muted-foreground">Ad girilmemiş</span>}
          </button>
          {isSelf && <SelfBadge />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={user.email}>{user.email}</p>
        <p className={cn('mt-0.5 truncate text-xs', user.phone_number ? 'text-muted-foreground' : 'italic text-muted-foreground/60')}>
          {user.phone_number ?? 'Telefon girilmemiş'}
        </p>
      </td>

      {/* Role select */}
      <td className="w-40 p-4" onClick={(e) => e.stopPropagation()}>
        <RoleSelect
          value={user.role}
          disabled={isSelf || updating}
          onChange={(v) => onRoleChange(user, v)}
          label={`Rol: ${displayName(user)}`}
        />
      </td>

      {/* Status select */}
      <td className="w-44 p-4" onClick={(e) => e.stopPropagation()}>
        <ApprovalSelect
          value={user.approval_status}
          disabled={isSelf || updating}
          onChange={(v) => onStatusChange(user, v)}
          label={`Onay durumu: ${displayName(user)}`}
        />
      </td>

      {/* Joined date */}
      <td className="w-32 whitespace-nowrap p-4 text-xs tabular-nums text-muted-foreground">
        {formatShortDate(user.created_at)}
      </td>
    </tr>
  );
}

// ── Phone / tablet row ───────────────────────────────────────────────────────
// Whole row opens the profile; only pending users get inline approve/reject.

function UserListItem({
  user,
  isSelf,
  updating,
  onStatusChange,
  onView,
}: {
  user: UserRecord;
  isSelf: boolean;
  updating: boolean;
  onStatusChange: (user: UserRecord, status: ApprovalStatus) => void;
  onView: (user: UserRecord) => void;
}) {
  const name = displayName(user);
  const showDecision = user.approval_status === 'pending' && !isSelf;
  return (
    <li className={cn('rounded-xl border bg-card', showDecision && 'border-warning/40')}>
      <button
        type="button"
        onClick={() => onView(user)}
        className={cn('flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/40', showDecision ? 'rounded-t-xl' : 'rounded-xl')}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground" aria-hidden>
          {getInitials(user.full_name, user.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={cn('line-clamp-2 min-w-0 break-words text-sm font-medium', user.full_name?.trim() ? 'text-foreground' : 'italic text-muted-foreground')}>
              {user.full_name?.trim() || 'Ad girilmemiş'}
            </span>
            {isSelf && <SelfBadge />}
          </span>
          <span className="block break-all text-xs text-muted-foreground">{user.email}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ApprovalLabel status={user.approval_status} />
            <RoleLabel role={user.role} />
          </span>
        </span>
        <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Profili aç: {name}</span>
      </button>
      {showDecision && (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <button
            type="button"
            disabled={updating}
            onClick={() => onStatusChange(user, 'approved')}
            aria-label={`Onayla: ${name}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Onayla
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={() => onStatusChange(user, 'rejected')}
            aria-label={`Reddet: ${name}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" aria-hidden />
            Reddet
          </button>
        </div>
      )}
    </li>
  );
}

function ListItemSkeleton() {
  return (
    <li className="flex animate-pulse gap-3 rounded-xl border bg-card p-3">
      <div className="h-10 w-10 rounded-full bg-muted" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-1/2 rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </li>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

type ApprovalFilter = 'all' | ApprovalStatus;

// Soft hyphens let long words break cleanly inside a narrow tab.
const approvalFilterLabels: Record<ApprovalFilter, string> = {
  all: 'Tümü',
  pending: 'Bekleyen',
  approved: 'Onaylı',
  rejected: 'Redde­dilen',
};

const sortLabels: Record<`${SortCol}-${SortDir}`, string> = {
  'status-asc': 'Önce bekleyenler',
  'name-asc': 'Ada göre (A–Z)',
  'date-desc': 'En yeni kayıt',
  'date-asc': 'En eski kayıt',
  'status-desc': 'Önce reddedilenler',
  'name-desc': 'Ada göre (Z–A)',
};

type PendingAction =
  | { kind: 'status'; user: UserRecord; value: ApprovalStatus }
  | { kind: 'role'; user: UserRecord; value: UserRecord['role'] };

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Search, filter, sort
  const [searchQuery, setSearchQuery] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [sortCol, setSortCol] = useState<SortCol>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Profile dialog
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, phone_number, role, approval_status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
    } else {
      setUsers(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function applyStatus(userId: string, newStatus: ApprovalStatus) {
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

  async function applyRole(userId: string, newRole: 'admin' | 'user') {
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

  // Rejecting (cuts access) and role changes (grant/revoke admin) ask first; approving stays one tap.
  function handleStatusChange(user: UserRecord, status: ApprovalStatus) {
    if (status === user.approval_status) return;
    if (status === 'rejected') setPendingAction({ kind: 'status', user, value: status });
    else applyStatus(user.id, status);
  }

  function handleRoleChange(user: UserRecord, role: UserRecord['role']) {
    if (role !== user.role) setPendingAction({ kind: 'role', user, value: role });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const a = pendingAction;
    if (a.kind === 'status') await applyStatus(a.user.id, a.value);
    else await applyRole(a.user.id, a.value);
    setPendingAction(null);
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function clearFilters() {
    setSearchQuery('');
    setApprovalFilter('all');
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const pendingCount = users.filter((u) => u.approval_status === 'pending').length;
  const searchLower = searchQuery.toLowerCase().trim();
  const approvalCounts: Record<ApprovalFilter, number> = {
    all: users.length,
    pending: pendingCount,
    approved: users.filter((u) => u.approval_status === 'approved').length,
    rejected: users.filter((u) => u.approval_status === 'rejected').length,
  };
  const isFiltered = Boolean(searchLower) || approvalFilter !== 'all';

  const displayedUsers = users
    .filter((u) =>
      (approvalFilter === 'all' || u.approval_status === approvalFilter) &&
      (!searchLower ||
        (u.full_name?.toLowerCase().includes(searchLower) ?? false) ||
        u.email.toLowerCase().includes(searchLower)),
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

  const rowProps = (user: UserRecord) => ({
    user,
    isSelf: user.id === profile?.id,
    updating: updatingId === user.id,
    onStatusChange: handleStatusChange,
    onView: (u: UserRecord) => setSelectedUserId(u.id),
  });

  const showEmpty = !loading && displayedUsers.length === 0;
  const emptyState = loadError ? (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">Kullanıcılar yüklenemedi</p>
      <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
      <button type="button" onClick={fetchUsers} className="mt-4 h-11 rounded-lg border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
        Tekrar dene
      </button>
    </div>
  ) : (
    <div className="rounded-xl border border-dashed px-4 py-10 text-center">
      {isFiltered ? (
        <>
          <p className="text-sm font-medium text-foreground">Bu filtrelere uyan kullanıcı yok</p>
          <button type="button" onClick={clearFilters} className="mt-3 h-11 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            Filtreleri temizle
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Henüz kayıtlı kullanıcı yok.</p>
      )}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {/* Page header */}
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Kullanıcılar</h1>
          {!loading && !loadError && pendingCount > 0 && approvalFilter !== 'pending' && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span><span className="font-medium text-warning">{pendingCount} kullanıcı</span> onay bekliyor.</span>
              <button
                type="button"
                onClick={() => setApprovalFilter('pending')}
                className="-ml-1 h-11 rounded-lg px-1 font-medium text-foreground underline underline-offset-4 hover:bg-muted md:h-9 md:pointer-coarse:h-11"
              >
                Bekleyenleri göster
              </button>
            </p>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ad veya e-posta ara…"
            aria-label="Kullanıcı ara"
            autoComplete="off"
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-background pl-9 pr-11 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring md:h-10 md:text-sm md:pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Aramayı temizle"
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:h-10 md:w-10 md:pointer-coarse:h-11 md:pointer-coarse:w-11"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        {/* Approval filter */}
        <div className="mt-3">
          <FilterTabs
            label="Onay durumu"
            options={['all', 'pending', 'approved', 'rejected'] as const}
            value={approvalFilter}
            labels={approvalFilterLabels}
            counts={approvalCounts}
            onChange={setApprovalFilter}
          />
        </div>

        {/* Count ↔ sort (the desktop table sorts from its headers) */}
        <div className="mb-3 mt-2 flex items-center justify-between gap-3" aria-live="polite">
          <div className="min-w-0 text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted align-middle" />
            ) : (
              <p>{isFiltered ? `${users.length} kullanıcıdan ${displayedUsers.length} tanesi gösteriliyor` : `${users.length} kullanıcı`}</p>
            )}
            {isFiltered && !showEmpty && (
              <button type="button" onClick={clearFilters} className="-ml-2 h-11 rounded-lg px-2 text-sm text-foreground underline underline-offset-4 hover:bg-muted md:h-9 md:pointer-coarse:h-11">
                Filtreleri temizle
              </button>
            )}
          </div>
          <label className="shrink-0 md:hidden">
            <span className="sr-only">Sıralama</span>
            <select
              value={`${sortCol}-${sortDir}`}
              onChange={(e) => {
                const [c, d] = e.target.value.split('-') as [SortCol, SortDir];
                setSortCol(c);
                setSortDir(d);
              }}
              className="h-11 max-w-[11rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(['status-asc', 'name-asc', 'date-desc', 'date-asc'] as const).map((k) => (
                <option key={k} value={k}>{sortLabels[k]}</option>
              ))}
              {!['status-asc', 'name-asc', 'date-desc', 'date-asc'].includes(`${sortCol}-${sortDir}`) && (
                <option value={`${sortCol}-${sortDir}`}>{sortLabels[`${sortCol}-${sortDir}`]}</option>
              )}
            </select>
          </label>
        </div>

        {showEmpty ? emptyState : (
          <>
            {/* ── Desktop table (md+) ─────────────────────────────────────── */}
            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <table className="w-full table-fixed text-left">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <SortableHeader label="Ad Soyad" col="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <th className="w-40 p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rol</th>
                    <SortableHeader label="Durum" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-44" />
                    <SortableHeader label="Katıldı" col="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-32" />
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? [0, 1, 2, 3, 4].map((i) => <TableSkeletonRow key={i} />)
                    : displayedUsers.map((user) => (
                        <UserTableRow key={user.id} {...rowProps(user)} onRoleChange={handleRoleChange} />
                      ))}
                </tbody>
              </table>
            </div>

            {/* ── Phone / tablet list (< md) ──────────────────────────────── */}
            <ul className="space-y-3 md:hidden" aria-busy={loading || undefined}>
              {loading
                ? [0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)
                : displayedUsers.map((user) => <UserListItem key={user.id} {...rowProps(user)} />)}
            </ul>
          </>
        )}
      </main>

      {selectedUser && (
        <UserProfileDialog
          user={selectedUser}
          isSelf={selectedUser.id === profile?.id}
          updating={updatingId === selectedUser.id}
          onStatusChange={handleStatusChange}
          onRoleChange={handleRoleChange}
          onClose={() => setSelectedUserId(null)}
        />
      )}

      {pendingAction && (
        <ConfirmDialog
          title={
            pendingAction.kind === 'status'
              ? 'Kullanıcı reddedilsin mi?'
              : pendingAction.value === 'admin'
                ? 'Yönetici yetkisi verilsin mi?'
                : 'Yönetici yetkisi kaldırılsın mı?'
          }
          confirmLabel={
            pendingAction.kind === 'status' ? 'Reddet' : pendingAction.value === 'admin' ? 'Yönetici yap' : 'Yetkiyi kaldır'
          }
          busy={updatingId === pendingAction.user.id}
          onConfirm={confirmPendingAction}
          onCancel={() => setPendingAction(null)}
        >
          <p>
            <span className="break-all font-medium text-foreground">{displayName(pendingAction.user)}</span>{' '}
            {pendingAction.kind === 'status'
              ? 'reddedildi olarak işaretlenecek ve uygulamaya erişemeyecek.'
              : pendingAction.value === 'admin'
                ? 'tüm yönetim ekranlarına erişebilecek.'
                : 'yönetim ekranlarına erişemeyecek.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
