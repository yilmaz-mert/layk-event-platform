import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Send,
  Sun,
  Upload,
  Users,
  X,
  XCircle,
  type LucideProps,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase-mobile';
import { useColors } from '../colors';
import TicketChat from './TicketChat';

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type AdminPortalTab = 'users' | 'events' | 'broadcast' | 'support';
type TicketStatusFilter = 'open' | 'resolved' | 'all';
type BroadcastTarget = 'all' | 'specific_user' | 'event_attendees';
type EventStatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string;
  phone_number: string | null;
  role: 'admin' | 'user';
  approval_status: ApprovalStatus;
  created_at: string;
}

interface AdminEvent {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  event_date: string;
  capacity: number;
  max_tickets_per_user: number;
  booked_count: number;
  category: string | null;
  status: 'active' | 'cancelled' | 'completed';
}

interface AdminTicket {
  id: string;
  subject: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  user_name: string | null;
  user_email: string;
}

interface AdminUserBooking {
  reservation_id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  tickets_requested: number;
  status: 'confirmed' | 'cancelled';
  created_at: string;
}

interface AdminEventAttendee {
  reservation_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  tickets_requested: number;
  status: 'confirmed' | 'cancelled';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}
function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseEventDate(input: string): string | null {
  const normalized = input.trim().replace(' ', 'T');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-4 gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-2">
          <View className="h-4 w-2/3 rounded bg-muted" />
          <View className="h-3 w-1/2 rounded bg-muted" />
        </View>
        <View className="h-5 w-16 rounded-full bg-muted" />
      </View>
      {!compact && (
        <View className="flex-row gap-2">
          <View className="h-9 flex-1 rounded-xl bg-muted" />
          <View className="h-9 flex-1 rounded-xl bg-muted" />
        </View>
      )}
    </View>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  if (status === 'approved') {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5">
        <CheckCircle2 size={10} color="#16a34a" />
        <Text className="text-xs font-semibold text-green-600">Approved</Text>
      </View>
    );
  }
  if (status === 'rejected') {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5">
        <XCircle size={10} color="#e44848" />
        <Text className="text-xs font-semibold text-destructive">Rejected</Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-0.5">
      <Clock size={10} color="#ca8a04" />
      <Text className="text-xs font-semibold text-yellow-600">Pending</Text>
    </View>
  );
}

// ── Pill tab bar ──────────────────────────────────────────────────────────────

type TabIcon = React.ComponentType<LucideProps & { size?: number; color?: string; strokeWidth?: number }>;

const PORTAL_TABS: { id: AdminPortalTab; label: string; Icon: TabIcon }[] = [
  { id: 'users',     label: 'Users',     Icon: Users },
  { id: 'events',    label: 'Events',    Icon: Calendar },
  { id: 'broadcast', label: 'Broadcast', Icon: Megaphone },
  { id: 'support',   label: 'Support',   Icon: LifeBuoy },
];

