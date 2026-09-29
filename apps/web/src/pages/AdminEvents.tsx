import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ImageIcon, MoreHorizontal, Pencil, Plus, Search, Settings2, SlidersHorizontal, X } from 'lucide-react';
import { supabase, cn } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import CategoryManagerModal, { type EventCategory } from '@/components/CategoryManagerModal';
import EventFormModal, { type AdminEventRecord } from '@/components/admin/EventFormModal';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { CategoryLabel, EventStateBadges, OccupancyMeter } from '@/components/admin/eventUi';
import { statusLabels, type EventStatus } from '@/components/admin/eventStatus';
import { formatEventDay, formatEventTime } from '@/lib/eventDisplay';

type EventRecord = AdminEventRecord;

// ── Row building blocks ──────────────────────────────────────────────────────

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" width={56} height={56} loading="lazy" className={cn('shrink-0 rounded-lg object-cover', className)} />
  ) : (
    <div className={cn('flex shrink-0 items-center justify-center rounded-lg bg-muted', className)}>
      <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
    </div>
  );
}

function EventWhen({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-xs tabular-nums text-muted-foreground lg:whitespace-nowrap">
      {formatEventDay(iso)}, {formatEventTime(iso)}
    </time>
  );
}

function StatusSelect({
  event,
  disabled,
  onChange,
  className,
}: {
  event: EventRecord;
  disabled: boolean;
  onChange: (v: EventStatus) => void;
  className?: string;
}) {
  return (
    <select
      value={event.status}
      disabled={disabled}
      aria-label={`Durum: ${event.title}`}
      onChange={(e) => onChange(e.target.value as EventStatus)}
      className={cn(
        'h-11 min-w-[9.5rem] rounded-lg lg:h-9 lg:pointer-coarse:h-11 border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-50',
        className,
      )}
    >
      <option value="active">{statusLabels.active}</option>
      <option value="completed">{statusLabels.completed}</option>
      <option value="cancelled">{statusLabels.cancelled}</option>
    </select>
  );
}

const actionBtn =
  'inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors disabled:opacity-50 lg:h-9 lg:pointer-coarse:h-11';

