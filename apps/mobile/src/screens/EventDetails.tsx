import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Tag, Users } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import type { Event, UserReservation } from '../types';
import { colors } from '../colors';

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

interface Props {
  eventId: string;
  onBack: () => void;
}

export default function EventDetails({ eventId, onBack }: Props) {
  const { profile } = useAuthMobile();
  const [event, setEvent] = useState<Event | null>(null);
  const [reservation, setReservation] = useState<UserReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (profile?.id) fetchData(eventId, profile.id);
    return () => { isMounted.current = false; };
  }, [eventId, profile?.id]);

  useEffect(() => {
    if (reservation) setSelectedSeats(reservation.tickets_requested);
  }, [reservation]);

  async function fetchData(evId: string, userId: string) {
    setLoading(true);
    setError(null);

    const [eventRes, reservationRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, description, image_url, event_date, capacity, booked_count, max_tickets_per_user, category, status')
        .eq('id', evId)
        .single(),
      supabase
        .from('reservations')
        .select('id, status, tickets_requested')
        .eq('event_id', evId)
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .maybeSingle(),
    ]);

    if (!isMounted.current) return;

    if (eventRes.error || !eventRes.data) {
      setError('Event not found.');
    } else {
      setEvent(eventRes.data as Event);
      setReservation((reservationRes.data ?? null) as UserReservation | null);

      // Record category interest for notification personalisation
      if (eventRes.data.category && userId) {
        supabase.from('user_interests').upsert(
          { user_id: userId, category: eventRes.data.category, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,category' },
        );
      }
    }
    if (isMounted.current) setLoading(false);
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
      Alert.alert(
        'Booking Failed',
        msg.includes('fully booked') ? 'This event is fully booked.'
          : msg.includes('already booked') ? 'You already have an active booking for this event.'
          : msg.includes('exceed') ? 'You cannot book more than the per-user ticket limit.'
          : rpcError.message,
      );
    } else {
      Alert.alert('Confirmed', `Booking confirmed for ${selectedSeats} ${selectedSeats === 1 ? 'seat' : 'seats'}!`);
      if (profile.id) fetchData(event.id, profile.id);
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
      Alert.alert('Error', updateError.message);
    } else {
      Alert.alert('Updated', `Updated to ${selectedSeats} ${selectedSeats === 1 ? 'seat' : 'seats'}.`);
      fetchData(event.id, profile.id);
    }
    setBooking(false);
  }

  async function handleCancel() {
    if (!profile?.id || !reservation?.id || !event) return;
    setCancelling(true);

    const { error: cancelError } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservation.id);

    if (cancelError) {
      Alert.alert('Error', cancelError.message);
    } else {
      setShowCancelModal(false);
      fetchData(event.id, profile.id);
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
  const maxSeatsForUpdate = isConfirmed && reservation && event
    ? Math.min(event.max_tickets_per_user, Math.max(1, spotsLeft + reservation.tickets_requested))
    : maxSeats;
  const fillPct = event ? Math.min(100, Math.round((event.booked_count / event.capacity) * 100)) : 0;

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Pressable onPress={onBack} className="flex-row items-center gap-1.5 px-4 py-3">
          <ArrowLeft size={18} color={colors.mutedForeground} />
          <Text className="text-sm text-muted-foreground">Back</Text>
        </Pressable>
        <View className="gap-5 px-4 pt-2">
          <View className="h-64 w-full rounded-2xl bg-muted" />
          <View className="h-8 w-2/3 rounded bg-muted" />
          <View className="h-4 w-48 rounded bg-muted" />
          {[100, 90, 75].map((w, i) => (
            <View key={i} className="h-3 rounded bg-muted" style={{ width: `${w}%` }} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Pressable onPress={onBack} className="flex-row items-center gap-1.5 px-4 py-3">
          <ArrowLeft size={18} color={colors.mutedForeground} />
          <Text className="text-sm text-muted-foreground">Back</Text>
        </Pressable>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">{error ?? 'Event not found.'}</Text>
          <Pressable onPress={() => profile?.id && fetchData(eventId, profile.id)} className="mt-4">
            <Text className="text-sm font-medium text-primary">Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canBook = isActive && isApproved && !isSoldOut && !isPast && !isConfirmed;
  const canUpdate = isConfirmed && isActive && !isPast;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back navigation */}
        <Pressable onPress={onBack} className="flex-row items-center gap-1.5 px-4 py-3">
          <ArrowLeft size={18} color={colors.mutedForeground} />
          <Text className="text-sm text-muted-foreground">Events</Text>
        </Pressable>

        {/* Banner */}
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            className="mx-4 h-64 rounded-2xl"
            resizeMode="cover"
          />
        ) : (
          <View className="mx-4 h-64 items-center justify-center rounded-2xl bg-muted">
            <CalendarDays size={56} color={colors.mutedForeground} strokeWidth={1} />
          </View>
        )}

        <View className="gap-4 p-5">
          {/* Status badge + category */}
          <View className="flex-row flex-wrap items-center gap-2">
            {event.status === 'cancelled' && (
              <View className="rounded-full bg-destructive/10 px-3 py-1">
                <Text className="text-xs font-semibold text-destructive">Cancelled</Text>
              </View>
            )}
            {isPast && event.status !== 'cancelled' && (
              <View className="rounded-full bg-muted px-3 py-1">
                <Text className="text-xs font-semibold text-muted-foreground">Completed</Text>
              </View>
            )}
            {event.category && (
              <View className="flex-row items-center gap-1">
                <Tag size={12} color={colors.mutedForeground} />
                <Text className="text-xs text-muted-foreground">{event.category}</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text className="text-2xl font-bold text-foreground">{event.title}</Text>

          {/* Date */}
          <View className="flex-row items-center gap-2">
            <CalendarDays size={15} color={colors.mutedForeground} />
            <Text className="text-sm text-muted-foreground">{formatDate(event.event_date)}</Text>
          </View>

          {/* Capacity */}
          <View className="rounded-xl border border-border bg-card p-4 gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Users size={15} color={colors.mutedForeground} />
                <Text className="text-sm font-medium text-foreground">Capacity</Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {event.booked_count} / {event.capacity}
              </Text>
            </View>
            {/* Progress bar */}
            <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <View
                className={`h-full rounded-full ${fillPct >= 90 ? 'bg-destructive' : fillPct >= 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                style={{ width: `${fillPct}%` }}
              />
            </View>
            {!isPast && (
              isSoldOut ? (
                <Text className="text-sm font-semibold text-destructive">Sold out</Text>
              ) : (
                <Text className="text-sm text-muted-foreground">{spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} remaining</Text>
              )
            )}
          </View>

          {/* Description */}
          {event.description && (
            <View>
              <Text className="mb-2 text-sm font-semibold text-foreground">About this event</Text>
              <Text className="text-sm leading-relaxed text-muted-foreground">{event.description}</Text>
            </View>
          )}

          {/* Booking widget */}
          {!isPast && event.status !== 'cancelled' && isApproved && (
            <View className="rounded-2xl border border-border bg-card p-5 gap-4">
              {isConfirmed && (
                <View className="rounded-xl bg-green-500/10 p-3">
                  <Text className="text-center text-sm font-semibold text-green-600">
                    ✓ You're booked · {reservation?.tickets_requested} {reservation?.tickets_requested === 1 ? 'seat' : 'seats'}
                  </Text>
                </View>
              )}

              {(canBook || canUpdate) && (
                <>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-foreground">Seats</Text>
                    <View className="flex-row items-center gap-3">
                      <Pressable
                        onPress={() => setSelectedSeats((s) => Math.max(1, s - 1))}
                        className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-background"
                      >
                        <Text className="text-lg font-semibold text-foreground">−</Text>
                      </Pressable>
                      <TextInput
                        className="w-12 rounded-lg border border-border bg-background py-1 text-center text-sm font-semibold text-foreground"
                        value={String(selectedSeats)}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n)) setSelectedSeats(n);
                        }}
                        onBlur={() => {
                          const cap = canUpdate ? maxSeatsForUpdate : maxSeats;
                          setSelectedSeats(Math.max(1, Math.min(selectedSeats, cap)));
                        }}
                        keyboardType="numeric"
                        selectTextOnFocus
                      />
                      <Pressable
                        onPress={() => {
                          const cap = canUpdate ? maxSeatsForUpdate : maxSeats;
                          setSelectedSeats((s) => Math.min(cap, s + 1));
                        }}
                        className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-background"
                      >
                        <Text className="text-lg font-semibold text-foreground">+</Text>
                      </Pressable>
                    </View>
                  </View>

                  {canBook && (
                    <Pressable
                      onPress={handleBook}
                      disabled={booking || isSoldOut}
                      className="w-full items-center rounded-xl bg-primary py-3 disabled:opacity-50"
                    >
                      {booking ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : (
                        <Text className="text-sm font-semibold text-primary-foreground">Confirm Booking</Text>
                      )}
                    </Pressable>
                  )}

                  {canUpdate && (
                    <Pressable
                      onPress={handleUpdate}
                      disabled={booking || selectedSeats === reservation?.tickets_requested}
                      className="w-full items-center rounded-xl bg-primary py-3 disabled:opacity-50"
                    >
                      {booking ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : (
                        <Text className="text-sm font-semibold text-primary-foreground">Update Seats</Text>
                      )}
                    </Pressable>
                  )}
                </>
              )}

              {isConfirmed && (
                <Pressable onPress={() => setShowCancelModal(true)} className="items-center py-1">
                  <Text className="text-sm text-destructive underline">Cancel reservation</Text>
                </Pressable>
              )}
            </View>
          )}

          {!isApproved && !isPast && (
            <View className="rounded-xl border border-dashed border-border p-4">
              <Text className="text-center text-sm text-muted-foreground">
                Your account is pending approval. Booking will be available once approved.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Cancel confirmation modal */}
      <Modal visible={showCancelModal} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-foreground/50 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-card p-6 gap-4">
            <Text className="text-lg font-bold text-foreground">Cancel Reservation</Text>
            <Text className="text-sm text-muted-foreground">
              Are you sure you want to cancel your reservation for "{event.title}"?
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowCancelModal(false)}
                className="flex-1 items-center rounded-xl border border-border py-2.5"
              >
                <Text className="text-sm font-medium text-foreground">Keep It</Text>
              </Pressable>
              <Pressable
                onPress={handleCancel}
                disabled={cancelling}
                className="flex-1 items-center rounded-xl bg-destructive py-2.5 disabled:opacity-50"
              >
                {cancelling ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : (
                  <Text className="text-sm font-semibold text-primary-foreground">Yes, Cancel</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
