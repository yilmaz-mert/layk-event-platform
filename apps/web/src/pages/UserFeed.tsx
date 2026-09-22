import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, MapPin, Search } from 'lucide-react';
import { supabase, formatPrice } from '@layk/core';
import { useAuth } from '@layk/core';
import { cn } from '@layk/core';
import {
  availabilityToneClass,
  categoryDotStyle,
  formatEventDay,
  formatEventTime,
  getAvailability,
} from '@/lib/eventDisplay';

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
  price: number;
  location: string | null;
  status: 'active' | 'completed' | 'cancelled';
  event_categories: { name: string; color_code: string } | null;
}

const ALL = 'All';

// ── Card image fit policy ────────────────────────────────────────────────────
// Landscape/square photos can carry text or a logo just as easily as a portrait
// poster can — orientation alone doesn't tell us what's safe to crop. So on mobile
// we never crop: always contain, and only use the ratio to pick a box shape that
// keeps the letterboxing (filled with the card's own muted background) reasonable.
function getCardAspect(ratio: number | null): string {
  if (ratio !== null && ratio < 0.9) return 'aspect-[4/5]';
  return 'aspect-[4/3]';
}

const cardImageBox = 'md:aspect-[3/2]';

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border bg-card" aria-hidden>
      <div className={cn('aspect-[4/5] bg-muted', cardImageBox)} />
      <div className="space-y-2.5 p-4">
        <div className="h-3.5 w-28 rounded bg-muted" />
        <div className="h-5 w-3/4 rounded bg-muted" />
        <div className="h-3.5 w-1/2 rounded bg-muted" />
        <div className="flex justify-between pt-3">
          <div className="h-4 w-14 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: Event;
  isBooked: boolean;
  showCategory: boolean;
  isPast?: boolean;
}

