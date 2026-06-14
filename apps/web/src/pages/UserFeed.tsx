import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Search, Tag } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
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
  category: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border bg-card">
      <div className="h-44 bg-muted" />
      <div className="space-y-3 p-4">
        <div className="flex justify-between">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
        <div className="h-5 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-9 w-full rounded-lg bg-muted" />
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: Event;
  isBooked: boolean;
  isApproved: boolean;
  isPast?: boolean;
}

function EventCard({ event, isBooked, isApproved, isPast = false }: EventCardProps) {
  const spotsLeft = event.capacity - event.booked_count;
  const isSoldOut = spotsLeft <= 0;

  return (
    <Link
      to={`/events/${event.id}`}
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
        'transition-shadow hover:shadow-md',
        isPast && 'opacity-65',
      )}
    >
      {event.image_url ? (
        <div className="relative h-44 w-full shrink-0 overflow-hidden bg-muted">
          <img
            src={event.image_url}
            alt={event.title}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
          {isPast && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Completed
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-44 shrink-0 items-center justify-center bg-muted">
          <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
        </div>
      )}

      <div className="flex flex-1 flex-col space-y-3 p-4">
        {/* Category + spots row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {event.category ? (
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Tag className="h-3 w-3" />
              {event.category}
            </span>
          ) : (
            <span />
          )}

          {!isPast && (
            isSoldOut ? (
              <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                Sold Out
              </span>
            ) : (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
              </span>
            )
          )}
        </div>

        <h3 className="font-semibold leading-snug text-foreground">{event.title}</h3>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {formatDate(event.event_date)}
        </div>

        {event.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
        )}

        {/* Status CTA — pinned to bottom; non-interactive, card handles navigation */}
        <div className="mt-auto pt-1">
          {isPast ? null : isBooked ? (
            <div className="rounded-lg bg-green-500/10 px-4 py-2 text-center text-sm font-medium text-green-600 dark:text-green-400">
              ✓ You&apos;re registered
            </div>
          ) : !isApproved ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 px-4 py-2 text-center text-sm text-muted-foreground">
              Pending Approval
            </div>
          ) : isSoldOut ? (
            <div className="rounded-lg bg-muted px-4 py-2 text-center text-sm font-semibold text-muted-foreground">
              Sold Out
            </div>
          ) : (
            <div className="w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
              Book Now →
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UserFeed() {
  const { profile } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [myReservations, setMyReservations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [eventsRes, reservationsRes] = await Promise.all([
          supabase
            .from('events')
            .select('id, title, description, image_url, event_date, capacity, booked_count, category, status')
            .in('status', ['active', 'completed'])
            .order('event_date', { ascending: true }),
          supabase
            .from('reservations')
            .select('event_id')
            .eq('status', 'confirmed'),
        ]);
        if (!isMounted) return;
        if (eventsRes.error) throw eventsRes.error;
        setEvents(eventsRes.data ?? []);
        setMyReservations(new Set(reservationsRes.data?.map((r) => r.event_id) ?? []));
      } catch (err: unknown) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load events.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, reservationsRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, description, image_url, event_date, capacity, booked_count, category, status')
          .in('status', ['active', 'completed'])
          .order('event_date', { ascending: true }),
        supabase
          .from('reservations')
          .select('event_id')
          .eq('status', 'confirmed'),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      setEvents(eventsRes.data ?? []);
      setMyReservations(new Set(reservationsRes.data?.map((r) => r.event_id) ?? []));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const now = new Date();

  const categories = [
    'All',
    ...Array.from(
      new Set(events.map((e) => e.category).filter((c): c is string => Boolean(c))),
    ),
  ];

  // ── Category scroll effects ───────────────────────────────────────────────

  // Recalculate fade visibility whenever the category list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 0);
    setShowRightFade(el.scrollWidth > el.clientWidth + el.scrollLeft);
  }, [categories]);

  // Glide the active category button into the center of the scroll row
  useEffect(() => {
    categoryRefs.current[selectedCategory]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedCategory]);

  // ─────────────────────────────────────────────────────────────────────────

  const searchLower = searchQuery.toLowerCase().trim();

  const filtered = events.filter((e) => {
    const categoryMatch = selectedCategory === 'All' || e.category === selectedCategory;
    const searchMatch =
      !searchLower ||
      e.title.toLowerCase().includes(searchLower) ||
      (e.description?.toLowerCase().includes(searchLower) ?? false);
    return categoryMatch && searchMatch;
  });

  const upcoming = filtered.filter((e) => new Date(e.event_date) > now);
  const past = filtered.filter((e) => new Date(e.event_date) <= now);

  const isApproved = profile?.approval_status === 'approved';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      {/* Search bar */}
      {!loading && !error && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events by title or description…"
            className={
              'w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm ' +
              'text-foreground placeholder:text-muted-foreground focus:outline-none ' +
              'focus:ring-2 focus:ring-ring focus:ring-offset-1 transition'
            }
          />
        </div>
      )}

      {/* Category filter bar */}
      {!loading && !error && categories.length > 1 && (
        <div className="relative -mx-4 mb-6">
          {/* Left edge fade — appears once user scrolls away from start */}
          <div
            className={cn(
              'pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-8 bg-gradient-to-r from-background to-transparent transition-opacity',
              showLeftFade ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* Scrollable row */}
          <div
            ref={scrollRef}
            className="overflow-x-auto px-4 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(e) => {
              const el = e.currentTarget;
              setShowLeftFade(el.scrollLeft > 8);
              setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
            }}
          >
            <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  ref={(el) => { categoryRefs.current[cat] = el; }}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition',
                    selectedCategory === cat
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Right edge fade — indicates more categories off-screen to the right */}
          <div
            className={cn(
              'pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8 bg-gradient-to-l from-background to-transparent transition-opacity',
              showRightFade ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>
      )}

      {/* Skeleton loaders */}
      {loading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-sm text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Upcoming Events
            </h2>
            {upcoming.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? `No upcoming events match "${searchQuery}".`
                  : selectedCategory !== 'All'
                    ? `No upcoming events in "${selectedCategory}".`
                    : 'No upcoming events.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isBooked={myReservations.has(event.id)}
                    isApproved={isApproved}
                  />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Past Events
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {past.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isBooked={myReservations.has(event.id)}
                    isApproved={isApproved}
                    isPast
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
