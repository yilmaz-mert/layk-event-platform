import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, MessageCircle, Send } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import { useColors } from '../colors';
import type { SupportTicket, TicketMessage } from '../types';

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

// ── Message bubble ─────────────────────────────────────────────────────────────

interface BubbleProps {
  message: TicketMessage;
  isOwn: boolean;
  showDate: boolean;
  dateLabel: string;
}

function MessageBubble({ message, isOwn, showDate, dateLabel }: BubbleProps) {
  const senderLabel = isOwn ? null : message.sender_role === 'admin' ? 'Support' : 'User';

  return (
    <View>
      {showDate && (
        <View className="items-center py-3">
          <Text className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {dateLabel}
          </Text>
        </View>
      )}
      <View className={`mb-2 flex-row ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <View
          className={`max-w-[78%] rounded-2xl px-4 py-3 ${
            isOwn ? 'rounded-br-sm bg-primary' : 'rounded-bl-sm border border-border bg-card'
          }`}
        >
          {senderLabel && (
            <Text className="mb-1 text-xs font-semibold text-muted-foreground">
              {senderLabel}
            </Text>
          )}
          <Text className={`text-sm leading-relaxed ${isOwn ? 'text-primary-foreground' : 'text-foreground'}`}>
            {message.message}
          </Text>
          <Text
            className={`mt-1 text-right text-[10px] ${
              isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'
            }`}
          >
            {formatTime(message.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SupportTicket['status'] }) {
  if (status === 'open') {
    return (
      <View className="rounded-full bg-green-500/10 px-3 py-1">
        <Text className="text-xs font-semibold text-green-600">Open</Text>
      </View>
    );
  }
  return (
    <View className="rounded-full bg-muted px-3 py-1">
      <Text className="text-xs font-semibold text-muted-foreground">Resolved</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

interface Props {
  // ticketId: direct lookup from Support screen / AdminDashboard
  // reservationId: find-or-create via embedded subject key from MyBookings
  ticketId?: string;
  reservationId?: string;
  title: string;
  isAdmin?: boolean;
  onBack: () => void;
}

export default function TicketChat({ ticketId, reservationId, title, isAdmin = false, onBack }: Props) {
  const { profile } = useAuthMobile();
  const c = useColors();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    void initTicket();
    return () => {
      isMounted.current = false;
      channelRef.current?.unsubscribe();
    };
  }, [ticketId, reservationId]);

  async function initTicket() {
    setLoading(true);
    setMessages([]);

    let found: SupportTicket | null = null;

    if (ticketId) {
      const { data } = await supabase
        .from('support_tickets')
        .select('id, status, created_at, subject, user_id')
        .eq('id', ticketId)
        .maybeSingle();
      found = data as SupportTicket | null;

    } else if (reservationId && profile?.id) {
      // 1:1 key: embed the reservationId in the subject field.
      // support_tickets has no reservation_id column, so subject is used as a
      // deterministic lookup key for the MyBookings → chat flow.
      const lookupSubject = `booking:${reservationId}`;

      const { data: existing } = await supabase
        .from('support_tickets')
        .select('id, status, created_at, subject, user_id')
        .eq('user_id', profile.id)
        .eq('subject', lookupSubject)
        .maybeSingle();

      if (existing) {
        found = existing as SupportTicket;
      } else {
        const { data: created } = await supabase
          .from('support_tickets')
          .insert({ user_id: profile.id, subject: lookupSubject })
          .select('id, status, created_at, subject, user_id')
          .single();
        found = created as SupportTicket | null;
      }
    }

    if (!found) {
      if (isMounted.current) setLoading(false);
      return;
    }

    if (isMounted.current) setTicket(found);
    await fetchMessages(found.id);
    subscribeToMessages(found.id);
  }

  async function fetchMessages(tId: string) {
    const { data, error } = await supabase
      .from('ticket_messages')
      .select('id, ticket_id, sender_id, sender_role, message, created_at')
      .eq('ticket_id', tId)
      .order('created_at', { ascending: true });

    if (!isMounted.current) return;
    if (!error) {
      setMessages((data ?? []) as TicketMessage[]);
    }
    setLoading(false);
  }

  function subscribeToMessages(tId: string) {
    channelRef.current?.unsubscribe();

    const channel = supabase
      .channel(`ticket-msgs:${tId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${tId}`,
        },
        (payload) => {
          if (!isMounted.current) return;
          const msg = payload.new as TicketMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
        },
      )
      .subscribe();

    channelRef.current = channel;
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || !ticket?.id || !profile?.id || sending) return;

    setSending(true);
    setInput('');

    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: profile.id,
      sender_role: isAdmin ? 'admin' : 'user',
      message: content,
    });

    if (error) setInput(content);
    setSending(false);
  }

  async function handleResolve() {
    if (!ticket) return;
    Alert.alert('Resolve Ticket', 'Mark this ticket as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: async () => {
          setResolving(true);
          const { error } = await supabase
            .from('support_tickets')
            .update({ status: 'resolved' })
            .eq('id', ticket.id);
          if (!error && isMounted.current) {
            setTicket((prev) => (prev ? { ...prev, status: 'resolved' } : prev));
          }
          if (isMounted.current) setResolving(false);
        },
      },
    ]);
  }

  // ── Date-separated list items ──────────────────────────────────────────────

  interface ListItem {
    message: TicketMessage;
    showDate: boolean;
    dateLabel: string;
  }

  const listItems: ListItem[] = messages.map((msg, i) => {
    const prev = messages[i - 1];
    const currDay = new Date(msg.created_at).toDateString();
    const prevDay = prev ? new Date(prev.created_at).toDateString() : '';
    return {
      message: msg,
      showDate: currDay !== prevDay,
      dateLabel: formatDateSeparator(msg.created_at),
    };
  });

  const isResolved = ticket?.status === 'resolved';
  const canResolve = isAdmin && ticket?.status === 'open';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Pressable onPress={onBack} className="p-3 rounded-xl active:bg-muted">
            <ArrowLeft size={28} color={c.foreground} />
          </Pressable>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {title}
            </Text>
            <Text className="text-xs text-muted-foreground">Support Chat</Text>
          </View>
          {ticket && <StatusBadge status={ticket.status} />}
          {canResolve && (
            <Pressable
              onPress={handleResolve}
              disabled={resolving}
              className="flex-row items-center gap-1.5 rounded-xl bg-green-500/10 px-3 py-1.5 active:opacity-70 disabled:opacity-50"
            >
              {resolving ? (
                <ActivityIndicator size="small" color="#16a34a" />
              ) : (
                <>
                  <CheckCircle size={13} color="#16a34a" />
                  <Text className="text-xs font-semibold text-green-600">Resolve</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Messages area */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={c.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <MessageCircle size={48} color={c.mutedForeground} strokeWidth={1} />
            <Text className="mt-4 text-base font-semibold text-foreground">Support Chat</Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              {isAdmin
                ? 'No messages yet. Reply to this ticket below.'
                : 'Send a message to get help. Our team will respond here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            keyExtractor={(item) => item.message.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <MessageBubble
                message={item.message}
                isOwn={item.message.sender_id === profile?.id}
                showDate={item.showDate}
                dateLabel={item.dateLabel}
              />
            )}
          />
        )}

        {/* Input bar */}
        {!loading && (
          <View className="border-t border-border bg-background px-4 py-3">
            {isResolved ? (
              <View className="items-center rounded-xl bg-muted py-3">
                <Text className="text-sm text-muted-foreground">
                  This ticket has been resolved and is now read-only.
                </Text>
              </View>
            ) : (
              <View className="flex-row items-end gap-2">
                <TextInput
                  className="max-h-28 min-h-[40px] flex-1 rounded-2xl border border-input bg-card px-4 py-2.5 text-sm text-foreground"
                  placeholder="Type a message…"
                  placeholderTextColor={c.mutedForeground}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  blurOnSubmit={false}
                />
                <Pressable
                  onPress={sendMessage}
                  disabled={!input.trim() || sending}
                  className="h-10 w-10 items-center justify-center rounded-full bg-primary disabled:opacity-40"
                >
                  {sending ? (
                    <ActivityIndicator color={c.primaryForeground} size="small" />
                  ) : (
                    <Send size={16} color={c.primaryForeground} />
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
