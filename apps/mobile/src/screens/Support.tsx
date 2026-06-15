import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, LifeBuoy, MessageCircle, Plus, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import { useColors } from '../colors';
import type { SupportTicket } from '../types';

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonTicket() {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-4 gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="h-4 w-2/3 rounded bg-muted" />
        <View className="h-5 w-16 rounded-full bg-muted" />
      </View>
      <View className="h-3 w-1/3 rounded bg-muted" />
    </View>
  );
}

// ── Ticket row ────────────────────────────────────────────────────────────────

function TicketRow({ ticket, selected, onPress }: {
  ticket: SupportTicket;
  selected: boolean;
  onPress: () => void;
}) {
  const isOpen = ticket.status === 'open';
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 rounded-2xl border p-4 gap-2 active:opacity-70 ${
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={2}>
          {ticket.subject ?? 'Support request'}
        </Text>
        <View className={`rounded-full px-2 py-0.5 ${isOpen ? 'bg-green-500/10' : 'bg-muted'}`}>
          <Text className={`text-[10px] font-semibold ${isOpen ? 'text-green-600' : 'text-muted-foreground'}`}>
            {isOpen ? 'Open' : 'Resolved'}
          </Text>
        </View>
      </View>
      <Text className="text-xs text-muted-foreground">
        {formatDate(ticket.created_at)}
      </Text>
    </Pressable>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onChatPress: (ticketId: string, subject: string) => void;
}

export default function Support({ onBack, onChatPress }: Props) {
  const { profile } = useAuthMobile();
  const c = useColors();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);

  const isMounted = useRef(true);

  const loadTickets = useCallback(async (isRefresh = false) => {
    if (!profile?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, status, created_at, user_id')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (!isMounted.current) return;
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id]);

  useEffect(() => {
    isMounted.current = true;
    void loadTickets();

    const channel = supabase
      .channel('my-support-tickets')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
        (payload) => {
          if (!isMounted.current) return;
          const updated = payload.new as { id: string; status: SupportTicket['status'] };
          setTickets((prev) =>
            prev.map((t) => (t.id === updated.id ? { ...t, status: updated.status } : t)),
          );
        },
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(channel);
    };
  }, [loadTickets]);

  async function handleCreate() {
    const trimmed = subject.trim();
    if (!trimmed || !profile?.id) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('support_tickets')
      .insert({ user_id: profile.id, subject: trimmed })
      .select('id, subject, status, created_at, user_id')
      .single();

    if (!isMounted.current) return;

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const ticket = data as SupportTicket;
      setTickets((prev) => [ticket, ...prev]);
      setSubject('');
      setShowForm(false);
      onChatPress(ticket.id, ticket.subject ?? 'Support request');
    }
    setCreating(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable onPress={onBack} className="p-3 rounded-xl active:bg-muted">
          <ArrowLeft size={26} color={c.foreground} />
        </Pressable>
        <View className="flex-1 flex-row items-center gap-2">
          <LifeBuoy size={17} color={c.primary} />
          <Text className="text-base font-semibold text-foreground">Support</Text>
        </View>
        <Pressable
          onPress={() => { setShowForm((v) => !v); setSubject(''); }}
          className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 ${
            showForm ? 'bg-muted' : 'bg-primary'
          }`}
        >
          {showForm
            ? <X size={13} color={c.foreground} />
            : <Plus size={13} color={c.primaryForeground} />
          }
          <Text className={`text-xs font-semibold ${showForm ? 'text-foreground' : 'text-primary-foreground'}`}>
            {showForm ? 'Cancel' : 'New Ticket'}
          </Text>
        </Pressable>
      </View>

      {/* Inline create form */}
      {showForm && (
        <View className="border-b border-border bg-muted/30 px-4 py-4 gap-2">
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Describe your issue briefly…"
            placeholderTextColor={c.mutedForeground}
            maxLength={200}
            autoFocus
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground"
          />
          <Pressable
            onPress={handleCreate}
            disabled={creating || !subject.trim()}
            className="w-full items-center rounded-xl bg-primary py-2.5 active:opacity-80 disabled:opacity-50"
          >
            {creating
              ? <ActivityIndicator size="small" color={c.primaryForeground} />
              : <Text className="text-sm font-semibold text-primary-foreground">Open Ticket</Text>
            }
          </Pressable>
        </View>
      )}

      {/* Ticket list */}
      {loading ? (
        <View className="px-5 pt-4">
          {[0, 1, 2].map((i) => <SkeletonTicket key={i} />)}
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTickets(true)}
              tintColor={c.primary}
            />
          }
          renderItem={({ item }) => (
            <TicketRow
              ticket={item}
              selected={selectedId === item.id}
              onPress={() => {
                setSelectedId(item.id);
                onChatPress(item.id, item.subject ?? 'Support request');
              }}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-20">
              <MessageCircle size={40} color={c.mutedForeground} strokeWidth={1} />
              <Text className="mt-3 text-sm font-medium text-foreground">
                No support tickets yet
              </Text>
              <Text className="mt-1 text-center text-xs text-muted-foreground px-8">
                Tap &quot;New Ticket&quot; to contact support.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
