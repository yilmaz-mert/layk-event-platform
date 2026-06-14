import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Tag, Users } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
import { useToast } from '@/components/Toast';
import { cn } from '@layk/core';

// ── Types ────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  booked_count: number;
  max_tickets_per_user: number;
  category: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface UserReservation {
  id: string;
  status: 'confirmed' | 'cancelled';
  tickets_requested: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [reservation, setReservation] = useState<UserReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (id && profile?.id) fetchData(id, profile.id);
  }, [id, profile?.id]);

  useEffect(() => {
    if (reservation) setSelectedSeats(reservation.tickets_requested);
  }, [reservation]);

  async function fetchData(eventId: string, userId: string) {
    setLoading(true);
    setError(null);

    const [eventRes, reservationRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, description, image_url, event_date, capacity, booked_count, max_tickets_per_user, category, status')
        .eq('id', eventId)
        .single(),
      supabase
        .from('reservations')
        .select('id, status, tickets_requested')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .maybeSingle(),
    ]);

    if (eventRes.error || !eventRes.data) {
      setError('Event not found.');
    } else {
      setEvent(eventRes.data);
      setReservation(reservationRes.data ?? null);
      // Fire-and-forget: record category interest so the capacity alert
      // trigger can personalise future notifications for this user.
      if (eventRes.data.category && userId) {
        supabase.from('user_interests').upsert(
          { user_id: userId, category: eventRes.data.category, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,category' },
        );
      }
    }
    setLoading(false);
  }

  async function handleBook() {
    if (!profile?.id || !event) return;
    setBooking(true);

    const { error: rpcError } = await supabase.rpc('book_event', {
      p_user_uuid: profile.id,
      p_event_uuid: event.id,
      p_requested_seats: selectedSeats,
    });

    if (rpcError) {
      const msg = rpcError.message.toLowerCase();
      toast.error(
        msg.includes('fully booked') ? 'This event is fully booked.'
          : msg.includes('already booked') ? 'You already have an active booking for this event.'
          : msg.includes('exceed') ? 'You cannot book more than the per-user ticket limit.'
          : rpcError.message,
      );
    } else {
      toast.success(`Booking confirmed for ${selectedSeats} ${selectedSeats === 1 ? 'seat' : 'seats'}!`);
      await fetchData(event.id, profile.id);
    }
    setBooking(false);
  }

  async function handleUpdate() {
    if (!profile?.id || !event || !reservation) return;
    setBooking(true);

    const { error: updateError } = await supabase
      .from('reservations')
      .update({ tickets_requested: selectedSeats })
      .eq('id', reservation.id);

    if (updateError) {
      toast.error(updateError.message);
    } else {
      toast.success(`Updated to ${selectedSeats} ${selectedSeats === 1 ? 'seat' : 'seats'}.`);
      await fetchData(event.id, profile.id);
    }
    setBooking(false);
  }

  async function handleCancel() {
    if (!profile?.id || !reservation?.id || !event) return;
    setCancelling(true);

    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservation.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Reservation cancelled successfully.');
      setShowCancelModal(false);
      await fetchData(event.id, profile.id);
    }
    setCancelling(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const spotsLeft = event ? event.capacity - event.booked_count : 0;
  const isSoldOut = spotsLeft <= 0;
  const isPast = event ? new Date(event.event_date) <= new Date() : false;
  const isActive = event?.status === 'active';
  const isApproved = profile?.approval_status === 'approved';
  const isConfirmed = reservation?.status === 'confirmed';
  const maxSeats = Math.min(event?.max_tickets_per_user ?? 5, Math.max(1, spotsLeft));
  // When editing a confirmed booking, the user's own held seats are already in booked_count,
  // so add them back to give the correct ceiling for their update.
  const maxSeatsForUpdate = isConfirmed && reservation && event
    ? Math.min(event.max_tickets_per_user, Math.max(1, spotsLeft + reservation.tickets_requested))
    : maxSeats;
  const fillPct = event ? Math.min(100, Math.round((event.booked_count / event.capacity) * 100)) : 0;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valueStr = e.target.value;
    if (valueStr === '') {
      setSelectedSeats(0);
      return;
    }
    const parsed = parseInt(valueStr, 10);
    if (isNaN(parsed)) return;
    setSelectedSeats(Math.max(0, parsed));
  };

  const handleInputBlur = () => {
    if (selectedSeats < 1) {
      setSelectedSeats(1);
      return;
    }
    const cap = isConfirmed && reservation ? maxSeatsForUpdate : maxSeats;
    if (selectedSeats > cap) {
      setSelectedSeats(cap);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="h-64 w-full rounded-2xl bg-muted sm:h-80" />
          <div className="h-8 w-2/3 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="space-y-2">
            {[100, 90, 75].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error || !event) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <p className="text-sm text-destructive">{error ?? 'Event not found.'}</p>
        </div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      {/* Back navigation */}
      <Link
        to="/"
        className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to events
      </Link>

      {/* Banner image */}
      {event.image_url ? (
        <div className="mb-6 overflow-hidden rounded-2xl bg-muted">
          <img
            src={event.image_url}
            alt={event.title}
            className="h-64 w-full object-cover sm:h-80"
          />
        </div>
      ) : (
        <div className="mb-6 flex h-48 items-center justify-center rounded-2xl bg-muted sm:h-64">
          <CalendarDays className="h-16 w-16 text-muted-foreground/20" />
        </div>
      )}

      {/* Title block */}
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {event.category && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Tag className="h-3 w-3" />
              {event.category}
            </span>
          )}
          {event.status !== 'active' && (
            <span className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
              event.status === 'completed'
                ? 'bg-muted text-muted-foreground'
                : 'bg-destructive/10 text-destructive',
            )}>
              {event.status}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{event.title}</h1>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4 shrink-0" />
          {formatDate(event.event_date)}
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Description */}
        <div className="lg:col-span-2">
          {event.description ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                About this event
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {event.description}
              </p>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </div>

        {/* Booking panel */}
        <div className="space-y-4">
          {/* Capacity card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Capacity
              </span>
              <span className="text-xs font-semibold text-foreground">
                {event.booked_count} / {event.capacity}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isSoldOut
                    ? 'bg-destructive'
                    : fillPct >= 80
                      ? 'bg-yellow-500'
                      : 'bg-primary',
                )}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            {!isPast && !isSoldOut && (
              <p className="text-xs text-muted-foreground">
                {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} remaining
              </p>
            )}
          </div>

          {/* Action card */}
          <div className="rounded-xl border bg-card p-4">
            {!isActive || isPast ? (
              <p className="text-center text-sm text-muted-foreground">
                {event.status === 'cancelled'
                  ? 'This event has been cancelled.'
                  : 'This event has already taken place.'}
              </p>
            ) : isConfirmed ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                  ✓ You&apos;re registered
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Update seat count
                  </label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={selectedSeats <= 1 || booking}
                        onClick={() => setSelectedSeats((prev) => Math.max(1, prev - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background font-bold text-foreground hover:bg-muted disabled:opacity-50 transition"
                      >
                        −
                      </button>

                      <input
                        type="number"
                        value={selectedSeats === 0 ? '' : selectedSeats}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        disabled={booking}
                        min={1}
                        max={maxSeatsForUpdate}
                        className="h-10 w-20 rounded-lg border border-input bg-background text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition"
                      />

                      <button
                        type="button"
                        disabled={selectedSeats >= maxSeatsForUpdate || booking}
                        onClick={() => setSelectedSeats((prev) => Math.min(maxSeatsForUpdate, prev + 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background font-bold text-foreground hover:bg-muted disabled:opacity-50 transition"
                      >
                        +
                      </button>
                    </div>

                    {selectedSeats > maxSeatsForUpdate && (
                      <p className="animate-pulse text-xs font-medium text-destructive">
                        Maximum {maxSeatsForUpdate} seats available for this transaction.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleUpdate}
                  disabled={selectedSeats === reservation!.tickets_requested || selectedSeats > maxSeatsForUpdate || selectedSeats < 1 || booking}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {booking ? 'Updating…' : 'Update Booking'}
                </button>

                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={cancelling || booking}
                  className="w-full rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel Reservation
                </button>
              </div>
            ) : !isApproved ? (
              <p className="text-center text-sm text-muted-foreground">
                Your account is pending approval.
              </p>
            ) : isSoldOut ? (
              <p className="text-center text-sm font-semibold text-destructive">
                Sold Out
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Number of seats
                  </label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={selectedSeats <= 1 || booking}
                        onClick={() => setSelectedSeats((prev) => Math.max(1, prev - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background font-bold text-foreground hover:bg-muted disabled:opacity-50 transition"
                      >
                        −
                      </button>

                      <input
                        type="number"
                        value={selectedSeats === 0 ? '' : selectedSeats}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        disabled={booking}
                        min={1}
                        max={maxSeats}
                        className="h-10 w-20 rounded-lg border border-input bg-background text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition"
                      />

                      <button
                        type="button"
                        disabled={selectedSeats >= maxSeats || booking}
                        onClick={() => setSelectedSeats((prev) => Math.min(maxSeats, prev + 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background font-bold text-foreground hover:bg-muted disabled:opacity-50 transition"
                      >
                        +
                      </button>
                    </div>

                    {selectedSeats > maxSeats && (
                      <p className="animate-pulse text-xs font-medium text-destructive">
                        Maximum {maxSeats} seats available for this transaction.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleBook}
                  disabled={selectedSeats > maxSeats || selectedSeats < 1 || booking}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {booking
                    ? 'Booking…'
                    : `Book ${selectedSeats} ${selectedSeats === 1 ? 'Seat' : 'Seats'}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => !cancelling && setShowCancelModal(false)}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              Cancel Reservation
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Are you sure you want to cancel your reservation for this event? This action will release your seats back into the public pool and cannot be undone.
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Keep Reservation
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
