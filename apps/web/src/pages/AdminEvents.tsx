import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronRight,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type EventStatus = 'active' | 'cancelled' | 'completed';

interface EventRecord {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  max_tickets_per_user: number;
  category: string | null;
  status: EventStatus;
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  event_date: string;
  capacity: string;
  category: string;
  image: File | null;
  existingImageUrl: string | null;
  maxTickets: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  event_date: '',
  capacity: '',
  category: '',
  image: null,
  existingImageUrl: null,
  maxTickets: '5',
};

// ── Shared style constants ───────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Skeleton loaders ─────────────────────────────────────────────────────────

function TableSkeletonRow() {
  return (
    <tr className="animate-pulse border-b">
      <td className="p-3"><div className="h-10 w-10 rounded-lg bg-muted" /></td>
      <td className="p-3"><div className="h-4 w-40 rounded bg-muted" /></td>
      <td className="p-3"><div className="h-4 w-20 rounded bg-muted" /></td>
      <td className="p-3"><div className="h-4 w-28 rounded bg-muted" /></td>
      <td className="p-3"><div className="h-4 w-12 rounded bg-muted" /></td>
      <td className="p-3"><div className="h-7 w-28 rounded-lg bg-muted" /></td>
      <td className="p-3"><div className="h-4 w-24 rounded bg-muted" /></td>
      <td className="p-3"><div className="h-4 w-4 rounded bg-muted" /></td>
    </tr>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border bg-card">
      <div className="h-32 bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-muted" />
          <div className="h-5 w-24 rounded-full bg-muted" />
        </div>
        <div className="h-7 w-32 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

// ── Status components ────────────────────────────────────────────────────────

const statusStyles: Record<EventStatus, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', statusStyles[status])}>
      {status}
    </span>
  );
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: EventStatus;
  disabled: boolean;
  onChange: (v: EventStatus) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as EventStatus)}
      className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-50"
    >
      <option value="active">Active</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>
    </select>
  );
}

// ── Desktop table row ────────────────────────────────────────────────────────