function EventCard({ event, isBooked, showCategory, isPast = false }: EventCardProps) {
  const [imgRatio, setImgRatio] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);
  const availability = getAvailability(event.capacity, event.booked_count);
  const categoryLabel = event.event_categories?.name ?? event.category;
  const aspectClass = getCardAspect(imgRatio);

  return (
    <Link
      to={`/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25"
    >
      <div className={cn('relative w-full shrink-0 overflow-hidden bg-muted', aspectClass, cardImageBox)}>
        {event.image_url && !imgError ? (
          <img
            src={event.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={(e) => setImgRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            onError={() => setImgError(true)}
            className={cn('h-full w-full object-contain md:object-cover', isPast && 'grayscale')}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-3 text-sm">
          <time dateTime={event.event_date} className="shrink-0 font-medium text-foreground">
            {formatEventDay(event.event_date)}, {formatEventTime(event.event_date)}
          </time>
          {showCategory && categoryLabel && (
            <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={categoryDotStyle(event.event_categories?.color_code)} />
              <span className="truncate">{categoryLabel}</span>
            </span>
          )}
        </div>

        <h3 className={cn(
          'mt-1.5 line-clamp-2 break-words text-pretty text-base font-semibold leading-snug',
          isPast ? 'text-muted-foreground' : 'text-foreground',
        )}>
          {event.title}
        </h3>

        {event.location && (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
          <span className="font-semibold tabular-nums text-foreground">{formatPrice(event.price)}</span>
          {isPast ? (
            <span className="text-muted-foreground">Tamamlandı</span>
          ) : isBooked ? (
            <span className="flex items-center gap-1 font-medium text-success">
              <Check className="h-4 w-4" aria-hidden />
              Rezervasyonunuz var
            </span>
          ) : (
            <span className={cn('font-medium tabular-nums', availabilityToneClass[availability.tone])}>
              {availability.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Category tabs ─────────────────────────────────────────────────────────────
// Neutral tabs; the DB colour is only a small muted dot. Selection is shown by
// an ink fill, a check icon replacing the dot, and heavier weight — never by
// colour alone. No scale transforms: scaling a bordered, rounded element makes
// the browser resample its edge and text, which is what looked pixelated.

interface CategoryTabsProps {
  categories: string[];
  colors: Map<string, string>;
  selected: string;
  onSelect: (cat: string) => void;
}

function CategoryTabs({ categories, colors, selected, onSelect }: CategoryTabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    refs.current[selected]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [selected]);

  return (
    <div
      role="group"
      aria-label="Kategoriler"
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Edge fade lives inside the padding, so it never covers the first/last tab
        '[mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]',
        'lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:[mask-image:none]',
      )}
    >
      {categories.map((cat) => {
        const isSelected = selected === cat;
        const label = cat === ALL ? 'Tümü' : cat;
        return (
          <button
            key={cat}
            ref={(el) => { refs.current[cat] = el; }}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(cat)}
            className={cn(
              'inline-flex h-10 shrink-0 select-none items-center gap-2 rounded-lg border px-3.5 text-sm transition-colors md:h-9',
              isSelected
                ? 'border-foreground bg-foreground font-semibold text-background'
                : 'border-border bg-background text-foreground/80 hover:bg-muted hover:text-foreground',
            )}
          >
            {isSelected ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : cat !== ALL ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={categoryDotStyle(colors.get(cat))} aria-hidden />
            ) : null}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UserFeed() {
  const { profile } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [myReservations, setMyReservations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filters live in the URL so returning from an event keeps them (and they can be shared).
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('kategori') ?? ALL;
  const searchQuery = searchParams.get('q') ?? '';

  function setFilter(key: 'kategori' | 'q', value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || (key === 'kategori' && value === ALL)) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }

  const eventSelect =
    'id, title, description, image_url, event_date, capacity, booked_count, category, price, location, status, event_categories(name, color_code)';

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [eventsRes, reservationsRes] = await Promise.all([
          supabase
            .from('events')
            .select(eventSelect)
            .in('status', ['active', 'completed'])
            .order('event_date', { ascending: true }),
          profile?.id
            ? supabase.from('reservations').select('event_id').eq('status', 'confirmed')
            : Promise.resolve({ data: [], error: null } as const),
        ]);
        if (!isMounted) return;
        if (eventsRes.error) throw eventsRes.error;
        setEvents((eventsRes.data ?? []) as unknown as Event[]);
        setMyReservations(new Set(reservationsRes.data?.map((r) => r.event_id) ?? []));
      } catch (err: unknown) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Etkinlikler yüklenemedi.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [profile?.id]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, reservationsRes] = await Promise.all([
        supabase
          .from('events')
          .select(eventSelect)
          .in('status', ['active', 'completed'])
          .order('event_date', { ascending: true }),
        profile?.id
          ? supabase.from('reservations').select('event_id').eq('status', 'confirmed')
          : Promise.resolve({ data: [], error: null } as const),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      setEvents((eventsRes.data ?? []) as unknown as Event[]);
      setMyReservations(new Set(reservationsRes.data?.map((r) => r.event_id) ?? []));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Etkinlikler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const { categories, categoryColors } = useMemo(() => {
    const colors = new Map<string, string>();
    const names = new Set<string>();
    for (const e of events) {
      const name = e.event_categories?.name ?? e.category;
      if (!name) continue;
      names.add(name);
      if (e.event_categories?.color_code && !colors.has(name)) colors.set(name, e.event_categories.color_code);
    }
    return { categories: [ALL, ...names], categoryColors: colors };
  }, [events]);

  const now = new Date();
  const searchLower = searchQuery.toLocaleLowerCase('tr-TR').trim();
  const hasCategory = selectedCategory !== ALL;
  const hasFilter = hasCategory || searchLower !== '';

  const filtered = events.filter((e) => {
    const eventCategory = e.event_categories?.name ?? e.category;
    const categoryMatch = !hasCategory || eventCategory === selectedCategory;
    const searchMatch =
      !searchLower ||
      e.title.toLocaleLowerCase('tr-TR').includes(searchLower) ||
      (e.description?.toLocaleLowerCase('tr-TR').includes(searchLower) ?? false);
    return categoryMatch && searchMatch;
  });

  const upcoming = filtered.filter((e) => new Date(e.event_date) > now);
  const past = filtered.filter((e) => new Date(e.event_date) <= now);

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  const query = searchQuery.trim();
  const filterDescription = hasCategory && query
    ? `${selectedCategory} kategorisinde “${query}”`
    : hasCategory
      ? `${selectedCategory} kategorisi`
      : `“${query}” araması`;

  const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:pt-6">
      <h1 className="sr-only">Etkinlikler</h1>

      {!loading && !error && (
        <div className="mb-5 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Etkinlik ara"
              aria-label="Etkinliklerde başlık veya açıklamaya göre ara"
              name="q"
              autoComplete="off"
              enterKeyHint="search"
              className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground sm:text-sm"
            />
          </div>

          {categories.length > 1 && (
            <CategoryTabs
              categories={categories}
              colors={categoryColors}
              selected={selectedCategory}
              onSelect={(cat) => setFilter('kategori', cat)}
            />
          )}
        </div>
      )}

      {loading && (
        <div className={grid} aria-busy="true" aria-label="Etkinlikler yükleniyor">
          {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-sm font-medium text-foreground underline underline-offset-4"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section aria-labelledby="upcoming-heading">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" aria-live="polite">
              <h2 id="upcoming-heading" className="text-lg font-semibold text-foreground">
                Yaklaşan etkinlikler
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{upcoming.length}</span>
              </h2>
              {hasFilter && (
                <p className="flex w-full min-w-0 items-baseline justify-between gap-3 text-sm text-muted-foreground sm:w-auto">
                  <span className="min-w-0 truncate">{filterDescription}</span>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="shrink-0 py-1 font-medium text-foreground underline underline-offset-4"
                  >
                    Filtreleri temizle
                  </button>
                </p>
              )}
            </div>

            {upcoming.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  {hasFilter ? `${filterDescription} için yaklaşan etkinlik yok.` : 'Şu an yaklaşan etkinlik yok.'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasFilter ? 'Başka bir kategori seçin ya da aramayı değiştirin.' : 'Yeni etkinlikler eklendiğinde burada görünecek.'}
                </p>
                {hasFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 h-10 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Tüm etkinlikleri göster
                  </button>
                )}
              </div>
            ) : (
              <div className={grid}>
                {upcoming.map((event) => (
                  <EventCard
                    key={`${event.id}:${event.image_url ?? ''}`}
                    event={event}
                    isBooked={myReservations.has(event.id)}
                    showCategory={!hasCategory}
                  />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-12" aria-labelledby="past-heading">
              <h2 id="past-heading" className="mb-3 text-lg font-semibold text-foreground">
                Geçmiş etkinlikler
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{past.length}</span>
              </h2>
              <div className={grid}>
                {past.map((event) => (
                  <EventCard
                    key={`${event.id}:${event.image_url ?? ''}`}
                    event={event}
                    isBooked={myReservations.has(event.id)}
                    showCategory={!hasCategory}
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
