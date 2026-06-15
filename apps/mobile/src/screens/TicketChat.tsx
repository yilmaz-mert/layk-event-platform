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
import type { Conversation, Message } from '../types';

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
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isToday) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

// ── Message bubble ─────────────────────────────────────────────────────────────

interface BubbleProps {
  message: Message;
  isOwn: boolean;
  showDate: boolean;
  dateLabel: string;
}

function MessageBubble({ message, isOwn, showDate, dateLabel }: BubbleProps) {
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
          {!isOwn && (
            <Text className="mb-1 text-xs font-semibold text-muted-foreground">
              {message.sender_name ?? 'Support'}
            </Text>
          )}
          <Text className={`text-sm leading-relaxed ${isOwn ? 'text-primary-foreground' : 'text-foreground'}`}>
            {message.content}
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

function StatusBadge({ status }: { status: Conversation['status'] }) {
  const config = {
    open:        { label: 'Open',        className: 'bg-primary/10',       textClass: 'text-primary' },
    in_progress: { label: 'In Progress', className: 'bg-yellow-500/10',    textClass: 'text-yellow-600' },
    resolved:    { label: 'Resolved',    className: 'bg-green-500/10',     textClass: 'text-green-600' },
    closed:      { label: 'Closed',      className: 'bg-muted',            textClass: 'text-muted-foreground' },
  }[status] ?? { label: status, className: 'bg-muted', textClass: 'text-muted-foreground' };

  return (
    <View className={`rounded-full px-3 py-1 ${config.className}`}>
      <Text className={`text-xs font-semibold ${config.textClass}`}>{config.label}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

interface Props {
  // ticketId: direct conversation lookup (Support screen, Admin portal)
  // reservationId: find-or-create via booking key embedded in subject (MyBookings)
  ticketId?: string;
  reservationId?: string;
  title: string;
  isAdmin?: boolean;
  onBack: () => void;
}

export default function TicketChat({ ticketId, reservationId, title, isAdmin = false, onBack }: Props) {
  const { profile } = useAuthMobile();
  const c = useColors();
  const [ticket, setTicket] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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

    let foundTicket: Conversation | null = null;

    if (ticketId) {
      const { data } = await supabase
        .from('conversations')
        .select('id, status, created_at, subject, user_id')
        .eq('id', ticketId)
        .maybeSingle();
      foundTicket = data as Conversation | null;
    } else if (reservationId) {
      // Embed the reservationId in the subject so we can look it up deterministically.
      // conversations table has no reservation_id column, so this is our 1:1 key.
      const lookupSubject = `booking:${reservationId}`;

      const { data: existing } = await supabase
        .from('conversations')
        .select('id, status, created_at, subject, user_id')
        .eq('user_id', profile?.id)
        .eq('subject', lookupSubject)
        .maybeSingle();

      if (existing) {
        foundTicket = existing as Conversation;
      } else {
        const { data: created } = await supabase
          .from('conversations')
          .insert({ user_id: profile?.id, subject: lookupSubject, status: 'open' })
          .select('id, status, created_at, subject, user_id')
          .single();
        foundTicket = created as Conversation | null;
      }
    }

    if (!foundTicket) {
      if (isMounted.current) setLoading(false);
      return;
    }

    if (isMounted.current) setTicket(foundTicket);
    await fetchMessages(foundTicket.id);
    subscribeToMessages(foundTicket.id);
  }

  async function fetchMessages(tId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at, users!messages_sender_id_fkey(full_name)')
      .eq('conversation_id', tId)
      .order('created_at', { ascending: true });

    if (!isMounted.current) return;
    if (!error) {
      const mapped: Message[] = (data ?? []).map((row: any) => ({
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        content: row.content,
        created_at: row.created_at,
        sender_name: row.users?.full_name ?? null,
      }));
      setMessages(mapped);
    }
    setLoading(false);
  }

  function subscribeToMessages(tId: string) {
    channelRef.current?.unsubscribe();

    // On INSERT, refetch so the sender name join is included.
    const channel = supabase
      .channel(`conv-messages:${tId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${tId}`,
        },
        () => {
          if (isMounted.current) {
            void fetchMessages(tId);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
          }
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

    const { error } = await supabase.from('messages').insert({
      conversation_id: ticket.id,
      sender_id: profile.id,
      content,
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
            .from('conversations')
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

  // ── Date-separated FlatList items ──────────────────────────────────────────

  interface ListItem {
    message: Message;
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

  const isClosed = ticket?.status === 'resolved' || ticket?.status === 'closed';
  const canResolve = isAdmin && ticket && (ticket.status === 'open' || ticket.status === 'in_progress');

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

        {/* Messages */}
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
            {isClosed ? (
              <View className="items-center rounded-xl bg-muted py-3">
                <Text className="text-sm text-muted-foreground">
                  This ticket is {ticket?.status}.
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
                  onSubmitEditing={sendMessage}
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