function EventTableRow({
  event,
  updating,
  deleting,
  onStatusChange,
  onNavigate,
  onDelete,
  onEdit,
}: {
  event: EventRecord;
  updating: boolean;
  deleting: boolean;
  onStatusChange: (id: string, status: EventStatus) => void;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (event: EventRecord) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = event.status !== 'active';

  return (
    <tr
      className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
      onClick={() => onNavigate(event.id)}
    >
      {/* Thumbnail */}
      <td className="p-3">
        {event.image_url ? (
          <img src={event.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </td>

      {/* Title */}
      <td className="p-3">
        <p className="max-w-[200px] truncate text-sm font-medium text-foreground">{event.title}</p>
        {event.description && (
          <p className="max-w-[200px] truncate text-xs text-muted-foreground">{event.description}</p>
        )}
      </td>

      {/* Category */}
      <td className="p-3">
        {event.category ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Tag className="h-3 w-3" />
            {event.category}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Date */}
      <td className="p-3">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3 shrink-0" />
          {formatDate(event.event_date)}
        </span>
      </td>

      {/* Capacity */}
      <td className="p-3">
        <span className="text-sm text-foreground">{event.capacity}</span>
      </td>

      {/* Status select — stopPropagation prevents row navigation */}
      <td className="p-3" onClick={(e) => e.stopPropagation()}>
        <StatusSelect
          value={event.status}
          disabled={updating}
          onChange={(v) => onStatusChange(event.id, v)}
        />
      </td>

      {/* Edit + Delete — stopPropagation prevents row navigation */}
      <td className="p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <button
            onClick={() => onEdit(event)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>

          {canDelete && (
            <>
              <span className="text-muted-foreground/30">·</span>
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { onDelete(event.id); setConfirmDelete(false); }}
                    disabled={deleting}
                    className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                  >
                    {deleting ? '…' : 'Confirm'}
                  </button>
                  <span className="text-muted-foreground/40">·</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </td>

      {/* Chevron indicator */}
      <td className="p-3 text-muted-foreground/40">
        <ChevronRight className="h-4 w-4" />
      </td>
    </tr>
  );
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function EventCard({
  event,
  updating,
  deleting,
  onStatusChange,
  onNavigate,
  onDelete,
  onEdit,
}: {
  event: EventRecord;
  updating: boolean;
  deleting: boolean;
  onStatusChange: (id: string, status: EventStatus) => void;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (event: EventRecord) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = event.status !== 'active';

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-xl border bg-card transition hover:shadow-md"
      onClick={() => onNavigate(event.id)}
    >
      {event.image_url ? (
        <img src={event.image_url} alt={event.title} className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 items-center justify-center bg-muted">
          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-foreground">{event.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              {formatDate(event.event_date)}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {event.category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" />
              {event.category}
            </span>
          )}
          <StatusBadge status={event.status} />
          <span className="text-xs text-muted-foreground">{event.capacity} spots</span>
        </div>

        {/* Status select — stopPropagation prevents card navigation */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-muted-foreground">Status:</span>
          <StatusSelect
            value={event.status}
            disabled={updating}
            onChange={(v) => onStatusChange(event.id, v)}
          />
        </div>

        {/* Card actions — stopPropagation prevents card navigation */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onEdit(event)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            Edit event
          </button>

          {canDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onDelete(event.id); setConfirmDelete(false); }}
                  disabled={deleting}
                  className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                >
                  {deleting ? '…' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Delete event
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Event Modal (create + edit) ───────────────────────────────────────────────

function EventModal({
  editEvent,
  onClose,
  onSaved,
}: {
  editEvent: EventRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = editEvent !== null;
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(() =>
    isEditing
      ? {
          title: editEvent.title,
          description: editEvent.description ?? '',
          event_date: toDatetimeLocalValue(editEvent.event_date),
          capacity: editEvent.capacity.toString(),
          category: editEvent.category ?? '',
          image: null,
          existingImageUrl: editEvent.image_url,
          maxTickets: editEvent.max_tickets_per_user.toString(),
        }
      : EMPTY_FORM,
  );

  // preview holds the blob URL for a newly selected file
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // The displayed image: a newly selected file blob takes precedence over the DB URL
  const displayedPreview = preview ?? form.existingImageUrl;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setForm((prev) => ({ ...prev, image: file }));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (file) {
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreview(url);
    } else {
      previewUrlRef.current = null;
      setPreview(null);
    }
  }

  function clearImage() {
    setForm((prev) => ({ ...prev, image: null, existingImageUrl: null }));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cap = parseInt(form.capacity, 10);
    const maxTix = parseInt(form.maxTickets, 10);
    if (!form.title.trim()) return toast.error('Title is required.');
    if (!form.event_date) return toast.error('Event date is required.');
    if (isNaN(cap) || cap < 1) return toast.error('Capacity must be a positive number.');
    if (isNaN(maxTix) || maxTix < 1) return toast.error('Max tickets per user must be at least 1.');

    setSubmitting(true);
    try {
      // Determine final image URL:
      // 1. New file selected → upload it
      // 2. No new file → keep existingImageUrl (null if the admin cleared it)
      let imageUrl: string | null = form.existingImageUrl;

      if (form.image) {
        const ext = form.image.name.split('.').pop() ?? 'jpg';
        const safeName = form.image.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9]/g, '-')
          .toLowerCase();
        const fileName = `${Date.now()}-${safeName}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('event-banners')
          .upload(fileName, form.image, { upsert: false });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('event-banners')
          .getPublicUrl(fileName);
        imageUrl = publicUrl;
      }

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: new Date(form.event_date).toISOString(),
        capacity: cap,
        max_tickets_per_user: maxTix,
        category: form.category.trim() || null,
        image_url: imageUrl,
      };

      if (isEditing) {
        // Remove the old banner from storage if it's being replaced or cleared
        if (editEvent.image_url && (form.image || !form.existingImageUrl)) {
          const oldFileName = editEvent.image_url.split('/').pop()?.split('?')[0];
          if (oldFileName) {
            await supabase.storage.from('event-banners').remove([oldFileName]);
          }
        }

        const { error } = await supabase
          .from('events')
          .update(payload)
          .eq('id', editEvent.id);
        if (error) throw error;
        toast.success('Event updated successfully!');
      } else {
        const { error } = await supabase
          .from('events')
          .insert({ ...payload, status: 'active' });
        if (error) throw error;
        toast.success('Event created successfully!');
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Failed to ${isEditing ? 'update' : 'create'} event.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 my-4 w-full max-w-lg rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {isEditing ? 'Edit Event' : 'Create New Event'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Future Tech Conference 2026"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Brief summary of the event…"
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Date & Time <span className="text-destructive">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={form.event_date}
                onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Capacity <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))}
                placeholder="100"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              placeholder="e.g. Conference, Workshop"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Max Tickets Per User <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              required
              min={1}
              value={form.maxTickets}
              onChange={(e) => setForm((p) => ({ ...p, maxTickets: e.target.value }))}
              placeholder="5"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Banner Image</label>
            {displayedPreview ? (
              <div className="relative overflow-hidden rounded-lg">
                <img src={displayedPreview} alt="Preview" className="h-36 w-full object-cover" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground backdrop-blur-sm transition hover:bg-background"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-input px-4 py-8 text-center transition hover:border-primary/50 hover:bg-muted/40">
                <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground">
                  {isEditing ? 'Click to upload a new banner image' : 'Click to upload a banner image'}
                </span>
                <span className="text-xs text-muted-foreground/60">PNG, JPG, WEBP</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? isEditing ? 'Saving…' : 'Creating…'
                : isEditing ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | EventStatus;

export default function AdminEvents() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, image_url, event_date, capacity, max_tickets_per_user, category, status, created_at')
        .order('created_at', { ascending: false });
      if (!isMounted) return;
      if (error) {
        toast.error(error.message);
      } else {
        setEvents(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => { isMounted = false; };
  }, []);

  async function fetchEvents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, image_url, event_date, capacity, max_tickets_per_user, category, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setEvents(data ?? []);
    }
    setLoading(false);
  }

  async function handleStatusChange(id: string, newStatus: EventStatus) {
    setUpdatingStatusId(id);
    const { error } = await supabase
      .from('events')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Event marked as "${newStatus}".`);
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e)));
    }
    setUpdatingStatusId(null);
  }

  async function handleDeleteEvent(id: string) {
    setDeletingId(id);

    // Remove the banner from storage before deleting the DB row
    const eventToDelete = events.find((e) => e.id === id);
    if (eventToDelete?.image_url) {
      const fileName = eventToDelete.image_url.split('/').pop()?.split('?')[0];
      if (fileName) {
        await supabase.storage.from('event-banners').remove([fileName]);
      }
    }

    const { error } = await supabase.from('events').delete().eq('id', id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Event deleted.');
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
    setDeletingId(null);
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

  // ── Derived data ─────────────────────────────────────────────────────────

  const searchLower = searchQuery.toLowerCase().trim();

  const displayedEvents = events.filter((e) => {
    const statusMatch = statusFilter === 'all' || e.status === statusFilter;
    const searchMatch =
      !searchLower ||
      e.title.toLowerCase().includes(searchLower) ||
      (e.description?.toLowerCase().includes(searchLower) ?? false) ||
      (e.category?.toLowerCase().includes(searchLower) ?? false);
    return statusMatch && searchMatch;
  });

  const statusCounts: Record<StatusFilter, number> = {
    all: events.length,
    active: events.filter((e) => e.status === 'active').length,
    cancelled: events.filter((e) => e.status === 'cancelled').length,
    completed: events.filter((e) => e.status === 'completed').length,
  };

  const isFiltered = searchQuery || statusFilter !== 'all';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      {/* Page header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Event Management</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted" />
            ) : isFiltered ? (
              `${displayedEvents.length} of ${events.length} ${events.length === 1 ? 'event' : 'events'}`
            ) : (
              `${events.length} ${events.length === 1 ? 'event' : 'events'} total`
            )}
          </p>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Event</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, description, or category…"
          className={
            'w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm ' +
            'text-foreground placeholder:text-muted-foreground focus:outline-none ' +
            'focus:ring-2 focus:ring-ring focus:ring-offset-1 transition'
          }
        />
      </div>

      {/* Status filter pills */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(['all', 'active', 'cancelled', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium capitalize transition',
              statusFilter === f
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {f === 'all' ? 'All' : f} ({statusCounts[f]})
          </button>
        ))}
      </div>

      {/* Desktop table (md+) */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b bg-muted/40">
              {['', 'Title', 'Category', 'Date', 'Cap.', 'Status', 'Actions', ''].map((h, i) => (
                <th
                  key={i}
                  className="p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [0, 1, 2, 3].map((i) => <TableSkeletonRow key={i} />)
              : displayedEvents.map((event) => (
                  <EventTableRow
                    key={event.id}
                    event={event}
                    updating={updatingStatusId === event.id}
                    deleting={deletingId === event.id}
                    onStatusChange={handleStatusChange}
                    onNavigate={(id) => navigate(`/admin/events/${id}`)}
                    onDelete={handleDeleteEvent}
                    onEdit={openEdit}
                  />
                ))}
          </tbody>
        </table>

        {!loading && displayedEvents.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {isFiltered ? 'No events match your filters.' : 'No events yet. Create your first one!'}
          </p>
        )}
      </div>

      {/* Mobile card grid (< md) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
        {loading
          ? [0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)
          : displayedEvents.length === 0
            ? (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                {isFiltered ? 'No events match your filters.' : 'No events yet. Create your first one!'}
              </p>
            )
            : displayedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  updating={updatingStatusId === event.id}
                  deleting={deletingId === event.id}
                  onStatusChange={handleStatusChange}
                  onNavigate={(id) => navigate(`/admin/events/${id}`)}
                  onDelete={handleDeleteEvent}
                  onEdit={openEdit}
                />
              ))}
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <EventModal
          editEvent={editingEvent}
          onClose={closeModal}
          onSaved={fetchEvents}
        />
      )}
    </main>
  );
}
