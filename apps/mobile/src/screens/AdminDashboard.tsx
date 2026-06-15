import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  CalendarDays,
  CheckCircle2,
  Clock,
  Edit3,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
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
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  user_name: string | null;
  user_email: string;
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

// ── Horizontal pill tab bar ────────────────────────────────────────────────────

const PORTAL_TABS: { id: AdminPortalTab; label: string }[] = [
  { id: 'users',     label: 'Users' },
  { id: 'events',    label: 'Events' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'support',   label: 'Support' },
];

function PillTabBar({
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {PORTAL_TABS.map(({ id, label }) => {
        const isActive = active === id;
        const badge = id === 'support' ? openTicketCount : id === 'users' ? pendingUserCount : 0;
        return (
          <Pressable
            key={id}
            onPress={() => onPress(id)}
            className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${
              isActive ? 'border-primary bg-primary' : 'border-border bg-card'
            }`}
          >
            <Text className={`text-sm font-semibold ${isActive ? 'text-primary-foreground' : 'text-foreground'}`}>
              {label}
            </Text>
            {badge > 0 && (
              <View className={`h-5 min-w-[20px] items-center justify-center rounded-full px-1 ${isActive ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                <Text className={`text-[10px] font-bold ${isActive ? 'text-primary-foreground' : 'text-primary'}`}>
                  {badge}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UserCard({
  user,
  updatingId,
  onStatusChange,
}: {
  user: AdminUser;
  updatingId: string | null;
  onStatusChange: (userId: string, status: ApprovalStatus) => void;
}) {
  const busy = updatingId === user.id;
  const initials = getInitials(user.full_name, user.email);

  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-4 gap-3">
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-sm font-bold text-primary">{initials}</Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="font-semibold text-foreground" numberOfLines={1}>
            {user.full_name ?? <Text className="italic text-muted-foreground/50">No name</Text>}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>{user.email}</Text>
          {user.phone_number ? (
            <Text className="text-xs text-muted-foreground">{user.phone_number}</Text>
          ) : null}
        </View>
        <ApprovalBadge status={user.approval_status} />
      </View>

      <View className="flex-row items-center gap-2">
        <View className="rounded-full bg-muted px-2 py-0.5">
          <Text className="text-xs font-medium text-muted-foreground capitalize">{user.role}</Text>
        </View>
        <Text className="text-xs text-muted-foreground/60">· Joined {formatDate(user.created_at)}</Text>
      </View>

      {/* Context-aware action buttons — Pending is NEVER a user action. */}
      <View className="flex-row gap-2">
        {user.approval_status === 'pending' && (
          <>
            <Pressable
              onPress={() => onStatusChange(user.id, 'approved')}
              disabled={busy}
              className="flex-1 items-center rounded-xl bg-green-500/10 py-2 disabled:opacity-50 active:opacity-70"
            >
              {busy
                ? <ActivityIndicator size="small" color="#16a34a" />
                : <Text className="text-xs font-semibold text-green-600">Approve</Text>
              }
            </Pressable>
            <Pressable
              onPress={() => onStatusChange(user.id, 'rejected')}
              disabled={busy}
              className="flex-1 items-center rounded-xl bg-destructive/10 py-2 disabled:opacity-50 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-destructive">Reject</Text>
            </Pressable>
          </>
        )}
        {user.approval_status === 'approved' && (
          <Pressable
            onPress={() => onStatusChange(user.id, 'rejected')}
            disabled={busy}
            className="flex-1 items-center rounded-xl bg-destructive/10 py-2 disabled:opacity-50 active:opacity-70"
          >
            {busy
              ? <ActivityIndicator size="small" color="#e44848" />
              : <Text className="text-xs font-semibold text-destructive">Revoke Access</Text>
            }
          </Pressable>
        )}
        {user.approval_status === 'rejected' && (
          <Pressable
            onPress={() => onStatusChange(user.id, 'approved')}
            disabled={busy}
            className="flex-1 items-center rounded-xl bg-green-500/10 py-2 disabled:opacity-50 active:opacity-70"
          >
            {busy
              ? <ActivityIndicator size="small" color="#16a34a" />
              : <Text className="text-xs font-semibold text-green-600">Re-Approve</Text>
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

function UsersTab({
  users,
  loading,
  refreshing,
  updatingId,
  pendingCount,
  onRefresh,
  onStatusChange,
  searchQuery,
  onSearchChange,
}: {
  users: AdminUser[];
  loading: boolean;
  refreshing: boolean;
  updatingId: string | null;
  pendingCount: number;
  onRefresh: () => void;
  onStatusChange: (id: string, status: ApprovalStatus) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
}) {
  const c = useColors();
  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = searchLower
    ? users.filter(
        (u) =>
          (u.full_name?.toLowerCase().includes(searchLower) ?? false) ||
          u.email.toLowerCase().includes(searchLower),
      )
    : users;

  return (
    <FlatList
      data={loading ? [] : filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      ListHeaderComponent={
        <View>
          <View className="flex-row items-center gap-2 mb-4 mt-2 rounded-xl border border-input bg-card px-3 py-2.5">
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
        <UserCard user={item} updatingId={updatingId} onStatusChange={onStatusChange} />
      )}
    />
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
  const [submitting, setSubmitting] = useState(false);

  function set(key: keyof EventFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Event title is required.');
      return;
    }
    const isoDate = parseEventDate(form.event_date);
    if (!isoDate) {
      Alert.alert('Invalid Date', 'Enter date as "YYYY-MM-DD HH:MM", e.g. 2026-12-31 18:00');
      return;
    }
    const cap = parseInt(form.capacity, 10);
    if (isNaN(cap) || cap < 1) {
      Alert.alert('Invalid Capacity', 'Capacity must be a positive number.');
      return;
    }
    const maxTix = parseInt(form.max_tickets_per_user, 10);
    if (isNaN(maxTix) || maxTix < 1) {
      Alert.alert('Invalid Max Tickets', 'Max tickets per user must be at least 1.');
      return;
    }

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
      ? await supabase.from('events').update(payload).eq('id', editEvent.id)
      : await supabase.from('events').insert({ ...payload, status: 'active' });

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-background/70">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="rounded-t-3xl border-t border-border bg-card">
            {/* Modal header */}
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-base font-semibold text-foreground">
                {isEditing ? 'Edit Event' : 'Create New Event'}
              </Text>
              <Pressable onPress={onClose} className="rounded-xl p-2 active:bg-muted">
                <X size={18} color={c.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 14, paddingBottom: 32 }}
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

              {/* Date & Time */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date & Time <Text className="text-destructive">*</Text>
                </Text>
                <TextInput
                  value={form.event_date}
                  onChangeText={(v) => set('event_date', v)}
                  placeholder="2026-12-31 18:00"
                  placeholderTextColor={c.mutedForeground}
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                />
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

              {/* Image URL */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Banner Image URL
                </Text>
                <TextInput
                  value={form.image_url}
                  onChangeText={(v) => set('image_url', v)}
                  placeholder="https://…"
                  placeholderTextColor={c.mutedForeground}
                  keyboardType="url"
                  autoCapitalize="none"
                  className="rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground"
                />
              </View>

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
                  disabled={submitting}
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

// ── Events Tab ────────────────────────────────────────────────────────────────

function EventCard({
  event,
  onStatusChange,
  busy,
  onEdit,
}: {
  event: AdminEvent;
  onStatusChange: (id: string, status: AdminEvent['status']) => void;
  busy: boolean;
  onEdit: () => void;
}) {
  const overbooked = event.booked_count > event.capacity;
  const fill = event.capacity > 0 ? Math.min(event.booked_count / event.capacity, 1) : 0;
  const statusStyle = {
    active:    { label: 'Active',    bg: 'bg-green-500/10',    text: 'text-green-600' },
    completed: { label: 'Completed', bg: 'bg-muted',           text: 'text-muted-foreground' },
    cancelled: { label: 'Cancelled', bg: 'bg-destructive/10',  text: 'text-destructive' },
  }[event.status];

  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-4 gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 font-semibold text-foreground" numberOfLines={2}>
          {event.title}
        </Text>
        <View className="flex-row items-center gap-2">
          <View className={`rounded-full px-2.5 py-0.5 ${statusStyle.bg}`}>
            <Text className={`text-xs font-semibold ${statusStyle.text}`}>{statusStyle.label}</Text>
          </View>
          <Pressable onPress={onEdit} className="rounded-lg p-1 active:bg-muted">
            <Edit3 size={14} color="#94a3b8" />
          </Pressable>
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

      {busy ? (
        <View className="items-center py-1">
          <ActivityIndicator size="small" color="#94a3b8" />
        </View>
      ) : (
        <View className="flex-row gap-2">
          {event.status !== 'active' && (
            <Pressable
              onPress={() => onStatusChange(event.id, 'active')}
              className="flex-1 items-center rounded-xl bg-green-500/10 py-2 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-green-600">Set Active</Text>
            </Pressable>
          )}
          {event.status !== 'completed' && (
            <Pressable
              onPress={() => onStatusChange(event.id, 'completed')}
              className="flex-1 items-center rounded-xl bg-muted py-2 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-muted-foreground">Complete</Text>
            </Pressable>
          )}
          {event.status !== 'cancelled' && (
            <Pressable
              onPress={() => onStatusChange(event.id, 'cancelled')}
              className="flex-1 items-center rounded-xl bg-destructive/10 py-2 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-destructive">Cancel</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function EventsTab({
  events,
  loading,
  refreshing,
  updatingId,
  onRefresh,
  onStatusChange,
  onSaved,
}: {
  events: AdminEvent[];
  loading: boolean;
  refreshing: boolean;
  updatingId: string | null;
  onRefresh: () => void;
  onStatusChange: (id: string, status: AdminEvent['status']) => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>('all');
  const [modalEvent, setModalEvent] = useState<AdminEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

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
            {/* Search + New Event row */}
            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3 py-2.5">
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
                onPress={() => { setModalEvent(null); setShowModal(true); }}
                className="flex-row items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 active:opacity-80"
              >
                <Plus size={14} color={c.primaryForeground} />
                <Text className="text-xs font-semibold text-primary-foreground">New</Text>
              </Pressable>
            </View>

            {/* Status filter pills */}
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
            busy={updatingId === item.id}
            onStatusChange={onStatusChange}
            onEdit={() => { setModalEvent(item); setShowModal(true); }}
          />
        )}
      />

      {showModal && (
        <EventModal
          editEvent={modalEvent}
          onClose={() => { setShowModal(false); setModalEvent(null); }}
          onSaved={() => { setShowModal(false); setModalEvent(null); onSaved(); }}
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
                <View className="flex-row items-center gap-2 border-b border-border px-4 py-2.5">
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
                <View className="flex-row items-center gap-2 border-b border-border px-4 py-2.5">
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

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  const filterTabs: { id: TicketStatusFilter; label: string; count: number }[] = [
    { id: 'open',     label: 'Open',     count: openCount },
    { id: 'resolved', label: 'Resolved', count: resolvedCount },
    { id: 'all',      label: 'All',      count: tickets.length },
  ];

  const filtered =
    filter === 'all'
      ? tickets
      : tickets.filter((t) =>
          filter === 'open'
            ? t.status === 'open' || t.status === 'in_progress'
            : t.status === 'resolved' || t.status === 'closed',
        );

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
        const isOpen = item.status === 'open' || item.status === 'in_progress';
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
            <Text className="text-[11px] text-muted-foreground/50">{formatDate(item.created_at)}</Text>
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
  const [userSearch, setUserSearch] = useState('');

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);

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
      .from('conversations')
      .select('id, subject, status, created_at, users!conversations_user_id_fkey(full_name, email)')
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
      .channel('admin-portal-conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        if (isMounted.current) void fetchTickets();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
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
    const { error } = await supabase
      .from('users')
      .update({ approval_status: newStatus })
      .eq('id', userId);
    if (error) {
      Alert.alert('Error', error.message);
      void fetchUsers();
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, approval_status: newStatus } : u)));
    }
    if (isMounted.current) setUpdatingUserId(null);
  }

  async function handleEventStatusChange(eventId: string, newStatus: AdminEvent['status']) {
    setUpdatingEventId(eventId);
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', eventId);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e)));
    }
    if (isMounted.current) setUpdatingEventId(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const pendingCount = users.filter((u) => u.approval_status === 'pending').length;
  const openTicketCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;

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
        <View className="flex-row items-center gap-2">
          <ShieldCheck size={20} color={c.primary} strokeWidth={2} />
          <Text className="text-2xl font-bold text-foreground">Admin Portal</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {/* Dark mode toggle */}
          <Pressable
            onPress={toggleColorScheme}
            className="rounded-xl border border-border p-2 active:bg-muted"
          >
            {isDark
              ? <Sun size={15} color={c.mutedForeground} />
              : <Moon size={15} color={c.mutedForeground} />
            }
          </Pressable>
          {/* Sign out */}
          <Pressable
            onPress={onSignOut}
            className="flex-row items-center gap-1.5 rounded-xl border border-border px-3 py-2 active:bg-muted"
          >
            <LogOut size={14} color={c.mutedForeground} />
            <Text className="text-xs font-medium text-muted-foreground">Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {/* Pill tab bar */}
      <View className="mb-3">
        <PillTabBar
          active={adminTab}
          onPress={setAdminTab}
          openTicketCount={openTicketCount}
          pendingUserCount={pendingCount}
        />
      </View>

      {/* Tab content */}
      {adminTab === 'users' && (
        <UsersTab
          users={users}
          loading={usersLoading}
          refreshing={refreshing}
          updatingId={updatingUserId}
          pendingCount={pendingCount}
          onRefresh={onRefresh}
          onStatusChange={handleUserStatusChange}
          searchQuery={userSearch}
          onSearchChange={setUserSearch}
        />
      )}
      {adminTab === 'events' && (
        <EventsTab
          events={events}
          loading={eventsLoading}
          refreshing={refreshing}
          updatingId={updatingEventId}
          onRefresh={onRefresh}
          onStatusChange={handleEventStatusChange}
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