function AdminTabBar({
  active,
  onPress,
  openTicketCount,
  pendingUserCount,
}: {
  active: AdminPortalTab;
  onPress: (t: AdminPortalTab) => void;
  openTicketCount: number;
  pendingUserCount: number;
}) {
  const c = useColors();

  return (
    <View className="w-full flex-row px-2 border-b border-border bg-background">
      {PORTAL_TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        const badge = id === 'support' ? openTicketCount : id === 'users' ? pendingUserCount : 0;
        return (
          <Pressable
            key={id}
            onPress={() => onPress(id)}
            className="relative flex-1 items-center justify-center py-3"
          >
            <View className="items-center gap-1">
              <Icon
                size={18}
                color={isActive ? c.primary : c.mutedForeground}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              <Text
                className={`text-[11px] font-medium tracking-wide capitalize ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {label}
              </Text>
            </View>

            {badge > 0 && (
              <View className="absolute right-2 top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-0.5">
                <Text className="text-[9px] font-bold text-primary-foreground">
                  {badge > 99 ? '99+' : String(badge)}
                </Text>
              </View>
            )}

            {isActive && (
              <View className="absolute bottom-0 left-1 right-1 h-[3px] rounded-t-full bg-primary" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── User Card (read-only, pressable) ──────────────────────────────────────────

function UserCard({
  user,
  onPress,
}: {
  user: AdminUser;
  onPress: () => void;
}) {
  const initials = getInitials(user.full_name, user.email);
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 rounded-2xl border border-border bg-card p-4 active:opacity-75"
    >
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-sm font-bold text-primary">{initials}</Text>
        </View>
        <View className="flex-1 min-w-0 gap-0.5">
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Text className="font-semibold text-foreground" numberOfLines={1}>
              {user.full_name ?? <Text className="italic text-muted-foreground/50">No name</Text>}
            </Text>
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-[11px] font-medium text-muted-foreground capitalize">{user.role}</Text>
            </View>
          </View>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>{user.email}</Text>
          {user.phone_number ? (
            <Text className="text-xs text-muted-foreground">{user.phone_number}</Text>
          ) : null}
          <Text className="text-xs text-muted-foreground mt-0.5">
            Joined {formatDate(user.created_at)}
          </Text>
        </View>
        <View className="items-end">
          <ApprovalBadge status={user.approval_status} />
        </View>
      </View>
    </Pressable>
  );
}

// ── User Details CRM Modal ────────────────────────────────────────────────────

function UserDetailsModal({
  user,
  refreshKey,
  updatingId,
  updatingRoleId,
  onClose,
  onRoleChange,
  onStatusChange,
  onAssignReservation,
}: {
  user: AdminUser;
  refreshKey: number;
  updatingId: string | null;
  updatingRoleId: string | null;
  onClose: () => void;
  onRoleChange: (userId: string, role: 'admin' | 'user') => void;
  onStatusChange: (userId: string, status: ApprovalStatus) => void;
  onAssignReservation: () => void;
}) {
  const c = useColors();
  const initials = getInitials(user.full_name, user.email);
  const [bookings, setBookings] = useState<AdminUserBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const roleBusy = updatingRoleId === user.id;
  const statusBusy = updatingId === user.id;

  useEffect(() => {
    void fetchBookings();
  }, [user.id, refreshKey]);

  async function fetchBookings() {
    setLoadingBookings(true);
    const { data } = await supabase
      .from('reservations')
      .select('id, status, tickets_requested, created_at, event_id, events:events(title, event_date)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const mapped: AdminUserBooking[] = (data ?? []).map((row: any) => ({
      reservation_id: row.id,
      event_id: row.event_id,
      event_title: row.events?.title ?? 'Unknown Event',
      event_date: row.events?.event_date ?? '',
      tickets_requested: row.tickets_requested ?? 1,
      status: row.status,
      created_at: row.created_at,
    }));
    setBookings(mapped);
    setLoadingBookings(false);
  }

  function handleCancelBooking(reservationId: string) {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this reservation?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: async () => {
          setCancellingId(reservationId);
          const { error } = await supabase
            .from('reservations')
            .update({ status: 'cancelled' })
            .eq('id', reservationId);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            setBookings((prev) =>
              prev.map((b) =>
                b.reservation_id === reservationId ? { ...b, status: 'cancelled' } : b,
              ),
            );
          }
          setCancellingId(null);
        },
      },
    ]);
  }

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%', maxHeight: '92%' }}
        >
          <View
            className="rounded-t-3xl border-t border-border bg-card w-full"
            style={{ maxHeight: '100%' }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-base font-semibold text-foreground">User Details</Text>
              <Pressable onPress={onClose} className="rounded-xl p-2 active:bg-muted">
                <X size={18} color={c.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 80, gap: 20 }}
            >
              {/* Profile card */}
              <View className="rounded-2xl border border-border bg-background p-4 gap-4">
                {/* Avatar + identity */}
                <View className="flex-row items-center gap-3">
                  <View className="h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Text className="text-lg font-bold text-primary">{initials}</Text>
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-base font-bold text-foreground">
                      {user.full_name ?? 'No name set'}
                    </Text>
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>{user.email}</Text>
                  </View>
                  <ApprovalBadge status={user.approval_status} />
                </View>

                {/* Detail rows */}
                <View className="gap-2">
                  {user.phone_number ? (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-medium text-muted-foreground">Phone</Text>
                      <Text className="text-xs text-foreground">{user.phone_number}</Text>
                    </View>
                  ) : null}
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-medium text-muted-foreground">Joined</Text>
                    <Text className="text-xs text-foreground">{formatDate(user.created_at)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-medium text-muted-foreground">Status</Text>
                    <Text className="text-xs text-foreground capitalize">{user.approval_status}</Text>
                  </View>

                  {/* Role row */}
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-xs font-medium text-muted-foreground">Role</Text>
                    <View className="flex-row items-center gap-2">
                      <View className="rounded-full bg-muted px-2 py-0.5">
                        <Text className="text-xs font-semibold text-muted-foreground capitalize">{user.role}</Text>
                      </View>
                      {user.role === 'user' ? (
                        <Pressable
                          onPress={() =>
                            Alert.alert(
                              'Grant Admin Privileges',
                              `Make ${user.full_name ?? user.email} an admin? They will gain full access to the admin portal.`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Make Admin',
                                  onPress: () => onRoleChange(user.id, 'admin'),
                                },
                              ],
                            )
                          }
                          disabled={roleBusy}
                          className="rounded-lg bg-primary px-3 py-1.5 active:opacity-80 disabled:opacity-50"
                        >
                          {roleBusy ? (
                            <ActivityIndicator size="small" color={c.primaryForeground} />
                          ) : (
                            <Text className="text-xs font-bold text-primary-foreground">Make Admin</Text>
                          )}
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() =>
                            Alert.alert(
                              'Remove Admin Privileges',
                              `Remove admin access from ${user.full_name ?? user.email}?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Remove',
                                  style: 'destructive',
                                  onPress: () => onRoleChange(user.id, 'user'),
                                },
                              ],
                            )
                          }
                          disabled={roleBusy}
                          className="rounded-lg bg-destructive/10 px-3 py-1.5 active:opacity-80 disabled:opacity-50"
                        >
                          {roleBusy ? (
                            <ActivityIndicator size="small" color="#e44848" />
                          ) : (
                            <Text className="text-xs font-bold text-destructive">Remove Admin</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>

                {/* Approval actions */}
                <View className="border-t border-border pt-3 flex-row gap-2">
                  {user.approval_status === 'pending' && (
                    <>
                      <Pressable
                        onPress={() => onStatusChange(user.id, 'approved')}
                        disabled={statusBusy}
                        className="flex-1 items-center rounded-xl bg-green-500/10 py-2.5 disabled:opacity-50 active:opacity-70"
                      >
                        {statusBusy ? (
                          <ActivityIndicator size="small" color="#16a34a" />
                        ) : (
                          <Text className="text-xs font-semibold text-green-600">Approve</Text>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => onStatusChange(user.id, 'rejected')}
                        disabled={statusBusy}
                        className="flex-1 items-center rounded-xl bg-destructive/10 py-2.5 disabled:opacity-50 active:opacity-70"
                      >
                        <Text className="text-xs font-semibold text-destructive">Reject</Text>
                      </Pressable>
                    </>
                  )}
                  {user.approval_status === 'approved' && (
                    <Pressable
                      onPress={() => onStatusChange(user.id, 'rejected')}
                      disabled={statusBusy}
                      className="flex-1 items-center rounded-xl bg-destructive/10 py-2.5 disabled:opacity-50 active:opacity-70"
                    >
                      {statusBusy ? (
                        <ActivityIndicator size="small" color="#e44848" />
                      ) : (
                        <Text className="text-xs font-semibold text-destructive">Revoke Approval</Text>
                      )}
                    </Pressable>
                  )}
                  {user.approval_status === 'rejected' && (
                    <Pressable
                      onPress={() => onStatusChange(user.id, 'approved')}
                      disabled={statusBusy}
                      className="flex-1 items-center rounded-xl bg-green-500/10 py-2.5 disabled:opacity-50 active:opacity-70"
                    >
                      {statusBusy ? (
                        <ActivityIndicator size="small" color="#16a34a" />
                      ) : (
                        <Text className="text-xs font-semibold text-green-600">Re-Approve</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Booking history */}
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Booking History
                  </Text>
                  <Pressable
                    onPress={onAssignReservation}
                    className="flex-row items-center gap-1.5 rounded-xl bg-primary px-3 py-2 active:opacity-80"
                  >
                    <Plus size={12} color={c.primaryForeground} />
                    <Text className="text-xs font-semibold text-primary-foreground">Assign Reservation</Text>
                  </Pressable>
                </View>

                {loadingBookings ? (
                  <View className="items-center py-8">
                    <ActivityIndicator color={c.primary} />
                  </View>
                ) : bookings.length === 0 ? (
                  <View className="items-center rounded-2xl border border-border bg-background py-8 gap-2">
                    <CalendarDays size={28} color={c.mutedForeground} strokeWidth={1} />
                    <Text className="text-sm text-muted-foreground">No bookings yet</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {bookings.map((booking) => (
                      <View
                        key={booking.reservation_id}
                        className="rounded-2xl border border-border bg-background p-4 gap-2"
                      >
                        <View className="flex-row items-start justify-between gap-2">
                          <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={2}>
                            {booking.event_title}
                          </Text>
                          <View
                            className={`rounded-full px-2 py-0.5 ${
                              booking.status === 'confirmed' ? 'bg-green-500/10' : 'bg-destructive/10'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-semibold ${
                                booking.status === 'confirmed' ? 'text-green-600' : 'text-destructive'
                              }`}
                            >
                              {booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                            </Text>
                          </View>
                        </View>
                        {booking.event_date ? (
                          <View className="flex-row items-center gap-1.5">
                            <CalendarDays size={11} color={c.mutedForeground} />
                            <Text className="text-xs text-muted-foreground">
                              {formatDateTime(booking.event_date)}
                            </Text>
                          </View>
                        ) : null}
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs text-muted-foreground">
                            {booking.tickets_requested} ticket{booking.tickets_requested !== 1 ? 's' : ''}
                          </Text>
                          {booking.status === 'confirmed' && (
                            <Pressable
                              onPress={() => handleCancelBooking(booking.reservation_id)}
                              disabled={cancellingId === booking.reservation_id}
                              className="rounded-lg bg-destructive/10 px-2.5 py-1 disabled:opacity-50 active:opacity-70"
                            >
                              {cancellingId === booking.reservation_id ? (
                                <ActivityIndicator size="small" color="#e44848" />
                              ) : (
                                <Text className="text-[11px] font-semibold text-destructive">Cancel</Text>
                              )}
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Assign Reservation Modal ──────────────────────────────────────────────────

function AssignReservationModal({
  user,
  events,
  onClose,
  onAssigned,
}: {
  user: AdminUser;
  events: AdminEvent[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const c = useColors();
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null);
  const [ticketCount, setTicketCount] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const activeEvents = events.filter((e) => e.status === 'active');
  const filtered = search.trim()
    ? activeEvents.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()))
    : activeEvents;

  async function handleAssign() {
    if (!selectedEvent) {
      Alert.alert('Required', 'Please select an event.');
      return;
    }
    const count = parseInt(ticketCount, 10);
    if (isNaN(count) || count < 1) {
      Alert.alert('Invalid', 'Ticket count must be at least 1.');
      return;
    }
    Alert.alert(
      'Confirm Assignment',
      `Assign ${count} ticket${count !== 1 ? 's' : ''} for "${selectedEvent.title}" to ${user.full_name ?? user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign',
          onPress: async () => {
            setSubmitting(true);
            const { error } = await supabase.from('reservations').insert({
              user_id: user.id,
              event_id: selectedEvent.id,
              tickets_requested: count,
              status: 'confirmed',
            });
            setSubmitting(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Success', 'Reservation assigned successfully.');
              onAssigned();
            }
          },
        },
      ],
    );
  }

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%' }}
        >
          <View className="rounded-t-3xl border-t border-border bg-card w-full">
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-base font-semibold text-foreground">Assign Reservation</Text>
              <Pressable onPress={onClose} className="rounded-xl p-2 active:bg-muted">
                <X size={18} color={c.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80, gap: 16 }}
            >
              <Text className="text-xs text-muted-foreground">
                Assigning to:{' '}
                <Text className="font-semibold text-foreground">{user.full_name ?? user.email}</Text>
              </Text>

              {/* Event picker */}
              <View className="gap-2">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Event
                </Text>
                {selectedEvent ? (
                  <Pressable
                    onPress={() => setSelectedEvent(null)}
                    className="flex-row items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5 active:opacity-80"
                  >
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">{selectedEvent.title}</Text>
                      <Text className="text-xs text-muted-foreground">{formatDate(selectedEvent.event_date)}</Text>
                    </View>
                    <Text className="text-xs text-primary font-medium">Change ×</Text>
                  </Pressable>
                ) : (
                  <View className="rounded-2xl border border-border bg-background overflow-hidden">
                    <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
                      <Search size={14} color={c.mutedForeground} />
                      <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search active events…"
                        placeholderTextColor={c.mutedForeground}
                        className="flex-1 text-sm text-foreground"
                      />
                    </View>
                    {filtered.length === 0 ? (
                      <View className="items-center py-6">
                        <Text className="text-sm text-muted-foreground">No active events</Text>
                      </View>
                    ) : (
                      filtered.slice(0, 8).map((event, i) => (
                        <Pressable
                          key={event.id}
                          onPress={() => setSelectedEvent(event)}
                          className={`px-4 py-3 active:bg-muted ${
                            i < Math.min(filtered.length, 8) - 1 ? 'border-b border-border/50' : ''
                          }`}
                        >
                          <Text className="text-sm font-medium text-foreground">{event.title}</Text>
                          <Text className="text-xs text-muted-foreground">{formatDate(event.event_date)}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </View>

              {/* Ticket count */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Number of Tickets
                </Text>
                <TextInput
                  value={ticketCount}
                  onChangeText={setTicketCount}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={c.mutedForeground}
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                />
              </View>

              <Pressable
                onPress={handleAssign}
                disabled={submitting || !selectedEvent}
                className="items-center rounded-xl bg-primary py-3.5 active:opacity-80 disabled:opacity-50"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={c.primaryForeground} />
                ) : (
                  <Text className="text-sm font-bold text-primary-foreground">Assign Reservation</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({
  users,
  events,
  loading,
  refreshing,
  updatingId,
  updatingRoleId,
  pendingCount,
  onRefresh,
  onStatusChange,
  onRoleChange,
  searchQuery,
  onSearchChange,
}: {
  users: AdminUser[];
  events: AdminEvent[];
  loading: boolean;
  refreshing: boolean;
  updatingId: string | null;
  updatingRoleId: string | null;
  pendingCount: number;
  onRefresh: () => void;
  onStatusChange: (id: string, status: ApprovalStatus) => void;
  onRoleChange: (id: string, role: 'admin' | 'user') => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
}) {
  const c = useColors();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [bookingKey, setBookingKey] = useState(0);

  const selectedUser = selectedUserId ? (users.find((u) => u.id === selectedUserId) ?? null) : null;

  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = searchLower
    ? users.filter(
        (u) =>
          (u.full_name?.toLowerCase().includes(searchLower) ?? false) ||
          u.email.toLowerCase().includes(searchLower),
      )
    : users;

  return (
    <>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListHeaderComponent={
          <View>
            <View className="flex-row items-center gap-2 mb-4 mt-2 rounded-xl border border-input bg-card px-3 py-2">
              <Search size={15} color={c.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Search by name or email…"
                placeholderTextColor={c.mutedForeground}
                className="flex-1 text-sm text-foreground"
              />
            </View>
            {!loading && (
              <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {searchQuery
                  ? `${filtered.length} of ${users.length} members`
                  : `${users.length} members${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View>{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}</View>
          ) : (
            <View className="items-center py-12">
              <Users size={36} color={c.mutedForeground} strokeWidth={1} />
              <Text className="mt-3 text-sm font-medium text-foreground">
                {searchQuery ? `No users match "${searchQuery}"` : 'No users found'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <UserCard
            user={item}
            onPress={() => setSelectedUserId(item.id)}
          />
        )}
      />

      {selectedUser && (
        <UserDetailsModal
          key={`${selectedUserId}-${bookingKey}`}
          user={selectedUser}
          refreshKey={bookingKey}
          updatingId={updatingId}
          updatingRoleId={updatingRoleId}
          onClose={() => { setSelectedUserId(null); setShowAssign(false); }}
          onRoleChange={onRoleChange}
          onStatusChange={onStatusChange}
          onAssignReservation={() => setShowAssign(true)}
        />
      )}

      {selectedUser && showAssign && (
        <AssignReservationModal
          user={selectedUser}
          events={events}
          onClose={() => setShowAssign(false)}
          onAssigned={() => {
            setShowAssign(false);
            setBookingKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

// ── Event Modal (Create + Edit) ───────────────────────────────────────────────

interface EventFormState {
  title: string;
  description: string;
  event_date: string;
  capacity: string;
  max_tickets_per_user: string;
  category: string;
  image_url: string;
}

const EMPTY_EVENT_FORM: EventFormState = {
  title: '',
  description: '',
  event_date: '',
  capacity: '',
  max_tickets_per_user: '5',
  category: '',
  image_url: '',
};

function EventModal({
  editEvent,
  onClose,
  onSaved,
}: {
  editEvent: AdminEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const isEditing = editEvent !== null;

  const [form, setForm] = useState<EventFormState>(() =>
    isEditing
      ? {
          title: editEvent.title,
          description: editEvent.description ?? '',
          event_date: toLocalInput(editEvent.event_date),
          capacity: editEvent.capacity.toString(),
          max_tickets_per_user: editEvent.max_tickets_per_user.toString(),
          category: editEvent.category ?? '',
          image_url: editEvent.image_url ?? '',
        }
      : EMPTY_EVENT_FORM,
  );
  const [selectedStatus, setSelectedStatus] = useState<AdminEvent['status']>(editEvent?.status ?? 'active');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  function getPickerDate(): Date {
    if (!form.event_date.trim()) return new Date();
    const normalized = form.event_date.trim().replace(' ', 'T');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function openStatusPicker() {
    const labels = ['Active', 'Completed', 'Cancelled'] as const;
    const values: AdminEvent['status'][] = ['active', 'completed', 'cancelled'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: 3, destructiveButtonIndex: 2 },
        (idx) => { if (idx < 3) setSelectedStatus(values[idx]); },
      );
    } else {
      Alert.alert('Event Status', 'Select a new status', [
        ...labels.map((label, i) => ({ text: label, onPress: () => setSelectedStatus(values[i]) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Allow access to your photo library to upload an event banner.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [16, 9] as [number, number],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const fileExt = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
    const mimeType = asset.mimeType ?? `image/${fileExt}`;
    const fileName = `events/${Date.now()}.${fileExt}`;

    setUploading(true);
    try {
      const fetchResponse = await fetch(asset.uri);
      const blob = await fetchResponse.blob();
      const { data: uploaded, error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(fileName, blob, { contentType: mimeType, upsert: false });
      if (uploadError) {
        Alert.alert('Upload Failed', uploadError.message);
      } else {
        const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(uploaded.path);
        set('image_url', urlData.publicUrl);
      }
    } catch (err) {
      Alert.alert('Upload Error', err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  }

  function set(key: keyof EventFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) { Alert.alert('Required', 'Event title is required.'); return; }
    const isoDate = parseEventDate(form.event_date);
    if (!isoDate) { Alert.alert('Invalid Date', 'Enter date as "YYYY-MM-DD HH:MM", e.g. 2026-12-31 18:00'); return; }
    const cap = parseInt(form.capacity, 10);
    if (isNaN(cap) || cap < 1) { Alert.alert('Invalid Capacity', 'Capacity must be a positive number.'); return; }
    const maxTix = parseInt(form.max_tickets_per_user, 10);
    if (isNaN(maxTix) || maxTix < 1) { Alert.alert('Invalid Max Tickets', 'Max tickets per user must be at least 1.'); return; }

    setSubmitting(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: isoDate,
      capacity: cap,
      max_tickets_per_user: maxTix,
      category: form.category.trim() || null,
      image_url: form.image_url.trim() || null,
    };
    const { error } = isEditing
      ? await supabase.from('events').update({ ...payload, status: selectedStatus }).eq('id', editEvent.id)
      : await supabase.from('events').insert({ ...payload, status: 'active' });
    setSubmitting(false);

    if (error) { Alert.alert('Error', error.message); } else { onSaved(); onClose(); }
  }

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="rounded-t-3xl border-t border-border bg-card w-full flex-1">
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-base font-semibold text-foreground">
                {isEditing ? 'Edit Event' : 'Create New Event'}
              </Text>
              <Pressable onPress={onClose} className="rounded-xl p-2 active:bg-muted">
                <X size={18} color={c.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 14, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Title */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Title <Text className="text-destructive">*</Text>
                </Text>
                <TextInput
                  value={form.title}
                  onChangeText={(v) => set('title', v)}
                  placeholder="e.g. Future Tech Conference 2026"
                  placeholderTextColor={c.mutedForeground}
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                />
              </View>

              {/* Description */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </Text>
                <TextInput
                  value={form.description}
                  onChangeText={(v) => set('description', v)}
                  placeholder="Brief summary of the event…"
                  placeholderTextColor={c.mutedForeground}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground min-h-[72px]"
                />
              </View>

              {/* Date */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date <Text className="text-destructive">*</Text>
                </Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  className="flex-row items-center justify-between rounded-xl border border-input bg-background px-4 py-3 active:opacity-70"
                >
                  <Text className={`text-sm ${form.event_date ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {form.event_date
                      ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(getPickerDate())
                      : 'Select date…'}
                  </Text>
                  <CalendarDays size={16} color={c.mutedForeground} />
                </Pressable>
                {showDatePicker && (
                  <View>
                    {Platform.OS === 'ios' && (
                      <View className="flex-row justify-end pb-1">
                        <Pressable onPress={() => setShowDatePicker(false)}>
                          <Text className="text-sm font-semibold text-primary">Done</Text>
                        </Pressable>
                      </View>
                    )}
                    <DateTimePicker
                      value={getPickerDate()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, picked) => {
                        if (Platform.OS === 'android') setShowDatePicker(false);
                        if (picked && event.type !== 'dismissed') {
                          const prev = getPickerDate();
                          const merged = new Date(picked);
                          merged.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                          set('event_date', toLocalInput(merged.toISOString()));
                        }
                      }}
                    />
                  </View>
                )}
              </View>

              {/* Time */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Time <Text className="text-destructive">*</Text>
                </Text>
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  className="flex-row items-center justify-between rounded-xl border border-input bg-background px-4 py-3 active:opacity-70"
                >
                  <Text className={`text-sm ${form.event_date ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {form.event_date
                      ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(getPickerDate())
                      : 'Select time…'}
                  </Text>
                  <Clock size={16} color={c.mutedForeground} />
                </Pressable>
                {showTimePicker && (
                  <View>
                    {Platform.OS === 'ios' && (
                      <View className="flex-row justify-end pb-1">
                        <Pressable onPress={() => setShowTimePicker(false)}>
                          <Text className="text-sm font-semibold text-primary">Done</Text>
                        </Pressable>
                      </View>
                    )}
                    <DateTimePicker
                      value={getPickerDate()}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, picked) => {
                        if (Platform.OS === 'android') setShowTimePicker(false);
                        if (picked && event.type !== 'dismissed') {
                          set('event_date', toLocalInput(picked.toISOString()));
                        }
                      }}
                    />
                  </View>
                )}
              </View>

              {/* Capacity + Max Tickets */}
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Capacity <Text className="text-destructive">*</Text>
                  </Text>
                  <TextInput
                    value={form.capacity}
                    onChangeText={(v) => set('capacity', v)}
                    placeholder="100"
                    placeholderTextColor={c.mutedForeground}
                    keyboardType="number-pad"
                    className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                  />
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Max / User
                  </Text>
                  <TextInput
                    value={form.max_tickets_per_user}
                    onChangeText={(v) => set('max_tickets_per_user', v)}
                    placeholder="5"
                    placeholderTextColor={c.mutedForeground}
                    keyboardType="number-pad"
                    className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                  />
                </View>
              </View>

              {/* Category */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </Text>
                <TextInput
                  value={form.category}
                  onChangeText={(v) => set('category', v)}
                  placeholder="e.g. Conference, Workshop"
                  placeholderTextColor={c.mutedForeground}
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                />
              </View>

              {/* Banner Image */}
              <View className="gap-2">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Banner Image
                </Text>
                <Pressable
                  onPress={handlePickImage}
                  disabled={uploading}
                  className="overflow-hidden rounded-xl border border-dashed border-border bg-background disabled:opacity-60"
                >
                  {form.image_url ? (
                    <Image
                      source={{ uri: form.image_url }}
                      style={{ width: '100%', height: 120 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="items-center justify-center gap-2 py-8">
                      {uploading
                        ? <ActivityIndicator color={c.mutedForeground} />
                        : <Upload size={22} color={c.mutedForeground} />
                      }
                      <Text className="text-xs text-muted-foreground">
                        {uploading ? 'Uploading…' : 'Tap to pick from library'}
                      </Text>
                    </View>
                  )}
                </Pressable>
                {form.image_url ? (
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                      {form.image_url.split('/').pop()}
                    </Text>
                    <Pressable onPress={() => set('image_url', '')} className="ml-2">
                      <Text className="text-xs font-medium text-destructive">Remove</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {/* Status — edit only */}
              {isEditing && (
                <View className="gap-2 pt-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Event Status
                  </Text>
                  <Pressable
                    onPress={openStatusPicker}
                    disabled={submitting}
                    className="flex-row items-center justify-between rounded-xl border border-input bg-background px-4 py-3 disabled:opacity-50 active:opacity-70"
                  >
                    <Text className="text-sm text-foreground capitalize">{selectedStatus}</Text>
                    <ChevronDown size={16} color={c.mutedForeground} />
                  </Pressable>
                </View>
              )}

              {/* Submit + Cancel */}
              <View className="flex-row gap-3 pt-2">
                <Pressable
                  onPress={onClose}
                  disabled={submitting}
                  className="flex-1 items-center rounded-xl border border-border bg-muted/30 py-3 active:opacity-70 disabled:opacity-50"
                >
                  <Text className="text-sm font-semibold text-muted-foreground">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting || uploading}
                  className="flex-1 items-center rounded-xl bg-primary py-3 active:opacity-80 disabled:opacity-50"
                >
                  {submitting
                    ? <ActivityIndicator size="small" color={c.primaryForeground} />
                    : <Text className="text-sm font-semibold text-primary-foreground">
                        {isEditing ? 'Save Changes' : 'Create Event'}
                      </Text>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Admin Event Details Modal ─────────────────────────────────────────────────

function AdminEventDetailsModal({
  event,
  onClose,
  onEdit,
}: {
  event: AdminEvent;
  onClose: () => void;
  onEdit: () => void;
}) {
  const c = useColors();
  const [attendees, setAttendees] = useState<AdminEventAttendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(true);

  const overbooked = event.booked_count > event.capacity;
  const fill = event.capacity > 0 ? Math.min(event.booked_count / event.capacity, 1) : 0;
  const statusStyle = {
    active:    { label: 'Active',    bg: 'bg-green-500/10',   text: 'text-green-600' },
    completed: { label: 'Completed', bg: 'bg-muted',          text: 'text-muted-foreground' },
    cancelled: { label: 'Cancelled', bg: 'bg-destructive/10', text: 'text-destructive' },
  }[event.status];

  useEffect(() => {
    void fetchAttendees();
  }, [event.id]);

  async function fetchAttendees() {
    setLoadingAttendees(true);
    const { data } = await supabase
      .from('reservations')
      .select('id, user_id, tickets_requested, status, users:users(full_name, email)')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true });

    const mapped: AdminEventAttendee[] = (data ?? []).map((row: any) => ({
      reservation_id: row.id,
      user_id: row.user_id,
      user_name: row.users?.full_name ?? null,
      user_email: row.users?.email ?? '',
      tickets_requested: row.tickets_requested ?? 1,
      status: row.status,
    }));
    setAttendees(mapped);
    setLoadingAttendees(false);
  }

  const confirmedCount = attendees.filter((a) => a.status === 'confirmed').length;

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%', maxHeight: '94%' }}
        >
          <View
            className="rounded-t-3xl border-t border-border bg-card w-full"
            style={{ maxHeight: '100%' }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
                Event Details
              </Text>
              <View className="flex-row items-center gap-2 ml-2">
                <Pressable
                  onPress={onEdit}
                  className="flex-row items-center gap-1.5 rounded-xl bg-primary px-3 py-2 active:opacity-80"
                >
                  <Edit3 size={13} color={c.primaryForeground} />
                  <Text className="text-xs font-semibold text-primary-foreground">Edit Event</Text>
                </Pressable>
                <Pressable onPress={onClose} className="rounded-xl p-2 active:bg-muted">
                  <X size={18} color={c.mutedForeground} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 80 }}
            >
              {/* Event banner */}
              {event.image_url ? (
                <Image
                  source={{ uri: event.image_url }}
                  style={{ width: '100%', height: 160 }}
                  resizeMode="cover"
                />
              ) : (
                <View className="w-full items-center justify-center bg-muted" style={{ height: 96 }}>
                  <CalendarDays size={32} color={c.mutedForeground} strokeWidth={1} />
                </View>
              )}

              {/* Overview */}
              <View className="px-5 pt-5 pb-4 gap-3">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-xl font-bold text-foreground leading-snug">
                    {event.title}
                  </Text>
                  <View className={`rounded-full px-2.5 py-1 ${statusStyle.bg}`}>
                    <Text className={`text-xs font-semibold ${statusStyle.text}`}>{statusStyle.label}</Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-1.5">
                  <CalendarDays size={13} color={c.mutedForeground} />
                  <Text className="text-sm text-muted-foreground">{formatDateTime(event.event_date)}</Text>
                </View>

                {event.category ? (
                  <View className="self-start rounded-full bg-muted px-3 py-1">
                    <Text className="text-xs text-muted-foreground">{event.category}</Text>
                  </View>
                ) : null}

                {event.description ? (
                  <Text className="text-sm text-muted-foreground leading-relaxed">{event.description}</Text>
                ) : null}

                {/* Capacity bar */}
                <View className="gap-1.5 pt-1">
                  <View className="flex-row items-center justify-between">
                    <Text className={`text-xs font-medium ${overbooked ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {event.booked_count}/{event.capacity} seats booked{overbooked ? ' ⚠ overbooked' : ''}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{Math.round(fill * 100)}% full</Text>
                  </View>
                  <View className="h-2 rounded-full bg-muted overflow-hidden">
                    <View
                      className={`h-full rounded-full ${overbooked ? 'bg-destructive' : 'bg-primary'}`}
                      style={{ width: `${fill * 100}%` }}
                    />
                  </View>
                </View>
              </View>

              <View className="h-px bg-border mx-5 mb-4" />

              {/* Attendees */}
              <View className="px-5 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Attendees
                  </Text>
                  {!loadingAttendees && (
                    <Text className="text-xs text-muted-foreground">
                      {confirmedCount} confirmed · {attendees.length} total
                    </Text>
                  )}
                </View>

                {loadingAttendees ? (
                  <View className="items-center py-8">
                    <ActivityIndicator color={c.primary} />
                  </View>
                ) : attendees.length === 0 ? (
                  <View className="items-center rounded-2xl border border-border bg-background py-8 gap-2">
                    <Users size={28} color={c.mutedForeground} strokeWidth={1} />
                    <Text className="text-sm text-muted-foreground">No reservations yet</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {attendees.map((attendee) => (
                      <View
                        key={attendee.reservation_id}
                        className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3"
                      >
                        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Text className="text-xs font-bold text-primary">
                            {getInitials(attendee.user_name, attendee.user_email)}
                          </Text>
                        </View>
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                            {attendee.user_name ?? attendee.user_email}
                          </Text>
                          {attendee.user_name ? (
                            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                              {attendee.user_email}
                            </Text>
                          ) : null}
                        </View>
                        <View className="items-end gap-1">
                          <View
                            className={`rounded-full px-2 py-0.5 ${
                              attendee.status === 'confirmed' ? 'bg-green-500/10' : 'bg-destructive/10'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-semibold ${
                                attendee.status === 'confirmed' ? 'text-green-600' : 'text-destructive'
                              }`}
                            >
                              {attendee.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                            </Text>
                          </View>
                          <Text className="text-[10px] text-muted-foreground">
                            {attendee.tickets_requested} ticket{attendee.tickets_requested !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Event Card (pressable, opens detail) ──────────────────────────────────────

function EventCard({
  event,
  onPress,
}: {
  event: AdminEvent;
  onPress: () => void;
}) {
  const overbooked = event.booked_count > event.capacity;
  const fill = event.capacity > 0 ? Math.min(event.booked_count / event.capacity, 1) : 0;
  const statusStyle = {
    active:    { label: 'Active',    bg: 'bg-green-500/10',    text: 'text-green-600' },
    completed: { label: 'Completed', bg: 'bg-muted',           text: 'text-muted-foreground' },
    cancelled: { label: 'Cancelled', bg: 'bg-destructive/10',  text: 'text-destructive' },
  }[event.status];

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 rounded-2xl border border-border bg-card p-4 gap-3 active:opacity-75"
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 font-semibold text-foreground" numberOfLines={2}>
          {event.title}
        </Text>
        <View className={`rounded-full px-2.5 py-0.5 ${statusStyle.bg}`}>
          <Text className={`text-xs font-semibold ${statusStyle.text}`}>{statusStyle.label}</Text>
        </View>
      </View>

      <View className="gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <CalendarDays size={12} color="#6b7ca4" />
          <Text className="text-xs text-muted-foreground">{formatDateTime(event.event_date)}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className={`text-xs font-medium ${overbooked ? 'text-destructive' : 'text-muted-foreground'}`}>
            {event.booked_count}/{event.capacity} seats{overbooked ? ' ⚠ overbooked' : ''}
          </Text>
          {event.category ? (
            <Text className="text-xs text-muted-foreground">{event.category}</Text>
          ) : null}
        </View>
        <View className="h-1.5 rounded-full bg-muted overflow-hidden">
          <View
            className={`h-full rounded-full ${overbooked ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${fill * 100}%` }}
          />
        </View>
      </View>
    </Pressable>
  );
}

// ── Events Tab ────────────────────────────────────────────────────────────────

function EventsTab({
  events,
  loading,
  refreshing,
  onRefresh,
  onSaved,
}: {
  events: AdminEvent[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>('all');
  const [viewingEventId, setViewingEventId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);

  const viewingEvent = viewingEventId ? (events.find((e) => e.id === viewingEventId) ?? null) : null;
  const editingEvent = editingEventId ? (events.find((e) => e.id === editingEventId) ?? null) : null;

  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = events.filter((e) => {
    const statusMatch = statusFilter === 'all' || e.status === statusFilter;
    const searchMatch =
      !searchLower ||
      e.title.toLowerCase().includes(searchLower) ||
      (e.category?.toLowerCase().includes(searchLower) ?? false);
    return statusMatch && searchMatch;
  });

  const statusCounts: Record<EventStatusFilter, number> = {
    all:       events.length,
    active:    events.filter((e) => e.status === 'active').length,
    completed: events.filter((e) => e.status === 'completed').length,
    cancelled: events.filter((e) => e.status === 'cancelled').length,
  };

  const filterPills: { id: EventStatusFilter; label: string }[] = [
    { id: 'all',       label: 'All' },
    { id: 'active',    label: 'Active' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListHeaderComponent={
          <View className="gap-3 mb-2 mt-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3 py-2">
                <Search size={14} color={c.mutedForeground} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search events…"
                  placeholderTextColor={c.mutedForeground}
                  className="flex-1 text-sm text-foreground"
                />
              </View>
              <Pressable
                onPress={() => setShowNewEvent(true)}
                className="flex-row items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 active:opacity-80"
              >
                <Plus size={14} color={c.primaryForeground} />
                <Text className="text-xs font-semibold text-primary-foreground">New</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {filterPills.map(({ id, label }) => (
                <Pressable
                  key={id}
                  onPress={() => setStatusFilter(id)}
                  className={`rounded-full border px-3 py-1 ${
                    statusFilter === id ? 'border-primary bg-primary' : 'border-border bg-card'
                  }`}
                >
                  <Text className={`text-xs font-medium ${statusFilter === id ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                    {label} ({statusCounts[id]})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View>{[0, 1, 2].map((i) => <CardSkeleton key={i} compact />)}</View>
          ) : (
            <View className="items-center py-12">
              <CalendarDays size={36} color={c.mutedForeground} strokeWidth={1} />
              <Text className="mt-3 text-sm font-medium text-foreground">
                {searchQuery ? `No events match "${searchQuery}"` : 'No events found'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => setViewingEventId(item.id)}
          />
        )}
      />

      {viewingEvent && (
        <AdminEventDetailsModal
          event={viewingEvent}
          onClose={() => setViewingEventId(null)}
          onEdit={() => {
            setEditingEventId(viewingEventId);
            setViewingEventId(null);
          }}
        />
      )}

      {(editingEvent || showNewEvent) && (
        <EventModal
          editEvent={editingEvent}
          onClose={() => { setEditingEventId(null); setShowNewEvent(false); }}
          onSaved={() => { setEditingEventId(null); setShowNewEvent(false); onSaved(); }}
        />
      )}
    </>
  );
}

// ── Broadcast Tab ─────────────────────────────────────────────────────────────

function BroadcastTab({
  users,
  events,
  loadingData,
}: {
  users: AdminUser[];
  events: AdminEvent[];
  loadingData: boolean;
}) {
  const c = useColors();
  const [target, setTarget] = useState<BroadcastTarget>('all');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetEventId, setTargetEventId] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [message, setMessage] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [sending, setSending] = useState(false);

  const approvedUsers = users.filter((u) => u.approval_status === 'approved');
  const filteredUsers = userSearch.trim()
    ? users.filter(
        (u) =>
          (u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ?? false) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase()),
      )
    : users;
  const filteredEvents = eventSearch.trim()
    ? events.filter((e) => e.title.toLowerCase().includes(eventSearch.toLowerCase()))
    : events;

  const selectedUser = users.find((u) => u.id === targetUserId);
  const selectedEvent = events.find((e) => e.id === targetEventId);

  function recipientHint(): string {
    if (target === 'all')
      return `${approvedUsers.length} approved user${approvedUsers.length !== 1 ? 's' : ''} will receive this.`;
    if (target === 'specific_user')
      return selectedUser ? '1 user will receive this.' : 'Select a user.';
    return selectedEvent ? 'All confirmed attendees of the selected event.' : 'Select an event.';
  }

  async function handleSend() {
    if (!notifTitle.trim() || !message.trim()) {
      Alert.alert('Required', 'Please fill in both Title and Message.');
      return;
    }
    if (target === 'specific_user' && !targetUserId) {
      Alert.alert('Required', 'Please select a user.');
      return;
    }
    if (target === 'event_attendees' && !targetEventId) {
      Alert.alert('Required', 'Please select an event.');
      return;
    }
    setSending(true);

    let recipientIds: string[] = [];
    if (target === 'all') {
      recipientIds = approvedUsers.map((u) => u.id);
    } else if (target === 'specific_user') {
      recipientIds = [targetUserId];
    } else {
      const { data, error } = await supabase
        .from('reservations')
        .select('user_id')
        .eq('event_id', targetEventId)
        .eq('status', 'confirmed');
      if (error) {
        Alert.alert('Error', error.message);
        setSending(false);
        return;
      }
      recipientIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    }

    if (recipientIds.length === 0) {
      Alert.alert('No Recipients', 'No recipients found for the selected audience.');
      setSending(false);
      return;
    }

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      title: notifTitle.trim(),
      message: message.trim(),
      type: 'admin_broadcast',
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const n = recipientIds.length;
      Alert.alert('Sent', `Broadcast delivered to ${n} recipient${n !== 1 ? 's' : ''}.`);
      setNotifTitle('');
      setMessage('');
      setTargetUserId('');
      setTargetEventId('');
      setUserSearch('');
      setEventSearch('');
    }
    setSending(false);
  }

  const targetOptions: { id: BroadcastTarget; label: string }[] = [
    { id: 'all',              label: 'All Approved Users' },
    { id: 'specific_user',   label: 'Specific User' },
    { id: 'event_attendees', label: 'Event Attendees' },
  ];

  if (loadingData) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator color={c.primary} /></View>;
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-5">
        {/* Audience */}
        <View>
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience</Text>
          <View className="rounded-2xl border border-border bg-card overflow-hidden">
            {targetOptions.map(({ id, label }, i) => (
              <Pressable
                key={id}
                onPress={() => { setTarget(id); setTargetUserId(''); setTargetEventId(''); }}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-muted ${
                  i < targetOptions.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${target === id ? 'border-primary' : 'border-border'}`}>
                  {target === id && <View className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </View>
                <Text className={`text-sm ${target === id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Specific user picker */}
        {target === 'specific_user' && (
          <View>
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select User</Text>
            {selectedUser ? (
              <Pressable
                onPress={() => { setTargetUserId(''); setUserSearch(''); }}
                className="flex-row items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5"
              >
                <Text className="flex-1 text-sm font-medium text-foreground">
                  {selectedUser.full_name ?? selectedUser.email}
                </Text>
                <Text className="text-xs text-primary font-medium">Change ×</Text>
              </Pressable>
            ) : (
              <View className="rounded-2xl border border-border bg-card overflow-hidden">
                <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
                  <Search size={14} color={c.mutedForeground} />
                  <TextInput
                    value={userSearch}
                    onChangeText={setUserSearch}
                    placeholder="Search by name or email…"
                    placeholderTextColor={c.mutedForeground}
                    className="flex-1 text-sm text-foreground"
                  />
                </View>
                {filteredUsers.slice(0, 6).map((u, i) => (
                  <Pressable
                    key={u.id}
                    onPress={() => setTargetUserId(u.id)}
                    className={`px-4 py-3 active:bg-muted ${i < Math.min(filteredUsers.length, 6) - 1 ? 'border-b border-border/50' : ''}`}
                  >
                    <Text className="text-sm font-medium text-foreground">{u.full_name ?? u.email}</Text>
                    {u.full_name ? <Text className="text-xs text-muted-foreground">{u.email}</Text> : null}
                  </Pressable>
                ))}
                {filteredUsers.length === 0 && (
                  <View className="items-center py-6">
                    <Text className="text-sm text-muted-foreground">No users found</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Event attendees picker */}
        {target === 'event_attendees' && (
          <View>
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Event</Text>
            {selectedEvent ? (
              <Pressable
                onPress={() => { setTargetEventId(''); setEventSearch(''); }}
                className="flex-row items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5"
              >
                <Text className="flex-1 text-sm font-medium text-foreground">{selectedEvent.title}</Text>
                <Text className="text-xs text-primary font-medium">Change ×</Text>
              </Pressable>
            ) : (
              <View className="rounded-2xl border border-border bg-card overflow-hidden">
                <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
                  <Search size={14} color={c.mutedForeground} />
                  <TextInput
                    value={eventSearch}
                    onChangeText={setEventSearch}
                    placeholder="Search active events…"
                    placeholderTextColor={c.mutedForeground}
                    className="flex-1 text-sm text-foreground"
                  />
                </View>
                {filteredEvents.filter((e) => e.status === 'active').slice(0, 6).map((e, i, arr) => (
                  <Pressable
                    key={e.id}
                    onPress={() => setTargetEventId(e.id)}
                    className={`px-4 py-3 active:bg-muted ${i < arr.length - 1 ? 'border-b border-border/50' : ''}`}
                  >
                    <Text className="text-sm font-medium text-foreground">{e.title}</Text>
                    <Text className="text-xs text-muted-foreground">{formatDate(e.event_date)}</Text>
                  </Pressable>
                ))}
                {filteredEvents.filter((e) => e.status === 'active').length === 0 && (
                  <View className="items-center py-6">
                    <Text className="text-sm text-muted-foreground">No active events found</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Title */}
        <View>
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notification Title</Text>
          <TextInput
            value={notifTitle}
            onChangeText={setNotifTitle}
            placeholder="e.g. Event Update"
            placeholderTextColor={c.mutedForeground}
            className="rounded-2xl border border-input bg-card px-4 py-3.5 text-sm text-foreground"
          />
        </View>

        {/* Message */}
        <View>
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Write your message…"
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="rounded-2xl border border-input bg-card px-4 py-3.5 text-sm text-foreground min-h-[100px]"
          />
        </View>

        <View className="flex-row items-center justify-between gap-4">
          <Text className="flex-1 text-xs text-muted-foreground">{recipientHint()}</Text>
          <Pressable
            onPress={handleSend}
            disabled={sending}
            className="flex-row items-center gap-2 rounded-xl bg-primary px-5 py-3 active:opacity-80 disabled:opacity-50"
          >
            {sending
              ? <ActivityIndicator size="small" color={c.primaryForeground} />
              : <Send size={14} color={c.primaryForeground} />
            }
            <Text className="text-sm font-semibold text-primary-foreground">
              {sending ? 'Sending…' : 'Send'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

// ── Support Tab ───────────────────────────────────────────────────────────────

function SupportTab({
  tickets,
  loading,
  refreshing,
  onRefresh,
  onOpenChat,
}: {
  tickets: AdminTicket[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenChat: (ticket: AdminTicket) => void;
}) {
  const c = useColors();
  const [filter, setFilter] = useState<TicketStatusFilter>('open');

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;

  const filterTabs: { id: TicketStatusFilter; label: string; count: number }[] = [
    { id: 'open',     label: 'Open',     count: openCount },
    { id: 'resolved', label: 'Resolved', count: resolvedCount },
    { id: 'all',      label: 'All',      count: tickets.length },
  ];

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <FlatList
      data={loading ? [] : filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      ListHeaderComponent={
        <View className="flex-row gap-2 mb-4">
          {filterTabs.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setFilter(tab.id)}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2 ${
                filter === tab.id ? 'border-primary bg-primary' : 'border-border bg-card'
              }`}
            >
              <Text className={`text-xs font-semibold ${filter === tab.id ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                {tab.label}
              </Text>
              <View className={`rounded-full px-1.5 py-0.5 ${filter === tab.id ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                <Text className={`text-[10px] font-bold ${filter === tab.id ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                  {tab.count}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <View>{[0, 1, 2].map((i) => <CardSkeleton key={i} compact />)}</View>
        ) : (
          <View className="items-center py-12">
            <MessageSquare size={36} color={c.mutedForeground} strokeWidth={1} />
            <Text className="mt-3 text-sm font-medium text-foreground">
              {filter !== 'all' ? `No ${filter} tickets` : 'No tickets found'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const isOpen = item.status === 'open';
        return (
          <Pressable
            onPress={() => onOpenChat(item)}
            className="mb-2 rounded-2xl border border-border bg-card px-4 py-3.5 gap-1.5 active:bg-muted"
          >
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                {item.subject ?? 'Support request'}
              </Text>
              <View className={`rounded-full px-2 py-0.5 ${isOpen ? 'bg-green-500/10' : 'bg-muted'}`}>
                <Text className={`text-[10px] font-semibold ${isOpen ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {isOpen ? 'Open' : 'Resolved'}
                </Text>
              </View>
            </View>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {item.user_name ?? item.user_email}
            </Text>
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">{formatDate(item.created_at)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

interface Props {
  onSignOut: () => void;
}

export default function AdminDashboard({ onSignOut }: Props) {
  const c = useColors();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [adminTab, setAdminTab] = useState<AdminPortalTab>('users');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  const [activeChat, setActiveChat] = useState<{ ticketId: string; title: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, phone_number, role, approval_status, created_at')
      .order('created_at', { ascending: false });
    if (!isMounted.current) return;
    setUsers((data ?? []) as AdminUser[]);
    setUsersLoading(false);
  }, []);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('id, title, description, image_url, event_date, capacity, max_tickets_per_user, booked_count, category, status')
      .order('event_date', { ascending: false });
    if (!isMounted.current) return;
    setEvents((data ?? []) as AdminEvent[]);
    setEventsLoading(false);
  }, []);

  const fetchTickets = useCallback(async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, status, created_at, users!support_tickets_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (!isMounted.current) return;
    const mapped: AdminTicket[] = (data ?? []).map((row: any) => ({
      id: row.id,
      subject: row.subject ?? null,
      status: row.status,
      created_at: row.created_at,
      user_name: row.users?.full_name ?? null,
      user_email: row.users?.email ?? '',
    }));
    setTickets(mapped);
    setTicketsLoading(false);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void Promise.all([fetchUsers(), fetchEvents(), fetchTickets()]);

    const channel = supabase
      .channel('admin-portal-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => {
        if (isMounted.current) void fetchTickets();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, (payload) => {
        if (!isMounted.current) return;
        const u = payload.new as { id: string; status: AdminTicket['status'] };
        setTickets((prev) => prev.map((t) => (t.id === u.id ? { ...t, status: u.status } : t)));
      })
      .subscribe();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(channel);
    };
  }, [fetchUsers, fetchEvents, fetchTickets]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchUsers(), fetchEvents(), fetchTickets()]);
    if (isMounted.current) setRefreshing(false);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function handleUserStatusChange(userId: string, newStatus: ApprovalStatus) {
    setUpdatingUserId(userId);
    const { error } = await supabase.from('users').update({ approval_status: newStatus }).eq('id', userId);
    if (error) {
      Alert.alert('Error', error.message);
      void fetchUsers();
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, approval_status: newStatus } : u)));
    }
    if (isMounted.current) setUpdatingUserId(null);
  }

  async function handleUserRoleChange(userId: string, role: 'admin' | 'user') {
    setUpdatingRoleId(userId);
    const { error } = await supabase.from('users').update({ role }).eq('id', userId);
    if (error) {
      Alert.alert('Error', error.message);
      void fetchUsers();
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    }
    if (isMounted.current) setUpdatingRoleId(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const pendingCount = users.filter((u) => u.approval_status === 'pending').length;
  const openTicketCount = tickets.filter((t) => t.status === 'open').length;

  // ── TicketChat overlay ────────────────────────────────────────────────────

  if (activeChat) {
    return (
      <TicketChat
        ticketId={activeChat.ticketId}
        title={activeChat.title}
        isAdmin
        onBack={() => setActiveChat(null)}
      />
    );
  }

  // ── Portal render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
        <View className="flex-row items-center gap-2.5">
          <Image
            source={require('../../assets/icon.png')}
            style={{ width: 32, height: 32, borderRadius: 8 }}
            resizeMode="cover"
          />
          <Text className="text-2xl font-bold tracking-tight text-foreground">L&apos;Ayk</Text>
          <View className="ml-2 rounded-md bg-primary/10 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-primary">Admin</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={toggleColorScheme}
            className="rounded-xl border border-border p-2 active:bg-muted"
          >
            {isDark
              ? <Sun size={15} color={c.mutedForeground} />
              : <Moon size={15} color={c.mutedForeground} />
            }
          </Pressable>
          <Pressable
            onPress={onSignOut}
            className="flex-row items-center gap-1.5 rounded-xl border border-border px-3 py-2 active:bg-muted"
          >
            <LogOut size={14} color={c.mutedForeground} />
            <Text className="text-xs font-medium text-muted-foreground">Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {/* Segmented tab bar */}
      <AdminTabBar
        active={adminTab}
        onPress={setAdminTab}
        openTicketCount={openTicketCount}
        pendingUserCount={pendingCount}
      />

      {/* Tab content */}
      {adminTab === 'users' && (
        <UsersTab
          users={users}
          events={events}
          loading={usersLoading}
          refreshing={refreshing}
          updatingId={updatingUserId}
          updatingRoleId={updatingRoleId}
          pendingCount={pendingCount}
          onRefresh={onRefresh}
          onStatusChange={handleUserStatusChange}
          onRoleChange={handleUserRoleChange}
          searchQuery={userSearch}
          onSearchChange={setUserSearch}
        />
      )}
      {adminTab === 'events' && (
        <EventsTab
          events={events}
          loading={eventsLoading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onSaved={fetchEvents}
        />
      )}
      {adminTab === 'broadcast' && (
        <BroadcastTab
          users={users}
          events={events}
          loadingData={usersLoading || eventsLoading}
        />
      )}
      {adminTab === 'support' && (
        <SupportTab
          tickets={tickets}
          loading={ticketsLoading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onOpenChat={(ticket) =>
            setActiveChat({ ticketId: ticket.id, title: ticket.subject ?? 'Support request' })
          }
        />
      )}
    </SafeAreaView>
  );
}
