import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Tag, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    if (id && profile?.id) fetchData(id, profile.id);
  }, [id, profile?.id]);

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
            : rpcError.message,
      );
    } else {
      toast.success(`Booking confirmed for ${selectedSeats} ${selectedSeats === 1 ? 'seat' : 'seats'}!`);
      await fetchData(event.id, profile.id);
    }
    setBooking(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const spotsLeft = event ? event.capacity - event.booked_count : 0;
  const isSoldOut = spotsLeft <= 0;
  const isPast = event ? new Date(event.event_date) <= new Date() : false;
  const isActive = event?.status === 'active';
  const isApproved = profile?.approval_status === 'approved';
  const isConfirmed = reservation?.status === 'confirmed';
  const maxSeats = Math.min(event?.max_tickets_per_user ?? 5, Math.max(1, spotsLeft));
  const fillPct = event ? Math.min(100, Math.round((event.booked_count / event.capacity) * 100)) : 0;

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
              <div className="space-y-3 text-center">
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                  ✓ You&apos;re registered
                </p>
                <p className="text-xs text-muted-foreground">
                  {reservation!.tickets_requested}{' '}
                  {reservation!.tickets_requested === 1 ? 'ticket' : 'tickets'} booked
                </p>
                <Link
                  to="/my-bookings"
                  className="block w-full rounded-lg border px-4 py-2 text-center text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Manage booking
                </Link>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedSeats((s) => Math.max(1, s - 1))}
                      disabled={selectedSeats <= 1}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-lg text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="flex-1 text-center text-sm font-semibold">{selectedSeats}</span>
                    <button
                      onClick={() => setSelectedSeats((s) => Math.min(maxSeats, s + 1))}
                      disabled={selectedSeats >= maxSeats}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-lg text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-right text-xs text-muted-foreground">max {maxSeats}</p>
                </div>

                <button
                  onClick={handleBook}
                  disabled={booking}
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
    </main>
  );
}
