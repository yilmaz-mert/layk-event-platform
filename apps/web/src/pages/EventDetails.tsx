import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, MessageSquareQuote, Minus, Plus, Search, Users, X } from 'lucide-react';
import { supabase, formatPrice } from '@layk/core';
import { useAuth } from '@layk/core';
import { useToast } from '@/components/Toast';
import AvatarBubble from '@/components/AvatarBubble';
import { cn } from '@layk/core';
import {
  availabilityToneClass,
  categoryDotStyle,
  formatEventTime,
  formatRelativeDay,
  getAvailability,
} from '@/lib/eventDisplay';

const longDayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const primaryBtn =
  'h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryBtn =
  'h-11 rounded-lg border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted';

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
  price: number;
  location: string | null;
  closing_comment: string | null;
  status: 'active' | 'completed' | 'cancelled';
  event_categories: { name: string; color_code: string } | null;
}

interface UserReservation {
  id: string;
  status: 'confirmed' | 'cancelled';
  tickets_requested: number;
}

interface PublicAttendee {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// ── Attendee stack + modal ──────────────────────────────────────────────────

const ATTENDEE_STACK_LIMIT = 5;

function AttendeeStack({ attendees, onOpen }: { attendees: PublicAttendee[]; onOpen: () => void }) {
  const visible = attendees.slice(0, ATTENDEE_STACK_LIMIT);
  const remainder = attendees.length - visible.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded-xl p-1 text-left transition hover:bg-muted/50"
    >
      <div className="flex -space-x-3 overflow-hidden">
        {visible.map((a) => (
          <AvatarBubble
            key={a.id}
            avatarUrl={a.avatar_url}
            fullName={a.full_name}
            size={40}
            className="ring-2 ring-background transition-transform duration-200 group-hover:-translate-y-0.5"
          />
        ))}
        {remainder > 0 && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-background transition-transform duration-200 group-hover:-translate-y-0.5">
            +{remainder > 99 ? '99+' : remainder}
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-muted-foreground transition group-hover:text-foreground">
        {attendees.length} kişi · Tümünü gör
      </span>
    </button>
  );
}

function AttendeesModal({ attendees, onClose }: { attendees: PublicAttendee[]; onClose: () => void }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const queryLower = query.toLowerCase().trim();
  const filtered = attendees.filter((a) =>
    (a.full_name ?? 'İsimsiz').toLowerCase().includes(queryLower),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 my-4 w-full max-w-md rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Katılımcılar</h2>
            <p className="text-xs text-muted-foreground">{attendees.length} kişi katılıyor</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İsme göre ara…"
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Eşleşen katılımcı bulunamadı.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-muted/50"
                >
                  <AvatarBubble avatarUrl={a.avatar_url} fullName={a.full_name} size={36} />
                  <span className="truncate text-sm text-foreground">{a.full_name ?? 'İsimsiz'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Seat stepper ─────────────────────────────────────────────────────────────

interface SeatStepperProps {
  id: string;
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (updater: (prev: number) => number) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

function SeatStepper({ id, label, value, max, disabled, onChange, onInputChange, onBlur }: SeatStepperProps) {
  const stepBtn =
    'flex h-11 w-11 items-center justify-center rounded-lg border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40';
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Kişi sayısını azalt"
          disabled={value <= 1 || disabled}
          onClick={() => onChange((prev) => Math.max(1, prev - 1))}
          className={stepBtn}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value === 0 ? '' : value}
          onChange={onInputChange}
          onBlur={onBlur}
          disabled={disabled}
          min={1}
          max={max}
          className="h-11 w-16 rounded-lg border border-input bg-background text-center text-base font-semibold tabular-nums text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Kişi sayısını artır"
          disabled={value >= max || disabled}
          onClick={() => onChange((prev) => Math.min(max, prev + 1))}
          className={stepBtn}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <span className="ml-1 text-xs text-muted-foreground">En fazla {max}</span>
      </div>
      {value > max && (
        <p className="text-xs font-medium text-destructive" role="alert">
          Bu işlem için en fazla {max} kişilik yer mevcut.
        </p>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [attendees, setAttendees] = useState<PublicAttendee[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const bookingRef = useRef<HTMLElement>(null);
  const [panelVisible, setPanelVisible] = useState(true);

  // Drives the mobile action bar: shown only while the booking panel is off-screen.
  useEffect(() => {
    const el = bookingRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setPanelVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [loading, error]);

  useEffect(() => {
    if (id) fetchData(id, profile?.id);
  }, [id, profile?.id]);

  // Private attendees are filtered out server-side by the RPC (see 0030).
  useEffect(() => {
    if (!id || !profile?.id) {
      setAttendees([]);
      return;
    }
    let isMounted = true;
    setAttendeesLoading(true);
    supabase
      .rpc('get_public_event_attendees', { p_event_id: id })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (!error) setAttendees((data ?? []) as PublicAttendee[]);
        setAttendeesLoading(false);
      });
    return () => { isMounted = false; };
  }, [id, profile?.id]);

  useEffect(() => {
    if (reservation) setSelectedSeats(reservation.tickets_requested);
  }, [reservation]);

  async function fetchData(eventId: string, userId?: string) {
    setLoading(true);
    setError(null);
    setBannerError(false);

    const [eventRes, reservationRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, description, image_url, event_date, capacity, booked_count, max_tickets_per_user, category, price, location, closing_comment, status, event_categories(name, color_code)',
        )
        .eq('id', eventId)
        .single(),
      userId
        ? supabase
            .from('reservations')
            .select('id, status, tickets_requested')
            .eq('event_id', eventId)
            .eq('user_id', userId)
            .eq('status', 'confirmed')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    ]);

    if (eventRes.error || !eventRes.data) {
      setError('Etkinlik bulunamadı.');
    } else {
      setEvent(eventRes.data as unknown as Event);
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
        msg.includes('fully booked') ? 'Bu etkinlik tamamen dolu.'
          : msg.includes('already booked') ? 'Bu etkinlik için zaten aktif bir rezervasyonunuz var.'
          : msg.includes('exceed') ? 'Kullanıcı başına bilet limitinden fazla rezervasyon yapamazsınız.'
          : rpcError.message,
      );
    } else {
      toast.success(`${selectedSeats} kişilik rezervasyon onaylandı!`);
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
      toast.success(`${selectedSeats} kişilik olarak güncellendi.`);
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
      toast.success('Rezervasyon başarıyla iptal edildi.');
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
  const categoryLabel = event?.event_categories?.name ?? event?.category ?? null;
  const categoryColor = event?.event_categories?.color_code;
  const availability = getAvailability(event?.capacity ?? 0, event?.booked_count ?? 0);
  const relativeDay = event ? formatRelativeDay(event.event_date) : null;

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
          Geri
        </button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <p className="text-sm text-destructive">{error ?? 'Etkinlik bulunamadı.'}</p>
        </div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const canBook = isActive && !isPast;

  function scrollToBooking() {
    bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the panel, not the seat input — that would pop the on-screen keyboard.
    bookingRef.current?.focus({ preventScroll: true });
  }

  // Short status line shared by the panel and the mobile bar.
  const statusLine = !canBook
    ? null
    : isConfirmed
      ? { text: `Rezervasyonunuz var, ${reservation!.tickets_requested} kişi`, cls: 'text-success' }
      : { text: availability.label, cls: availabilityToneClass[availability.tone] };

  return (
    <main className={cn('mx-auto max-w-5xl px-4 pt-2 sm:pt-4 lg:max-w-[70rem]', canBook ? 'pb-28 lg:pb-16' : 'pb-16')}>
      <Link
        to="/"
        onClick={(e) => {
          // Came from the feed → go back so its filters and scroll position survive.
          if ((window.history.state?.idx ?? 0) > 0) {
            e.preventDefault();
            navigate(-1);
          }
        }}
        className="-ml-2 mb-2 inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Etkinliklere dön
      </Link>

      {/* Desktop: poster | everything else. Below lg the wrappers are plain blocks,
          so mobile keeps its single column in the same order. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] lg:items-start lg:gap-x-10">
        {/* Full poster is always visible: contained, never cropped or upscaled. On desktop
            it sits on the page itself (no muted ground) and hugs its own aspect ratio. */}
        {event.image_url && !bannerError ? (
          <div className="mb-5 flex justify-center overflow-hidden rounded-xl bg-muted lg:mb-0 lg:justify-start lg:rounded-none lg:bg-transparent">
            <img
              src={event.image_url}
              alt={event.title}
              onError={() => setBannerError(true)}
              className="max-h-[60vh] w-auto max-w-full object-contain lg:max-h-[min(38rem,calc(100vh-8rem))] lg:rounded-xl"
            />
          </div>
        ) : (
          <div className="mb-5 flex h-40 items-center justify-center rounded-xl bg-muted sm:h-56 lg:mb-0 lg:h-72">
            <CalendarDays className="h-12 w-12 text-muted-foreground/30" aria-hidden />
          </div>
        )}

        <div>
          <header>
            {(categoryLabel || event.status !== 'active') && (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {categoryLabel && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={categoryDotStyle(categoryColor)} aria-hidden />
                    {categoryLabel}
                  </span>
                )}
                {event.status !== 'active' && (
                  <span className={cn('font-medium', event.status === 'cancelled' && 'text-destructive')}>
                    {event.status === 'completed' ? 'Tamamlandı' : 'İptal edildi'}
                  </span>
                )}
              </div>
            )}

            <h1 className="break-words text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              {event.title}
            </h1>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-start gap-2.5">
                <dt className="sr-only">Tarih</dt>
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="text-foreground">
                  <time dateTime={event.event_date}>
                    {longDayFmt.format(new Date(event.event_date))}, {formatEventTime(event.event_date)}
                  </time>
                  {canBook && relativeDay && <span className="text-muted-foreground"> ({relativeDay})</span>}
                </dd>
              </div>
              {event.location && (
                <div className="flex items-start gap-2.5">
                  <dt className="sr-only">Mekan</dt>
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <dd className="break-words text-foreground">{event.location}</dd>
                </div>
              )}
            </dl>
          </header>

          {/* Booking panel — right after the essentials on mobile, sticky sidebar on desktop */}
          <aside
            ref={bookingRef}
            id="booking"
            aria-label="Rezervasyon"
            tabIndex={-1}
            className="mt-6 focus:outline-none"
          >
            <div className="rounded-xl border bg-card p-5 lg:p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-semibold tabular-nums text-foreground">{formatPrice(event.price)}</p>
                {statusLine && <p className={cn('text-sm font-medium', statusLine.cls)}>{statusLine.text}</p>}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    Kontenjan
                  </span>
                  <span className="tabular-nums">{event.booked_count} / {event.capacity}</span>
                </div>
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="meter"
                  aria-label="Doluluk"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fillPct}
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      availability.tone === 'full' ? 'bg-destructive' : availability.tone === 'low' ? 'bg-warning' : 'bg-foreground/70',
                    )}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 border-t pt-5 lg:mt-4 lg:pt-4">
                {!canBook ? (
                  <p className="text-sm text-muted-foreground">
                    {event.status === 'cancelled'
                      ? 'Bu etkinlik iptal edildi.'
                      : 'Bu etkinlik daha önce gerçekleşti.'}
                    {isConfirmed && ` Rezervasyonunuz: ${reservation!.tickets_requested} kişi.`}
                  </p>
                ) : isConfirmed ? (
                  <div className="space-y-3">
                    <SeatStepper
                      id="seats-update"
                      label="Kişi sayısını güncelle"
                      value={selectedSeats}
                      max={maxSeatsForUpdate}
                      disabled={booking}
                      onChange={setSelectedSeats}
                      onInputChange={handleInputChange}
                      onBlur={handleInputBlur}
                    />
                    <button
                      onClick={handleUpdate}
                      disabled={selectedSeats === reservation!.tickets_requested || selectedSeats > maxSeatsForUpdate || selectedSeats < 1 || booking}
                      className={primaryBtn}
                    >
                      {booking ? 'Güncelleniyor…' : 'Rezervasyonu güncelle'}
                    </button>
                    <button
                      onClick={() => setShowCancelModal(true)}
                      disabled={cancelling || booking}
                      className="h-11 w-full rounded-lg border border-destructive/30 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Rezervasyonu iptal et
                    </button>
                  </div>
                ) : !profile ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Rezervasyon yapmak için giriş yapmanız gerekiyor.
                    </p>
                    <Link to="/login" state={{ from: location }} className={cn(primaryBtn, 'flex items-center justify-center')}>
                      Giriş yap
                    </Link>
                  </div>
                ) : !isApproved ? (
                  <p className="text-sm text-muted-foreground">
                    Hesabınız yönetici onayı bekliyor. Onaylandığında rezervasyon yapabilirsiniz.
                  </p>
                ) : isSoldOut ? (
                  <p className="text-sm text-muted-foreground">
                    Yer açılırsa buradan rezervasyon yapabilirsiniz.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <SeatStepper
                      id="seats-book"
                      label="Kişi sayısı"
                      value={selectedSeats}
                      max={maxSeats}
                      disabled={booking}
                      onChange={setSelectedSeats}
                      onInputChange={handleInputChange}
                      onBlur={handleInputBlur}
                    />
                    <button
                      onClick={handleBook}
                      disabled={selectedSeats > maxSeats || selectedSeats < 1 || booking}
                      className={primaryBtn}
                    >
                      {booking ? 'Rezerve ediliyor…' : `${selectedSeats} kişilik rezervasyon yap`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Description, closing note, attendees — continue the right column on desktop */}
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="mb-2 text-base font-semibold text-foreground">Etkinlik hakkında</h2>
              {event.description ? (
                <p className="max-w-prose whitespace-pre-line break-words text-[0.9375rem] leading-relaxed text-foreground/90">
                  {event.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Açıklama girilmemiş.</p>
              )}
            </section>

            {event.status === 'completed' && event.closing_comment && (
              <section className="rounded-xl border bg-card p-4">
                <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-foreground">
                  <MessageSquareQuote className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Kapanış notu
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {event.closing_comment}
                </p>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">Kimler geliyor?</h2>

              {!profile ? (
                <p className="text-sm text-muted-foreground">
                  Katılımcıları görmek için{' '}
                  <Link
                    to="/login"
                    state={{ from: location }}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    giriş yapın
                  </Link>
                  .
                </p>
              ) : attendeesLoading ? (
                <div className="flex -space-x-3" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-10 w-10 animate-pulse rounded-full bg-muted ring-2 ring-background" />
                  ))}
                </div>
              ) : attendees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Henüz herkese açık katılımcı bulunmuyor.
                </p>
              ) : (
                <AttendeeStack attendees={attendees} onOpen={() => setShowAttendeesModal(true)} />
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Mobile action bar — only while the booking panel is off-screen, so it never
          sits over the seat input or the on-screen keyboard. */}
      {canBook && !panelVisible && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold tabular-nums text-foreground">{formatPrice(event.price)}</p>
              {statusLine && <p className={cn('truncate text-xs font-medium', statusLine.cls)}>{statusLine.text}</p>}
            </div>
            {!profile ? (
              <Link to="/login" state={{ from: location }} className={cn(primaryBtn, 'flex w-auto shrink-0 items-center px-5')}>
                Giriş yap
              </Link>
            ) : !isApproved ? (
              <span className="shrink-0 text-sm text-muted-foreground">Onay bekleniyor</span>
            ) : isConfirmed ? (
              <button type="button" onClick={scrollToBooking} className={cn(secondaryBtn, 'shrink-0')}>
                Rezervasyonu yönet
              </button>
            ) : isSoldOut ? (
              <span className="shrink-0 text-sm font-medium text-destructive">Kontenjan doldu</span>
            ) : (
              <button type="button" onClick={scrollToBooking} className={cn(primaryBtn, 'w-auto shrink-0 px-5')}>
                Rezervasyon yap
              </button>
            )}
          </div>
        </div>
      )}

      {showAttendeesModal && (
        <AttendeesModal attendees={attendees} onClose={() => setShowAttendeesModal(false)} />
      )}

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
              Rezervasyonu İptal Et
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Bu etkinlik için rezervasyonunuzu iptal etmek istediğinizden emin misiniz? Bu işlem yerinizi tekrar genel kontenjana açacak ve geri alınamaz.
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Rezervasyonu Koru
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {cancelling ? 'İptal ediliyor…' : 'Evet, İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
