import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import type { SupportTicket, TicketMessage } from '../types';
import { colors } from '../colors';

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
  message: TicketMessage;
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

// ── Ticket status badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SupportTicket['status'] }) {
  const config = {
    open: { label: 'Open', className: 'bg-primary/10', textClass: 'text-primary' },
    in_progress: { label: 'In Progress', className: 'bg-yellow-500/10', textClass: 'text-yellow-600' },
    resolved: { label: 'Resolved', className: 'bg-green-500/10', textClass: 'text-green-600' },
    closed: { label: 'Closed', className: 'bg-muted', textClass: 'text-muted-foreground' },
  }[status] ?? { label: status, className: 'bg-muted', textClass: 'text-muted-foreground' };

  return (
    <View className={`rounded-full px-3 py-1 ${config.className}`}>
      <Text className={`text-xs font-semibold ${config.textClass}`}>{config.label}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

interface Props {
  reservationId: string;
  eventTitle: string;
  onBack: () => void;
}

export default function TicketChat({ reservationId, eventTitle, onBack }: Props) {
  const { profile } = useAuthMobile();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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
  }, [reservationId]);

  async function initTicket() {
    setLoading(true);

    // Try to find existing ticket for this reservation
    const { data: existingTicket } = await supabase
      .from('support_tickets')
      .select('id, status, created_at')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    let ticketId: string;

    if (existingTicket) {
      ticketId = existingTicket.id;
      if (isMounted.current) setTicket(existingTicket as SupportTicket);
    } else {
      // Auto-create a ticket when the user opens chat for the first time
      const { data: newTicket, error: createError } = await supabase
        .from('support_tickets')
        .insert({ reservation_id: reservationId, user_id: profile?.id, status: 'open' })
        .select('id, status, created_at')
        .single();

      if (createError || !newTicket) {
        if (isMounted.current) setLoading(false);
        return;
      }
      ticketId = newTicket.id;
      if (isMounted.current) setTicket(newTicket as SupportTicket);
    }

    await fetchMessages(ticketId);
    subscribeToMessages(ticketId);
  }

  async function fetchMessages(ticketId: string) {
    const { data, error } = await supabase
      .from('ticket_messages')
      .select('id, ticket_id, sender_id, sender_name, content, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (!isMounted.current) return;
    if (!error) setMessages((data ?? []) as TicketMessage[]);
    setLoading(false);
  }

  function subscribeToMessages(ticketId: string) {
    channelRef.current?.unsubscribe();

    const channel = supabase
      .channel(`ticket-messages:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          if (!isMounted.current) return;
          const newMsg = payload.new as TicketMessage;
          setMessages((prev) => {
            // Deduplicate
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
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
      sender_name: profile.full_name ?? profile.email,
      content,
    });

    if (error) {
      // Restore input on failure so user doesn't lose their message
      setInput(content);
    }
    setSending(false);
  }

  // ── Build date-separated items for FlatList ───────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const isClosed = ticket?.status === 'resolved' || ticket?.status === 'closed';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Pressable onPress={onBack} className="p-1">
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {eventTitle}
            </Text>
            <Text className="text-xs text-muted-foreground">Support Chat</Text>
          </View>
          {ticket && <StatusBadge status={ticket.status} />}
        </View>

        {/* Messages */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <MessageCircle size={48} color={colors.mutedForeground} strokeWidth={1} />
            <Text className="mt-4 text-base font-semibold text-foreground">
              Support Chat
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Send a message to get help with your reservation. Our team will respond here.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            keyExtractor={(item) => item.message.id}
            contentContainerClassName="px-4 py-4"
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
                <Text className="text-sm text-muted-foreground">This ticket is {ticket?.status}.</Text>
              </View>
            ) : (
              <View className="flex-row items-end gap-2">
                <TextInput
                  className="max-h-28 min-h-[40px] flex-1 rounded-2xl border border-input bg-card px-4 py-2.5 text-sm text-foreground"
                  placeholder="Type a message…"
                  placeholderTextColor={colors.mutedForeground}
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
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Send size={16} color={colors.primaryForeground} />
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
