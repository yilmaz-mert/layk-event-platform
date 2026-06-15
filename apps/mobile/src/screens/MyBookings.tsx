import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Ticket } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import type { BookedEvent } from '../types';
import { useColors } from '../colors';

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

function SkeletonItem() {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-4 gap-3">
      <View className="h-5 w-2/3 rounded bg-muted" />
      <View className="h-3 w-40 rounded bg-muted" />
      <View className="flex-row gap-2">
        <View className="h-8 flex-1 rounded-xl bg-muted" />
        <View className="h-8 flex-1 rounded-xl bg-muted" />
      </View>
    </View>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────

interface BookingCardProps {
  booking: BookedEvent;
  onViewEvent: (eventId: string) => void;
  isPast: boolean;
}

function BookingCard({ booking, onViewEvent, isPast }: BookingCardProps) {
  const c = useColors();
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-border bg-card">
      <View className="p-4">
        <View className="flex-row items-center justify-between gap-3">
          {/* Left: title + cancelled badge + date */}
          <View className="flex-1 gap-2">
            <View className="flex-row items-start gap-2">
              <Pressable onPress={() => onViewEvent(booking.event_id)} className="flex-1">
                <Text className="font-semibold text-foreground leading-snug" numberOfLines={2}>
                  {booking.title}
                </Text>
              </Pressable>
              {booking.status === 'cancelled' && (
                <View className="rounded-full bg-destructive/10 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-destructive">Cancelled</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-1.5">
              <CalendarDays size={13} color={c.mutedForeground} />
              <Text className="text-xs text-muted-foreground">{formatDate(booking.event_date)}</Text>
            </View>
          </View>

          {/* Right: seats ticker badge */}
          <View className="items-center gap-0.5 rounded-xl bg-muted px-3 py-2.5">
            <Ticket size={14} color={c.mutedForeground} />
            <Text className="text-sm font-bold text-foreground">{booking.tickets_requested}</Text>
            <Text className="text-[10px] text-muted-foreground">
              {booking.tickets_requested === 1 ? 'seat' : 'seats'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  onEventPress: (eventId: string) => void;
  onChatPress: (reservationId: string, eventTitle: string) => void;
}

export default function MyBookings({ onEventPress, onChatPress }: Props) {
  const { profile } = useAuthMobile();
  const c = useColors();
  const [bookings, setBookings] = useState<BookedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (profile?.id) fetchData();
    return () => { isMounted.current = false; };
  }, [profile?.id]);

  async function fetchData(isRefresh = false) {
    if (!profile?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('reservations')
      .select(`
        id,
        status,
        tickets_requested,
        created_at,
        event_id,
        events:events (
          id,
          title,
          event_date,
          status
        )
      `)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (!isMounted.current) return;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      const mapped: BookedEvent[] = (data ?? []).map((row: any) => ({
        reservation_id: row.id,
        event_id: row.event_id,
        title: row.events?.title ?? 'Unknown Event',
        event_date: row.events?.event_date ?? '',
        event_status: row.events?.status ?? 'active',
        status: row.status,
        tickets_requested: row.tickets_requested,
        created_at: row.created_at,
      }));
      setBookings(mapped);
    }

    if (isMounted.current) {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ── Section data ──────────────────────────────────────────────────────────

  const now = new Date();

  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.event_date) > now,
  );
  const past = bookings.filter(
    (b) => b.status !== 'confirmed' || new Date(b.event_date) <= now,
  );

  const sections = [
    ...(upcoming.length > 0 ? [{ title: 'Upcoming', data: upcoming }] : []),
    ...(past.length > 0 ? [{ title: 'Past & Cancelled', data: past }] : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="px-5 pt-5 pb-3">
        <Text className="text-2xl font-bold text-foreground">My Bookings</Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">Your event reservations</Text>
      </View>

      {loading && (
        <View className="px-4">
          {[0, 1, 2].map((i) => <SkeletonItem key={i} />)}
        </View>
      )}

      {!loading && error && (
        <View className="mx-4 mt-4 items-center rounded-xl border border-destructive/30 bg-destructive/10 p-6">
          <Text className="text-sm text-destructive text-center">{error}</Text>
          <Pressable onPress={() => fetchData()} className="mt-3">
            <Text className="text-sm font-medium text-primary underline">Try again</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && sections.length === 0 && (
        <View className="flex-1 items-center justify-center px-6">
          <Ticket size={48} color={c.mutedForeground} strokeWidth={1} />
          <Text className="mt-4 text-base font-semibold text-foreground">No bookings yet</Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Browse events and make your first reservation!
          </Text>
        </View>
      )}

      {!loading && !error && sections.length > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.reservation_id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor={c.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View className="mb-2 mt-4">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, section }) => (
            <BookingCard
              booking={item}
              isPast={section.title !== 'Upcoming'}
              onViewEvent={onEventPress}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
