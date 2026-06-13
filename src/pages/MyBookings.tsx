import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, CalendarDays, Tag } from 'lucide-react';
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
  max_tickets_per_user: number;
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

// ── Booking card ──────────────────────────────────────────────────────────────

interface BookingCardProps {
  reservation: Reservation;
  isPast?: boolean;
}

function BookingCard({
  reservation,
  isPast = false,
}: BookingCardProps) {
  const event = reservation.events;
  if (!event) return null;

  return (
    <div className={cn('rounded-xl border bg-card', isPast && 'opacity-60')}>
      {/* Navigable area — clicking goes to EventDetails for seat management */}
      <Link
        to={`/events/${event.id}`}
        className="flex gap-3 p-4 transition hover:bg-muted/40"
      >
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

          {isPast && (
            <span className="self-start rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {reservation.tickets_requested > 1
                ? `${reservation.tickets_requested} tickets`
                : 'Completed'}
            </span>
          )}
        </div>
      </Link>

    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyBookings() {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

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
          capacity,
          max_tickets_per_user
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
  );
}
