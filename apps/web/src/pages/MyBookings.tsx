import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, CalendarDays, ChevronRight, Users } from 'lucide-react';
import { supabase } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import { cn } from '@layk/core';
import { formatEventDay, formatEventTime, formatRelativeDay } from '@/lib/eventDisplay';

// ── Types ────────────────────────────────────────────────────────────────────

interface BookedEvent {
  id: string;
  title: string;
  image_url: string | null;
  category: string | null;
  event_date: string;
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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex animate-pulse gap-4 rounded-xl border bg-card p-3" aria-hidden>
      <div className="h-20 w-16 shrink-0 rounded-lg bg-muted" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="h-3.5 w-28 rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
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
  const [imgError, setImgError] = useState(false);
  const event = reservation.events;
  if (!event) return null;

  const relativeDay = isPast ? null : formatRelativeDay(event.event_date);
  const isCancelled = event.status === 'cancelled';
  const seats = reservation.tickets_requested;

  return (
    // The whole row opens EventDetails, where seats can be changed or the booking cancelled.
    <Link
      to={`/events/${event.id}`}
      className="group flex items-center gap-4 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/25"
    >
      {event.image_url && !imgError ? (
        <img
          src={event.image_url}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
          className={cn('h-20 w-16 shrink-0 rounded-lg bg-muted object-cover', isPast && 'grayscale')}
        />
      ) : (
        <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
          <CalendarDays className="h-5 w-5 text-muted-foreground/60" aria-hidden />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <time dateTime={event.event_date} className={cn('font-medium', isPast ? 'text-muted-foreground' : 'text-foreground')}>
            {formatEventDay(event.event_date)}, {formatEventTime(event.event_date)}
          </time>
          {relativeDay && <span className="text-muted-foreground"> ({relativeDay})</span>}
        </p>
        <h3 className={cn(
          'mt-0.5 line-clamp-2 break-words font-semibold leading-snug',
          isPast ? 'text-muted-foreground' : 'text-foreground',
        )}>
          {event.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {seats} kişi
          </span>
          {isCancelled ? (
            <span className="font-medium text-destructive">Etkinlik iptal edildi</span>
          ) : isPast ? (
            <span>Tamamlandı</span>
          ) : (
            <span className="font-medium text-success">Onaylandı</span>
          )}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyBookings() {
  const { toast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Mount-only load. The query has no user filter on purpose: RLS
  // ("reservations: users view own") limits rows to the signed-in user.
  useEffect(() => {
    let ignore = false; // the page can unmount before the request resolves
    supabase
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
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) toast.error('Rezervasyonlarınız yüklenemedi.');
        else setReservations((data ?? []) as unknown as Reservation[]);
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [toast]);

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
      <h1 className="mb-5 text-2xl font-semibold text-foreground">Rezervasyonlarım</h1>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!loading && reservations.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Bookmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Henüz rezervasyonunuz yok</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rezerve ettiğiniz etkinlikler burada görünecek.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Etkinlikleri keşfet
          </Link>
        </div>
      )}

      {!loading && reservations.length > 0 && (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">
                Yaklaşan
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{upcoming.length}</span>
              </h2>
              <div className="space-y-3">
                {upcoming.map((r) => (
                  <BookingCard
                    key={`${r.id}:${r.events?.image_url ?? ''}`}
                    reservation={r}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className={cn(upcoming.length > 0 && 'mt-8')}>
              <h2 className="mb-3 text-base font-semibold text-foreground">
                Geçmiş
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{past.length}</span>
              </h2>
              <div className="space-y-3">
                {past.map((r) => (
                  <BookingCard key={`${r.id}:${r.events?.image_url ?? ''}`} reservation={r} isPast />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
