import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Tag,
  User as UserIcon,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

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
}

interface Booking {
  id: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  events: BookingEvent | null;
}

// pending floats to the top on first load
const STATUS_ORDER: Record<ApprovalStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatJoinDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
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
        Approved
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        <XCircle className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}

function RoleBadge({ role }: { role: UserRecord['role'] }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
      <ShieldCheck className="h-3 w-3" />
      Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <UserIcon className="h-3 w-3" />
      User
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
      <option value="pending">Pending</option>
      <option value="approved">Approved</option>
      <option value="rejected">Rejected</option>
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
      <option value="user">User</option>
      <option value="admin">Admin</option>
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

function BookingItem({ booking }: { booking: Booking }) {
  const ev = booking.events;
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {ev?.title ?? '—'}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
            booking.status === 'confirmed'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground line-through',
          )}
        >
          {booking.status}
        </span>
      </div>

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
        {ev?.status && (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 capitalize',
              ev.status === 'active'
                ? 'bg-primary/10 text-primary'
                : ev.status === 'completed'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-destructive/10 text-destructive',
            )}
          >
            {ev.status}
          </span>
        )}
      </div>
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [visible, setVisible] = useState(false);

  // Stable ref so the Escape handler always calls the latest onClose
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Trigger slide-in after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Lock background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fetch booking history whenever the viewed user changes
  useEffect(() => {
    let cancelled = false;
    setLoadingBookings(true);
    setBookings([]);

    supabase
      .from('reservations')
      .select('id, status, created_at, events(id, title, event_date, category, status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setBookings((data ?? []) as unknown as Booking[]);
          setLoadingBookings(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Escape key closes drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setVisible(false);
        setTimeout(() => onCloseRef.current(), 300);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(() => onCloseRef.current(), 300);
  }

  const initials = getInitials(user.full_name, user.email);

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
            aria-label="Close profile drawer"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Profile metadata */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Profile Details
            </h3>
            <div className="divide-y rounded-xl border bg-muted/30">
              <MetaRow
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={user.email}
              />
              <MetaRow
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={user.phone_number ?? 'No phone provided'}
                dimmed={!user.phone_number}
              />
              <MetaRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="Joined"
                value={formatJoinDate(user.created_at)}
              />
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Role</span>
                <RoleBadge role={user.role} />
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Status</span>
                <StatusBadge status={user.approval_status} />
              </div>
            </div>
          </section>

          {/* Booking history */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Booking History
              </h3>
              {!loadingBookings && (
                <span className="text-xs text-muted-foreground">
                  {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
                </span>
              )}
            </div>

            {loadingBookings ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <BookingItemSkeleton key={i} />)}
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => <BookingItem key={b.id} booking={b} />)}
              </div>
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
          {user.full_name ?? <span className="italic text-muted-foreground/50">No name set</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
        <p className={cn(
          'mt-0.5 text-xs',
          user.phone_number ? 'text-muted-foreground' : 'italic text-muted-foreground/40',
        )}>
          {user.phone_number ?? 'No phone provided'}
        </p>
      </td>

      {/* Role select — stopPropagation prevents opening the drawer */}
      <td className="p-4" onClick={(e) => e.stopPropagation()}>
        <RoleSelect
          value={user.role}
          disabled={isSelf || updating}
          onChange={(v) => onRoleChange(user.id, v)}
        />
      </td>

      {/* Status select — stopPropagation prevents opening the drawer */}
      <td className="p-4" onClick={(e) => e.stopPropagation()}>
        <ApprovalSelect
          value={user.approval_status}
          disabled={isSelf || updating}
          onChange={(v) => onStatusChange(user.id, v)}
        />
      </td>

      {/* Joined date + self indicator */}
      <td className="p-4">
        <span className="text-xs text-muted-foreground">{formatJoinDate(user.created_at)}</span>
        {isSelf && (
          <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
            You
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
                You
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className={cn(
            'truncate text-xs',
            user.phone_number ? 'text-muted-foreground' : 'italic text-muted-foreground/40',
          )}>
            {user.phone_number ?? 'No phone provided'}
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
          Joined {formatJoinDate(user.created_at)}
        </p>
        <button
          onClick={() => onView(user)}
          className="rounded-lg border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          View Profile →
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

  // Profile drawer — derive selectedUser from the live users array so inline
  // select mutations are immediately reflected in the open drawer
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
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
  }

  async function handleStatusChange(userId: string, newStatus: ApprovalStatus) {
    setUpdatingId(userId);
    const { error } = await supabase
      .from('users')
      .update({ approval_status: newStatus })
      .eq('id', userId);

    if (error) {
      toast.error(error.message);
    } else {
      const label = newStatus === 'approved' ? 'Approved' : newStatus === 'rejected' ? 'Rejected' : 'set to Pending';
      toast.success(`Status ${label}.`);
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
      toast.success(`Role set to ${newRole}.`);
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
      let cmp = 0;
      if (sortCol === 'name') {
        cmp = (a.full_name ?? a.email)
          .toLowerCase()
          .localeCompare((b.full_name ?? b.email).toLowerCase());
      } else if (sortCol === 'status') {
        cmp = STATUS_ORDER[a.approval_status] - STATUS_ORDER[b.approval_status];
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">User Management</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-block h-4 w-32 animate-pulse rounded bg-muted" />
            ) : (
              <>
                {searchQuery
                  ? `${displayedUsers.length} of ${users.length} members`
                  : `${users.length} ${users.length === 1 ? 'member' : 'members'} registered`}
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                    {pendingCount} pending
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
            placeholder="Search by name or email…"
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
                <SortableHeader label="Name" col="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                <SortableHeader label="Status" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Joined" col="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
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
              {searchQuery ? `No users match "${searchQuery}".` : 'No users found.'}
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
                  {searchQuery ? `No users match "${searchQuery}".` : 'No users found.'}
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
