import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, CheckCheck, Loader2, Send } from 'lucide-react';
import { supabase, formatTime } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import { cn } from '@layk/core';
import { setActiveTicketId } from '@/lib/activeTicket';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

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

interface Props {
  ticket: SupportTicket;
  currentUserId: string;
  isAdmin: boolean;
  onResolved?: () => void;
  onBack?: () => void;
  /** The chat reaches the bottom screen edge (admin full-height view): pad for the home indicator. */
  safeAreaBottom?: boolean;
}

function fetchTicketMessages(ticketId: string) {
  return supabase
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .then(({ data, error }) => ({ data: data as TicketMessage[] | null, error }));
}

// Within this distance of the bottom the reader counts as "following" the conversation.
const FOLLOW_THRESHOLD_PX = 80;

export default function TicketChat({ ticket, currentUserId, isAdmin, onResolved, onBack, safeAreaBottom = false }: Props) {
  const { toast } = useToast();
  const [ticketStatus, setTicketStatus] = useState<'open' | 'resolved'>(ticket.status);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const renderedCountRef = useRef(0);
  // Message ids already shown — lets the Realtime handler dedupe without side effects in a state updater.
  const seenIdsRef = useRef(new Set<string>());

  // Follow status changes pushed down by the parent (its list also listens to Realtime),
  // while still allowing the local "resolved" update below. Adjusted during render, not in an effect.
  const [prevTicketStatus, setPrevTicketStatus] = useState(ticket.status);
  if (ticket.status !== prevTicketStatus) {
    setPrevTicketStatus(ticket.status);
    setTicketStatus(ticket.status);
  }

  // Signal to NotificationBell which ticket is currently open
  useEffect(() => {
    setActiveTicketId(ticket.id);
    return () => { setActiveTicketId(null); };
  }, [ticket.id]);

  const applyLoaded = useCallback((data: TicketMessage[] | null, error: { message: string } | null) => {
    const list = data ?? [];
    list.forEach((m) => seenIdsRef.current.add(m.id));
    setLoadError(error ? error.message : null);
    setMessages(list);
    setLoading(false);
  }, []);

  // Initial load. Both parents key this component by ticket id, so a different ticket
  // means a fresh mount (fresh state), not a re-run of this effect.
  useEffect(() => {
    let ignore = false;
    fetchTicketMessages(ticket.id).then(({ data, error }) => {
      if (!ignore) applyLoaded(data, error);
    });
    return () => { ignore = true; };
  }, [ticket.id, applyLoaded]);

  function retryLoad() {
    setLoading(true);
    fetchTicketMessages(ticket.id).then(({ data, error }) => applyLoaded(data, error));
  }

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
          if (seenIdsRef.current.has(msg.id)) return;
          seenIdsRef.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
          // Our own messages come back through Realtime too: no sound, no "new message" pill for those.
          if (msg.sender_id === currentUserId) return;
          new Audio('/notification.mp3').play().catch(() => {});
          // Reading older messages: don't yank the view, count it instead.
          if (!followingRef.current) setUnseen((n) => n + 1);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticket.id, currentUserId]);

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

  // Follow new messages only on first load, when already at the bottom, or for our own message.
  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    const firstRender = renderedCountRef.current === 0;
    const last = messages[messages.length - 1];
    if (firstRender || followingRef.current || last?.sender_id === currentUserId) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstRender ? 'auto' : 'smooth' });
    }
    renderedCountRef.current = messages.length;
  }, [messages, loading, currentUserId]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
    if (followingRef.current && unseen) setUnseen(0);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    followingRef.current = true;
    setUnseen(0);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

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
    setSendError(null);
    setDraft('');
    followingRef.current = true;

    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: currentUserId,
      sender_role: isAdmin ? 'admin' : 'user',
      message: text,
    });

    if (error) {
      // Keep what was written and say so next to the composer (toasts are easy to miss).
      setSendError(`Mesaj gönderilemedi: ${error.message}. Mesajınız korunuyor; tekrar deneyin.`);
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
      toast.success('Talep çözüldü olarak işaretlendi.');
      setTicketStatus('resolved');
      onResolved?.();
    }
    setResolving(false);
    setConfirmResolve(false);
  }

  const isLocked = ticketStatus === 'resolved';
  const requester = ticket.users;

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-card px-2 py-2 sm:gap-3 sm:px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Taleplere dön"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground md:h-9 md:w-9 md:pointer-coarse:h-11 md:pointer-coarse:w-11"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
        <div className={cn('min-w-0 flex-1', !onBack && 'pl-2 sm:pl-0')}>
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground">{ticket.subject}</p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {requester && (
              <p className="min-w-0 truncate text-xs text-muted-foreground" title={requester.email}>
                {requester.full_name ?? requester.email}
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
              {isLocked ? 'Çözüldü' : 'Açık'}
            </span>
          </div>
        </div>
        {isAdmin && !isLocked && (
          <button
            type="button"
            onClick={() => setConfirmResolve(true)}
            disabled={resolving}
            aria-label="Talebi çözüldü olarak işaretle"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:pointer-coarse:h-11"
          >
            <CheckCheck className="h-4 w-4 text-success" aria-hidden />
            <span className="sm:hidden">Çöz</span>
            <span className="hidden sm:inline">{resolving ? 'Çözülüyor…' : 'Çözüldü işaretle'}</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16" aria-busy="true">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              <span className="sr-only">Mesajlar yükleniyor</span>
            </div>
          ) : loadError ? (
            <div role="alert" className="mx-auto max-w-xs py-12 text-center">
              <p className="text-sm text-foreground">Mesajlar yüklenemedi.</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{loadError}</p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-3 h-11 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Tekrar dene
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">Henüz mesaj yok.</p>
              {!isLocked && (
                <p className="mt-1 text-xs text-muted-foreground/60">
                  {isAdmin
                    ? 'Görüşmeyi başlatmak için aşağıdan yanıt verin.'
                    : 'Yardım almak için bir mesaj gönderin.'}
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
                    <div className="min-w-0 max-w-[85%] sm:max-w-[76%]">
                      <p
                        className={cn(
                          'mb-1 text-[10px] font-semibold uppercase tracking-wider',
                          isOwn
                            ? 'text-right text-primary/60'
                            : 'text-left text-muted-foreground/60',
                        )}
                      >
                        {isOwn ? 'Siz' : msg.sender_role === 'admin' ? 'Destek' : 'Kullanıcı'}
                      </p>
                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                          // anywhere (not break-word) so long links/tokens shrink the bubble's min width too
                          'whitespace-pre-wrap [overflow-wrap:anywhere]',
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
            </div>
          )}
        </div>

        {unseen > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-4 text-sm font-medium text-foreground shadow-md transition-colors hover:bg-muted"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
            {unseen === 1 ? 'Yeni mesaj' : `${unseen} yeni mesaj`}
          </button>
        )}
      </div>

      {/* Input */}
      <div className={cn('shrink-0 border-t bg-card px-3 pt-3 sm:px-4', safeAreaBottom ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'pb-3')}>
        {isLocked ? (
          <p className="py-1 text-center text-xs text-muted-foreground">
            Bu talep çözüldü ve artık salt okunur.
          </p>
        ) : (
          <>
            {sendError && (
              <p role="alert" className="mb-2 break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {sendError}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(null); }}
                onKeyDown={(e) => {
                  // Enter sends with a hardware keyboard; touch keyboards keep Enter for new lines.
                  const touch = window.matchMedia('(pointer: coarse)').matches;
                  if (e.key === 'Enter' && !e.shiftKey && !touch) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                aria-label="Mesaj"
                placeholder="Bir mesaj yazın…"
                rows={1}
                // readOnly (not disabled) while sending: disabling would blur the field and drop the phone keyboard.
                readOnly={sending}
                aria-busy={sending || undefined}
                className={cn(
                  'min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-base sm:py-2 sm:text-sm',
                  'text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  'read-only:opacity-60',
                  'max-h-28 overflow-y-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                )}
                style={{ height: '44px' }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
                aria-label={sending ? 'Gönderiliyor' : 'Mesaj gönder'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            <p className="mt-1.5 hidden text-[11px] text-muted-foreground pointer-fine:block">
              Göndermek için Enter, yeni satır için Shift+Enter.
            </p>
          </>
        )}
      </div>

      {confirmResolve && (
        <ConfirmDialog
          title="Talep çözüldü olarak işaretlensin mi?"
          confirmLabel="Çözüldü işaretle"
          tone="primary"
          busy={resolving}
          onConfirm={handleResolve}
          onCancel={() => setConfirmResolve(false)}
        >
          <p>Görüşme kapanır ve salt okunur olur; kullanıcı bu talebe yeni mesaj gönderemez.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