/** Archive / unarchive, with the existing two-step archive confirmation. Renders nothing for active events. */
function ArchiveAction({
  event,
  archiving,
  onArchive,
}: {
  event: EventRecord;
  archiving: boolean;
  onArchive: (id: string, archived: boolean) => void;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (event.is_archived) {
    return (
      <button
        type="button"
        onClick={() => onArchive(event.id, false)}
        disabled={archiving}
        className={cn(actionBtn, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
      >
        <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
        {archiving ? 'İşleniyor…' : 'Arşivden çıkar'}
      </button>
    );
  }
  if (event.status === 'active') return null;
  return confirmArchive ? (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-destructive/10 pl-2.5">
      <span className="text-xs text-destructive">Arşive kaldırılsın mı?</span>
      <button
        type="button"
        onClick={() => { onArchive(event.id, true); setConfirmArchive(false); }}
        disabled={archiving}
        className={cn(actionBtn, 'text-destructive hover:underline')}
      >
        {archiving ? 'İşleniyor…' : 'Onayla'}
      </button>
      <button
        type="button"
        onClick={() => setConfirmArchive(false)}
        className={cn(actionBtn, 'text-muted-foreground hover:text-foreground')}
      >
        Vazgeç
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirmArchive(true)}
      className={cn(actionBtn, 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive')}
    >
      <Archive className="h-3.5 w-3.5" aria-hidden />
      Arşive kaldır
    </button>
  );
}

/** Desktop table actions: edit + archive. */
function RowActions({
  event,
  archiving,
  onEdit,
  onArchive,
}: {
  event: EventRecord;
  archiving: boolean;
  onEdit: (event: EventRecord) => void;
  onArchive: (id: string, archived: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onEdit(event)}
        aria-label={`Düzenle: ${event.title}`}
        className={cn(actionBtn, 'border text-foreground hover:bg-muted')}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Düzenle
      </button>
      <ArchiveAction event={event} archiving={archiving} onArchive={onArchive} />
    </div>
  );
}

// ── Desktop table row ────────────────────────────────────────────────────────

interface RowProps {
  event: EventRecord;
  updating: boolean;
  archiving: boolean;
  onStatusChange: (event: EventRecord, status: EventStatus) => void;
  onArchive: (id: string, archived: boolean) => void;
  onEdit: (event: EventRecord) => void;
}

function EventTableRow({ event, updating, archiving, onStatusChange, onArchive, onEdit, onNavigate }: RowProps & { onNavigate: (id: string) => void }) {
  return (
    <tr
      className="cursor-pointer border-b align-middle transition-colors last:border-0 hover:bg-muted/40"
      onClick={() => onNavigate(event.id)}
    >
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-3">
          <Thumb src={event.image_url} className="h-10 w-10" />
          <div className="min-w-0">
            <Link
              to={`/admin/events/${event.id}`}
              onClick={(e) => e.stopPropagation()}
              className="line-clamp-2 max-w-[18rem] text-sm font-medium text-foreground hover:underline"
              title={event.title}
            >
              {event.title}
            </Link>
            <CategoryLabel
              name={event.event_categories?.name ?? event.category}
              color={event.event_categories?.color_code}
              className="mt-0.5 max-w-[18rem]"
            />
          </div>
        </div>
      </td>
      <td className="px-3 py-3"><EventWhen iso={event.event_date} /></td>
      <td className="w-32 px-3 py-3">
        <OccupancyMeter booked={event.booked_count} capacity={event.capacity} className="w-full" />
      </td>
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-start gap-1.5">
          <StatusSelect event={event} disabled={updating} onChange={(v) => onStatusChange(event, v)} />
          {(!event.is_published || event.is_archived) && (
            <EventStateBadges
              status={event.status}
              published={event.is_published}
              archived={event.is_archived}
              showStatus={false}
            />
          )}
        </div>
      </td>
      <td className="py-3 pl-3 pr-4" onClick={(e) => e.stopPropagation()}>
        <RowActions event={event} archiving={archiving} onEdit={onEdit} onArchive={onArchive} />
      </td>
    </tr>
  );
}

// ── Phone / tablet card ──────────────────────────────────────────────────────
// Read-only status; status changes happen in the edit form. Edit sits top-right,
// secondary actions (archive) live behind "Diğer işlemler".

const iconBtn =
  'flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

function EventListItem({ event, archiving, onArchive, onEdit }: Pick<RowProps, 'event' | 'archiving' | 'onArchive' | 'onEdit'>) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const hasMore = event.is_archived || event.status !== 'active';

  return (
    <li className="rounded-xl border bg-card">
      <div className="flex items-start">
        <Link
          to={`/admin/events/${event.id}`}
          className="flex min-w-0 flex-1 gap-3 self-stretch rounded-tl-xl p-3 pb-2 transition-colors hover:bg-muted/40"
        >
          <Thumb src={event.image_url} className="h-12 w-12 max-[359px]:hidden sm:h-14 sm:w-14" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground">{event.title}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <EventWhen iso={event.event_date} />
              <CategoryLabel name={event.event_categories?.name ?? event.category} color={event.event_categories?.color_code} className="max-w-full" />
            </div>
          </div>
        </Link>
        <div className="flex shrink-0 gap-1 py-1.5 pr-1.5">
          <button type="button" onClick={() => onEdit(event)} aria-label={`Düzenle: ${event.title}`} title="Düzenle" className={iconBtn}>
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          {hasMore && (
            <button
              ref={moreBtnRef}
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-controls={moreId}
              aria-label={`Diğer işlemler: ${event.title}`}
              title="Diğer işlemler"
              className={cn(iconBtn, moreOpen && 'bg-muted text-foreground')}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {/* Full card width, so status and occupancy never compete with the action column. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 pb-3">
        <EventStateBadges status={event.status} published={event.is_published} archived={event.is_archived} />
        <OccupancyMeter booked={event.booked_count} capacity={event.capacity} className="w-24 max-w-full" />
      </div>
      {hasMore && moreOpen && (
        <div
          id={moreId}
          className="flex flex-wrap items-center gap-2 border-t px-3 py-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setMoreOpen(false); moreBtnRef.current?.focus(); }
          }}
        >
          <ArchiveAction event={event} archiving={archiving} onArchive={onArchive} />
        </div>
      )}
    </li>
  );
}

function ListItemSkeleton() {
  return (
    <li className="animate-pulse rounded-xl border bg-card p-3">
      <div className="flex gap-3">
        <div className="h-14 w-14 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>
      </div>
    </li>
  );
}

function TableSkeletonRow() {
  return (
    <tr className="animate-pulse border-b">
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted" />
          <div className="h-4 w-40 rounded bg-muted" />
        </div>
      </td>
      <td className="px-3 py-3"><div className="h-4 w-24 rounded bg-muted" /></td>
      <td className="px-3 py-3"><div className="h-4 w-20 rounded bg-muted" /></td>
      <td className="px-3 py-3"><div className="h-9 w-28 rounded-lg bg-muted" /></td>
      <td className="py-3 pl-3 pr-4"><div className="h-9 w-24 rounded-lg bg-muted" /></td>
    </tr>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | EventStatus;
type PublishFilter = 'all' | 'published' | 'draft';
type ArchiveFilter = 'active' | 'archived';

const publishFilterLabels: Record<PublishFilter, string> = {
  all: 'Tümü',
  published: 'Yayında',
  draft: 'Taslak',
};

const archiveFilterLabels: Record<ArchiveFilter, string> = {
  active: 'Güncel',
  archived: 'Arşivlenen',
};

// Soft hyphen lets "Tamamlandı" break cleanly inside a narrow tab instead of overflowing.
const statusTabLabels: Record<StatusFilter, string> = {
  all: 'Tümü',
  active: 'Aktif',
  completed: 'Tamam­landı',
  cancelled: 'İptal edildi',
};

/** Status filter: four equal tabs (label over count) below lg, the chip row on desktop. */
function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Durum"
      className="grid grid-cols-4 gap-0.5 rounded-lg border bg-muted/40 p-0.5 lg:flex lg:flex-wrap lg:gap-1.5 lg:border-0 lg:bg-transparent lg:p-0"
    >
      {(['all', 'active', 'completed', 'cancelled'] as const).map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-0.5 py-1.5 text-center text-sm leading-tight transition-colors [overflow-wrap:anywhere]',
            'lg:h-9 lg:min-h-0 lg:flex-row lg:gap-1 lg:rounded-full lg:border lg:px-3 lg:py-0 lg:pointer-coarse:h-11',
            value === o
              ? 'bg-foreground font-medium text-background lg:border-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span className="hyphens-manual">{statusTabLabels[o]}</span>
          <span className="text-xs tabular-nums opacity-70 lg:text-sm">{counts[o]}</span>
        </button>
      ))}
    </div>
  );
}

/** Toggle-button group (aria-pressed). Real 44px targets on touch, denser on desktop. */
function ChoiceChips<T extends string>({
  label,
  options,
  value,
  labels,
  counts,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  counts: Record<T, number>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 lg:gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            'h-11 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors lg:h-9 lg:pointer-coarse:h-11 lg:px-3',
            value === o
              ? 'border-foreground bg-foreground font-medium text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {labels[o]} <span className="tabular-nums opacity-70">{counts[o]}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const eventSelect =
  'id, title, description, image_url, event_date, capacity, booked_count, max_tickets_per_user, category, category_id, price, location, is_published, is_archived, status, created_at, event_categories(name, color_code)';

export default function AdminEvents() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<EventRecord | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [publishFilter, setPublishFilter] = useState<PublishFilter>('all');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const filtersBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchEvents();
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // silent: refresh in place (after a save) so rows — and the button that
  // opened the form — stay mounted and focus can return to it.
  async function fetchEvents(silent = false) {
    if (!silent) setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('events')
      .select(eventSelect)
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
    } else {
      setEvents((data ?? []) as unknown as EventRecord[]);
    }
    setLoading(false);
  }

  async function fetchCategories() {
    const { data, error } = await supabase
      .from('event_categories')
      .select('id, name, color_code')
      .order('name');
    if (error) {
      toast.error(error.message);
    } else {
      setCategories(data ?? []);
    }
  }

  async function applyStatus(id: string, newStatus: EventStatus) {
    setUpdatingStatusId(id);
    const { error } = await supabase
      .from('events')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Etkinlik "${statusLabels[newStatus]}" olarak işaretlendi.`);
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e)));
    }
    setUpdatingStatusId(null);
  }

  // Cancelling notifies every confirmed attendee (0012 trigger), so it asks first.
  function handleStatusChange(event: EventRecord, newStatus: EventStatus) {
    if (newStatus === 'cancelled') setPendingCancel(event);
    else applyStatus(event.id, newStatus);
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    await applyStatus(pendingCancel.id, 'cancelled');
    setPendingCancel(null);
  }

  async function handleArchiveEvent(id: string, archived: boolean) {
    setArchivingId(id);

    const { error } = await supabase
      .from('events')
      .update({ is_archived: archived })
      .eq('id', id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(archived ? 'Etkinlik arşive kaldırıldı.' : 'Etkinlik arşivden çıkarıldı.');
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, is_archived: archived } : e)));
    }
    setArchivingId(null);
  }

  function openCreate() {
    setEditingEvent(null);
    setShowModal(true);
  }

  function openEdit(event: EventRecord) {
    setEditingEvent(event);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingEvent(null);
  }

  function clearFilters() {
    setSearchQuery('');
    setStatusFilter('all');
    setPublishFilter('all');
    setArchiveFilter('active');
    setCategoryFilter('all');
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const searchLower = searchQuery.toLowerCase().trim();

  // Archive scope is applied first — the Status/Publish pills and their
  // counts only ever operate within the currently selected archive tab.
  const archiveScoped = events.filter((e) => e.is_archived === (archiveFilter === 'archived'));

  // A selection pointing at a category that was since deleted falls back to "all".
  const effectiveCategory = categoryFilter !== 'all' && categories.some((c) => c.id === categoryFilter) ? categoryFilter : 'all';
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));
  const eventCategoryId = (e: EventRecord) => e.category_id ?? (e.category ? categoryIdByName.get(e.category) ?? null : null);
  const categoryCounts = new Map<string, number>();
  for (const e of archiveScoped) {
    const id = eventCategoryId(e);
    if (id) categoryCounts.set(id, (categoryCounts.get(id) ?? 0) + 1);
  }

  const displayedEvents = archiveScoped.filter((e) => {
    const statusMatch = statusFilter === 'all' || e.status === statusFilter;
    const publishMatch =
      publishFilter === 'all' ||
      (publishFilter === 'published' ? e.is_published : !e.is_published);
    const searchMatch =
      !searchLower ||
      e.title.toLowerCase().includes(searchLower) ||
      (e.description?.toLowerCase().includes(searchLower) ?? false) ||
      (e.category?.toLowerCase().includes(searchLower) ?? false);
    const categoryMatch = effectiveCategory === 'all' || eventCategoryId(e) === effectiveCategory;
    return statusMatch && publishMatch && searchMatch && categoryMatch;
  });

  const archiveCounts: Record<ArchiveFilter, number> = {
    active: events.filter((e) => !e.is_archived).length,
    archived: events.filter((e) => e.is_archived).length,
  };

  const statusCounts: Record<StatusFilter, number> = {
    all: archiveScoped.length,
    active: archiveScoped.filter((e) => e.status === 'active').length,
    cancelled: archiveScoped.filter((e) => e.status === 'cancelled').length,
    completed: archiveScoped.filter((e) => e.status === 'completed').length,
  };

  const publishCounts: Record<PublishFilter, number> = {
    all: archiveScoped.length,
    published: archiveScoped.filter((e) => e.is_published).length,
    draft: archiveScoped.filter((e) => !e.is_published).length,
  };

  const isFiltered = Boolean(searchQuery || statusFilter !== 'all' || publishFilter !== 'all' || effectiveCategory !== 'all');
  // Filters that live in the "Filtreler" panel — counted on its button.
  const panelFilterCount =
    (publishFilter !== 'all' ? 1 : 0) + (archiveFilter === 'archived' ? 1 : 0) + (effectiveCategory !== 'all' ? 1 : 0);
  const hasActiveFilters = isFiltered || archiveFilter === 'archived';

  const rowProps = (event: EventRecord): RowProps => ({
    event,
    updating: updatingStatusId === event.id,
    archiving: archivingId === event.id,
    onStatusChange: handleStatusChange,
    onArchive: handleArchiveEvent,
    onEdit: openEdit,
  });

  const emptyState = loadError ? (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">Etkinlikler yüklenemedi</p>
      <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
      <button
        type="button"
        onClick={() => fetchEvents()}
        className="mt-4 h-11 rounded-lg border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Tekrar dene
      </button>
    </div>
  ) : (
    <div className="rounded-xl border border-dashed px-4 py-10 text-center">
      {isFiltered ? (
        <>
          <p className="text-sm font-medium text-foreground">Bu filtrelere uyan etkinlik yok</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 h-11 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Filtreleri temizle
          </button>
        </>
      ) : archiveFilter === 'archived' ? (
        <p className="text-sm text-muted-foreground">Arşivde etkinlik yok.</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">Henüz etkinlik yok</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            İlk etkinliği oluştur
          </button>
        </>
      )}
    </div>
  );

  const showEmpty = !loading && displayedEvents.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      {/* Page header — wraps instead of squeezing when text is enlarged */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Etkinlikler</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCategoryModal(true)}
            className="hidden h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted lg:inline-flex"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Kategoriler
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 lg:h-10 lg:pointer-coarse:h-11"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Yeni etkinlik
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Başlık, açıklama veya kategori ara…"
          autoComplete="off"
          aria-label="Etkinlik ara"
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-background pl-9 pr-11 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring lg:h-10 lg:pointer-coarse:h-11 lg:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Aramayı temizle"
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:h-10 lg:pointer-coarse:h-11 lg:w-10 lg:pointer-coarse:w-11"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col">
        {/* Primary filter: status — four equal tabs on phones/tablets, the familiar chip row on desktop. */}
        <StatusTabs value={statusFilter} counts={statusCounts} onChange={setStatusFilter} />

        {/* Result count ↔ Filtreler (Filtreler is inline on desktop, so the toggle hides there) */}
        <div className="mt-2 flex items-center justify-between gap-3 lg:order-3 lg:mt-3" aria-live="polite">
          <div className="min-w-0 text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted align-middle" />
            ) : (
              <p>
                {archiveFilter === 'archived' ? 'Arşiv: ' : ''}
                {isFiltered
                  ? `${archiveScoped.length} etkinlikten ${displayedEvents.length} tanesi gösteriliyor`
                  : `${archiveScoped.length} etkinlik`}
              </p>
            )}
            {/* The empty state carries its own clear button; don't show two. */}
            {hasActiveFilters && !(showEmpty && isFiltered) && (
              <button
                type="button"
                onClick={clearFilters}
                className="-ml-2 h-11 rounded-lg px-2 text-sm text-foreground underline underline-offset-4 hover:bg-muted lg:h-9 lg:pointer-coarse:h-11"
              >
                Filtreleri temizle
              </button>
            )}
          </div>
          <button
            ref={filtersBtnRef}
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="event-filters"
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted lg:hidden',
              filtersOpen && 'bg-muted',
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filtreler
            {panelFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold tabular-nums text-background">
                {panelFilterCount}
                <span className="sr-only"> etkin filtre</span>
              </span>
            )}
          </button>
        </div>

        <div
          id="event-filters"
          className={cn(
            'mt-2 space-y-4 rounded-xl border p-3 lg:order-2 lg:mt-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-3 lg:space-y-0 lg:border-0 lg:p-0',
            !filtersOpen && 'hidden',
          )}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && filtersOpen) { setFiltersOpen(false); filtersBtnRef.current?.focus(); }
          }}
        >
          <div className="space-y-2 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
            <p className="text-xs text-muted-foreground">Kapsam</p>
            <ChoiceChips
              label="Kapsam"
              options={['active', 'archived'] as const}
              value={archiveFilter}
              labels={archiveFilterLabels}
              counts={archiveCounts}
              onChange={setArchiveFilter}
            />
          </div>
          <div className="space-y-2 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
            <p className="text-xs text-muted-foreground">Yayın durumu</p>
            <ChoiceChips
              label="Yayın durumu"
              options={['all', 'published', 'draft'] as const}
              value={publishFilter}
              labels={publishFilterLabels}
              counts={publishCounts}
              onChange={setPublishFilter}
            />
          </div>
          <div className="space-y-2 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
            <label htmlFor="event-category-filter" className="block text-xs text-muted-foreground">Kategori</label>
            <select
              id="event-category-filter"
              value={effectiveCategory}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring lg:h-9 lg:w-56 lg:text-sm lg:pointer-coarse:h-11"
            >
              <option value="all">Tüm kategoriler ({archiveScoped.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({categoryCounts.get(c.id) ?? 0})</option>
              ))}
            </select>
          </div>
          {/* Managing categories is a separate action from filtering by one (desktop has it in the header). */}
          <div className="border-t pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              Kategorileri yönet
            </button>
            <p className="px-2 text-xs text-muted-foreground">Kategori ekleyin, adını veya rengini değiştirin.</p>
          </div>
        </div>
      </div>

      <div className="mb-3" />

      {showEmpty ? emptyState : (
        <>
          {/* Desktop table (lg+) */}
          <div className="hidden overflow-x-auto rounded-xl border lg:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Etkinlik</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Tarih</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Doluluk</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Durum</th>
                  <th scope="col" className="py-2.5 pl-3 pr-4 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [0, 1, 2, 3].map((i) => <TableSkeletonRow key={i} />)
                  : displayedEvents.map((event) => (
                      <EventTableRow
                        key={event.id}
                        {...rowProps(event)}
                        onNavigate={(id) => navigate(`/admin/events/${id}`)}
                      />
                    ))}
              </tbody>
            </table>
          </div>

          {/* Phone / tablet list (< lg) */}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden" aria-busy={loading || undefined}>
            {loading
              ? [0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)
              : displayedEvents.map((event) => <EventListItem key={event.id} {...rowProps(event)} />)}
          </ul>
        </>
      )}

      {showModal && (
        <EventFormModal
          editEvent={editingEvent}
          categories={categories}
          onClose={closeModal}
          onSaved={() => fetchEvents(true)}
        />
      )}

      {pendingCancel && (
        <ConfirmDialog
          title="Etkinlik iptal edilsin mi?"
          confirmLabel="Etkinliği iptal et"
          busy={updatingStatusId === pendingCancel.id}
          onConfirm={confirmCancel}
          onCancel={() => setPendingCancel(null)}
        >
          <p>
            <span className="font-medium text-foreground">{pendingCancel.title}</span> iptal edildi olarak
            işaretlenecek ve onaylı rezervasyonu olan herkese bildirim gönderilecek.
          </p>
        </ConfirmDialog>
      )}

      {showCategoryModal && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onChanged={() => {
            fetchCategories();
            fetchEvents();
          }}
        />
      )}
    </main>
  );
}
