import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bookmark, CalendarDays, Search, Tag } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import type { Event } from '../types';
import { colors } from '../colors';

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
    <View className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
      <View className="h-44 bg-muted" />
      <View className="gap-3 p-4">
        <View className="flex-row justify-between">
          <View className="h-3 w-16 rounded-full bg-muted" />
          <View className="h-3 w-20 rounded-full bg-muted" />
        </View>
        <View className="h-5 w-3/4 rounded bg-muted" />
        <View className="h-3 w-1/2 rounded bg-muted" />
        <View className="h-9 w-full rounded-xl bg-muted" />
      </View>
    </View>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: Event;
  isBooked: boolean;
  isApproved: boolean;
  isPast?: boolean;
  onPress: () => void;
}

function EventCard({ event, isBooked, isApproved, isPast = false, onPress }: EventCardProps) {
  const spotsLeft = event.capacity - event.booked_count;
  const isSoldOut = spotsLeft <= 0;

  return (
    <Pressable
      onPress={onPress}
      className={`mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${isPast ? 'opacity-65' : ''}`}
    >
      {/* Banner image */}
      {event.image_url ? (
        <View className="relative h-44 w-full overflow-hidden bg-muted">
          <Image
            source={{ uri: event.image_url }}
            className="h-full w-full"
            resizeMode="cover"
          />
          {isPast && (
            <View className="absolute inset-0 items-center justify-center bg-background/60">
              <Text className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Completed
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View className="h-44 items-center justify-center bg-muted">
          <CalendarDays size={40} color={colors.mutedForeground} strokeWidth={1} />
        </View>
      )}

      <View className="gap-3 p-4">
        {/* Category + spots row */}
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          {event.category ? (
            <View className="flex-row items-center gap-1">
              <Tag size={12} color={colors.mutedForeground} />
              <Text className="text-xs font-medium text-muted-foreground">{event.category}</Text>
            </View>
          ) : (
            <View />
          )}

          {!isPast && (
            isSoldOut ? (
              <View className="rounded-full bg-destructive/10 px-2.5 py-0.5">
                <Text className="text-xs font-semibold text-destructive">Sold Out</Text>
              </View>
            ) : (
              <View className="rounded-full bg-primary/10 px-2.5 py-0.5">
                <Text className="text-xs font-semibold text-primary">
                  {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                </Text>
              </View>
            )
          )}
        </View>

        <Text className="font-semibold leading-snug text-foreground" numberOfLines={2}>
          {event.title}
        </Text>

        <View className="flex-row items-center gap-1.5">
          <CalendarDays size={13} color={colors.mutedForeground} />
          <Text className="text-xs text-muted-foreground">{formatDate(event.event_date)}</Text>
        </View>

        {event.description && (
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {event.description}
          </Text>
        )}

        {/* CTA */}
        {!isPast && (
          isBooked ? (
            <View className="rounded-xl bg-green-500/10 px-4 py-2.5">
              <Text className="text-center text-sm font-medium text-green-600">✓ You're registered</Text>
            </View>
          ) : !isApproved ? (
            <View className="rounded-xl border border-dashed border-border px-4 py-2.5">
              <Text className="text-center text-sm text-muted-foreground">Pending Approval</Text>
            </View>
          ) : isSoldOut ? (
            <View className="rounded-xl bg-muted px-4 py-2.5">
              <Text className="text-center text-sm font-semibold text-muted-foreground">Sold Out</Text>
            </View>
          ) : (
            <View className="rounded-xl bg-primary px-4 py-2.5">
              <Text className="text-center text-sm font-semibold text-primary-foreground">Book Now →</Text>
            </View>
          )
        )}
      </View>
    </Pressable>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

interface Props {
  onEventPress: (eventId: string) => void;
}

export default function UserFeed({ onEventPress }: Props) {
  const { profile } = useAuthMobile();
  const [events, setEvents] = useState<Event[]>([]);
  const [myReservations, setMyReservations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, []);

  async function fetchData(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const [eventsRes, reservationsRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, description, image_url, event_date, capacity, booked_count, max_tickets_per_user, category, status')
          .in('status', ['active', 'completed'])
          .order('event_date', { ascending: true }),
        supabase
          .from('reservations')
          .select('event_id')
          .eq('status', 'confirmed'),
      ]);

      if (!isMounted.current) return;
      if (eventsRes.error) throw eventsRes.error;

      setEvents((eventsRes.data ?? []) as Event[]);
      setMyReservations(new Set((reservationsRes.data ?? []).map((r) => r.event_id)));
    } catch (err: unknown) {
      if (isMounted.current) setError(err instanceof Error ? err.message : 'Failed to load events.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const now = new Date();
  const categories = ['All', ...Array.from(new Set(events.map((e) => e.category).filter((c): c is string => !!c)))];
  const searchLower = searchQuery.toLowerCase().trim();

  const filtered = events.filter((e) => {
    const catMatch = selectedCategory === 'All' || e.category === selectedCategory;
    const searchMatch = !searchLower || e.title.toLowerCase().includes(searchLower) || (e.description?.toLowerCase().includes(searchLower) ?? false);
    return catMatch && searchMatch;
  });

  const upcoming = filtered.filter((e) => new Date(e.event_date) > now);
  const past = filtered.filter((e) => new Date(e.event_date) <= now);
  const isApproved = profile?.approval_status === 'approved';

  const flatData: Array<Event & { _type: 'upcoming' | 'past' }> = [
    ...upcoming.map((e) => ({ ...e, _type: 'upcoming' as const })),
    ...past.map((e) => ({ ...e, _type: 'past' as const })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Search bar */}
      <View className="mx-4 mt-4 mb-2">
        <View className="flex-row items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 py-1.5">
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            className="flex-1 text-sm text-foreground"
            placeholder="Search events…"
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Category pills */}
      {categories.length > 1 && (
        <View className="py-1 mb-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
          >
            {categories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                className={`rounded-full border px-4 py-1.5 ${
                  selectedCategory === cat
                    ? 'border-primary bg-primary'
                    : 'border-border bg-card'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    selectedCategory === cat ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Loading skeletons */}
      {loading && (
        <View className="px-4 pt-2">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </View>
      )}

      {/* Error state */}
      {!loading && error && (
        <View className="mx-4 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6 items-center">
          <Text className="text-sm text-destructive text-center">{error}</Text>
          <Pressable onPress={() => fetchData()} className="mt-3">
            <Text className="text-sm font-medium text-primary underline">Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Event list */}
      {!loading && !error && (
        <FlatList
          data={flatData}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pt-2 pb-6"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={upcoming.length > 0 ? (
            <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Upcoming Events
            </Text>
          ) : null}
          renderItem={({ item, index }) => {
            const isPast = item._type === 'past';
            const isFirstPast = isPast && (index === 0 || flatData[index - 1]._type === 'upcoming');
            return (
              <>
                {isFirstPast && (
                  <Text className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Past Events
                  </Text>
                )}
                <EventCard
                  event={item}
                  isBooked={myReservations.has(item.id)}
                  isApproved={isApproved ?? false}
                  isPast={isPast}
                  onPress={() => onEventPress(item.id)}
                />
              </>
            );
          }}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Bookmark size={40} color={colors.mutedForeground} strokeWidth={1} />
              <Text className="mt-3 text-sm font-medium text-foreground">No events found</Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                {searchQuery ? `No results for "${searchQuery}"` : 'Check back soon'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
