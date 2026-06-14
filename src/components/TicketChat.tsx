import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { setActiveTicketId } from '@/lib/activeTicket';

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'resolved';
  created_at: string;
  users?: { full_name: string | null; email: string } | null;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'admin' | 'user';
  message: string;
  created_at: string;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface Props {
  ticket: SupportTicket;
  currentUserId: string;
  isAdmin: boolean;
  onResolved?: () => void;
  onBack?: () => void;
}

export default function TicketChat({ ticket, currentUserId, isAdmin, onResolved, onBack }: Props) {
  const { toast } = useToast();
  const [ticketStatus, setTicketStatus] = useState<'open' | 'resolved'>(ticket.status);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTicketStatus(ticket.status);
  }, [ticket.status]);

  // Signal to NotificationBell which ticket is currently open
  useEffect(() => {
    setActiveTicketId(ticket.id);
    return () => { setActiveTicketId(null); };
  }, [ticket.id]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as TicketMessage[]);
    setLoading(false);
  }, [ticket.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
  }, [loadMessages]);

  // Realtime: new messages for this ticket
  useEffect(() => {
    const channel = supabase
      .channel(`ticket-msgs-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const msg = payload.new as TicketMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            new Audio('/notification.mp3').play().catch(() => {});
            return [...prev, msg];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticket.id]);

  // Realtime: ticket status changes (e.g., admin resolves while user is viewing)
  useEffect(() => {
    const channel = supabase
      .channel(`ticket-status-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${ticket.id}`,
        },
        (payload) => {
          const updated = payload.new as SupportTicket;
          setTicketStatus(updated.status);
          if (updated.status === 'resolved') {
            onResolved?.();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticket.id, onResolved]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [draft]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending || ticketStatus === 'resolved') return;
    setSending(true);
    setDraft('');

    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: currentUserId,
      sender_role: isAdmin ? 'admin' : 'user',
      message: text,
    });

    if (error) {
      toast.error(error.message);
      setDraft(text);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  async function handleResolve() {
    setResolving(true);
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: 'resolved' })
      .eq('id', ticket.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Ticket marked as resolved.');
      setTicketStatus('resolved');
      onResolved?.();
    }
    setResolving(false);
  }

  const isLocked = ticketStatus === 'resolved';

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to tickets"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{ticket.subject}</p>
          <div className="flex items-center gap-2">
            {ticket.users && (
              <p className="truncate text-xs text-muted-foreground">
                {ticket.users.full_name ?? ticket.users.email}
              </p>
            )}
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                isLocked
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-green-500/10 text-green-600 dark:text-green-400',
              )}
            >
              {isLocked ? 'Resolved' : 'Open'}
            </span>
          </div>
        </div>
        {isAdmin && !isLocked && (
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolving}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {resolving ? 'Resolving…' : 'Mark Resolved'}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            {!isLocked && (
              <p className="mt-1 text-xs text-muted-foreground/60">
                {isAdmin
                  ? 'Reply below to start the conversation.'
                  : 'Send a message to get help.'}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isOwn = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
                >
                  <div className="max-w-[76%]">
                    <p
                      className={cn(
                        'mb-1 text-[10px] font-semibold uppercase tracking-wider',
                        isOwn
                          ? 'text-right text-primary/60'
                          : 'text-left text-muted-foreground/60',
                      )}
                    >
                      {isOwn ? 'You' : msg.sender_role === 'admin' ? 'Support' : 'User'}
                    </p>
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                        'whitespace-pre-wrap break-words',
                        isOwn
                          ? 'rounded-tr-sm bg-primary text-primary-foreground'
                          : 'rounded-tl-sm bg-muted text-foreground',
                      )}
                    >
                      {msg.message}
                    </div>
                    <p
                      className={cn(
                        'mt-1 text-[10px] text-muted-foreground/50',
                        isOwn ? 'text-right' : 'text-left',
                      )}
                    >
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t bg-card px-4 py-3">
        {isLocked ? (
          <p className="py-1 text-center text-xs text-muted-foreground">
            This ticket has been resolved and is now read-only.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message… (Shift+Enter for newline)"
              rows={1}
              disabled={sending}
              className={cn(
                'flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm',
                'text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'max-h-28 overflow-y-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              )}
              style={{ height: '36px' }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
