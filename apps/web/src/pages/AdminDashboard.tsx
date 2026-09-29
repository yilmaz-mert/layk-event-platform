import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Search, X, XCircle } from 'lucide-react';
import { supabase, formatShortDate, useAuth, cn } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import FilterTabs from '@/components/admin/FilterTabs';
import UserProfileDialog from '@/components/admin/UserProfileDialog';
import { ApprovalLabel, RoleLabel, SelfBadge, type ApprovalStatus, type UserRecord } from '@/components/admin/userAccount';
import { displayName, getInitials } from '@/lib/userDisplay';

// ── Types ────────────────────────────────────────────────────────────────────

async function queryUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone_number, role, approval_status, created_at')
    .order('created_at', { ascending: false });
  return { users: (data ?? []) as UserRecord[], error: error?.message ?? null };
}

type SortCol = 'name' | 'status' | 'date';
type SortDir = 'asc' | 'desc';

// pending floats to the top on first load
const STATUS_ORDER: Record<ApprovalStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

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

  const applyUsers = useCallback(({ users: list, error }: Awaited<ReturnType<typeof queryUsers>>) => {
    if (error) setLoadError(error);
    else setUsers(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false; // the page can unmount before the request resolves
    queryUsers().then((result) => { if (!ignore) applyUsers(result); });
    return () => { ignore = true; };
  }, [applyUsers]);

  function reloadUsers() {
    setLoading(true);
    setLoadError(null);
    queryUsers().then(applyUsers);
  }

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
      <button type="button" onClick={reloadUsers} className="mt-4 h-11 rounded-lg border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
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
