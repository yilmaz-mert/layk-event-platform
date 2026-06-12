import { useEffect, useState } from 'react';
import { Bookmark, CalendarDays, Tag, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface BookedEvent {
  id: string;
  title: string;
  image_url: string | null;
  event_date: string;
  category: string | null;
  status: string;
  booked_count: number;
  capacity: number;
}

interface Reservation {
  id: string;
  status: string;
  created_at: string;
  tickets_requested: number;
  events: BookedEvent | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="animate-pulse flex gap-3 rounded-xl border bg-card p-4">
      <div className="h-16 w-16 shrink-0 rounded-lg bg-muted" />
      <div className="flex flex-1 flex-col justify-between gap-2 py-0.5">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditModal({
  reservation,
  saving,
  onClose,
  onSave,
}: {
  reservation: Reservation;
  saving: boolean;
  onClose: () => void;
  onSave: (reservation: Reservation, newSeats: number) => void;
}) {
  const event = reservation.events!;
  // Compute max seats the user can request:
  // current booked_count minus their own held seats = other people's seats
  // capacity minus that = what's available to this user
  const spotsAvailableForUser =
    event.capacity - event.booked_count + reservation.tickets_requested;
  const maxSeats = Math.min(5, Math.max(1, spotsAvailableForUser));

  const [seats, setSeats] = useState(reservation.tickets_requested);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Edit Booking</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{event.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Seat counter */}
        <div className="mb-5 space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Number of seats
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats <= 1}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span className="flex-1 text-center text-xl font-bold text-foreground">
              {seats}
            </span>
            <button
              onClick={() => setSeats((s) => Math.min(maxSeats, s + 1))}
              disabled={seats >= maxSeats}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            max {maxSeats} {maxSeats === 1 ? 'seat' : 'seats'} available
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(reservation, seats)}
            disabled={saving || seats === reservation.tickets_requested}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────

interface BookingCardProps {
  reservation: Reservation;
  isPast?: boolean;
  cancelling?: boolean;
  onCancel?: (id: string) => void;
  onEdit?: (reservation: Reservation) => void;
}

function BookingCard({
  reservation,
  isPast = false,
  cancelling = false,
  onCancel,
  onEdit,
}: BookingCardProps) {
  const event = reservation.events;
  if (!event) return null;

  return (
    <div className={cn('flex gap-3 rounded-xl border bg-card p-4', isPast && 'opacity-60')}>
      {event.image_url ? (
        <img
          src={event.image_url}
          alt={event.title}
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Bookmark className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-medium text-foreground">{event.title}</h3>
            {!isPast && reservation.tickets_requested > 1 && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                ×{reservation.tickets_requested}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              {formatDate(event.event_date)}
            </span>
            {event.category && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" />
                {event.category}
              </span>
            )}
          </div>
        </div>

        {!isPast && (
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(reservation)}
                className="rounded-lg border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Edit
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(reservation.id)}
                disabled={cancelling}
                className="rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </div>
        )}

        {isPast && (
          <span className="self-start rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {reservation.tickets_requested > 1
              ? `${reservation.tickets_requested} tickets`
              : 'Completed'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyBookings() {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchReservations();
  }, []);

  async function fetchReservations() {
    setLoading(true);

    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        status,
        created_at,
        tickets_requested,
        events (
          id,
          title,
          image_url,
          event_date,
          category,
          status,
          booked_count,
          capacity
        )
      `)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load your bookings.');
    } else {
      setReservations((data ?? []) as unknown as Reservation[]);
    }

    setLoading(false);
  }

  async function handleCancel(reservationId: string) {
    setCancellingId(reservationId);

    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Reservation cancelled.');
      await fetchReservations();
    }

    setCancellingId(null);
  }

  async function handleSaveEdit(reservation: Reservation, newSeats: number) {
    setSavingEdit(true);

    // Update tickets_requested — fires both the audit log trigger (action: 'edited')
    // and the capacity sync trigger (which now handles seat-count deltas on confirmed rows)
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ tickets_requested: newSeats })
      .eq('id', reservation.id);

    if (updateError) {
      toast.error(updateError.message);
      setSavingEdit(false);
      return;
    }

    toast.success(`Updated to ${newSeats} ${newSeats === 1 ? 'ticket' : 'tickets'}.`);
    setEditingReservation(null);
    setSavingEdit(false);
    await fetchReservations();
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const now = new Date();

  const upcoming = reservations
    .filter((r) => r.events && new Date(r.events.event_date) > now)
    .sort((a, b) =>
      new Date(a.events!.event_date).getTime() - new Date(b.events!.event_date).getTime(),
    );

  const past = reservations
    .filter((r) => r.events && new Date(r.events.event_date) <= now)
    .sort((a, b) =>
      new Date(b.events!.event_date).getTime() - new Date(a.events!.event_date).getTime(),
    );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <h1 className="mb-6 text-xl font-bold text-foreground">My Bookings</h1>

        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
          </div>
        )}

        {!loading && reservations.length === 0 && (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Bookmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No bookings yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Events you book will appear here.
            </p>
          </div>
        )}

        {!loading && reservations.length > 0 && (
          <>
            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Upcoming
                </h2>
                <div className="space-y-3">
                  {upcoming.map((r) => (
                    <BookingCard
                      key={r.id}
                      reservation={r}
                      cancelling={cancellingId === r.id}
                      onCancel={handleCancel}
                      onEdit={setEditingReservation}
                    />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section className={cn(upcoming.length > 0 && 'mt-8')}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Past
                </h2>
                <div className="space-y-3">
                  {past.map((r) => <BookingCard key={r.id} reservation={r} isPast />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Edit modal — rendered outside <main> to cover full viewport */}
      {editingReservation && (
        <EditModal
          reservation={editingReservation}
          saving={savingEdit}
          onClose={() => setEditingReservation(null)}
          onSave={handleSaveEdit}
        />
      )}
    </>
  );
}
