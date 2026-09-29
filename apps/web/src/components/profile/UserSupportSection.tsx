import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LifeBuoy, Loader2, MessageCircle, Plus, X } from 'lucide-react';
import { supabase, formatShortDate, cn } from '@layk/core';
import { useToast } from '@/hooks/useToast';
import TicketChat, { type SupportTicket } from '@/components/TicketChat';

/**
 * The user's support tickets: list, "new ticket" form and the chat for the selected ticket.
 * Mounted only while the support tab is open, so its query and Realtime channel don't run
 * on the profile tab. `?ticketId=` (from notification links) opens that ticket.
 */
export default function UserSupportSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);

  // A new deep link (e.g. tapping another notification while this tab is open) wins over the
  // current pick. Adjusting state during render, instead of in an effect, avoids a stale frame.
  const deepLinkId = searchParams.get('ticketId');
  const [seenDeepLinkId, setSeenDeepLinkId] = useState(deepLinkId);
  if (deepLinkId !== seenDeepLinkId) {
    setSeenDeepLinkId(deepLinkId);
    setPickedId(null);
  }
  const selectedId = pickedId ?? (deepLinkId && tickets.some((t) => t.id === deepLinkId) ? deepLinkId : null);
  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  /** Picking or leaving a ticket also drops ?ticketId, so a refresh doesn't reopen it. */
  function select(id: string | null) {
    setPickedId(id);
    if (deepLinkId) setSearchParams({ tab: 'support' }, { replace: true });
  }

  useEffect(() => {
    let ignore = false; // the tab can close before the request resolves
    supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (ignore) return;
        setTickets((data ?? []) as SupportTicket[]);
        setTicketsLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  // Realtime: status updates (e.g. an admin resolves a ticket while the user is viewing).
  // The channel is removed on unmount, i.e. when the user leaves the support tab.
  useEffect(() => {
    const channel = supabase
      .channel('profile-support-tickets')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
        (payload) => {
          const updated = payload.new as SupportTicket;
          setTickets((prev) =>
            prev.map((t) => (t.id === updated.id ? { ...t, status: updated.status } : t)),
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleCreateTicket(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('support_tickets')
      .insert({ user_id: userId, subject: subject.trim() })
      .select('*')
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      const ticket = data as SupportTicket;
      setTickets((prev) => [ticket, ...prev]);
      setSubject('');
      setShowForm(false);
      select(ticket.id);
    }
    setCreating(false);
  }

  const handleResolved = useCallback(() => {
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, status: 'resolved' as const } : t)),
    );
  }, [selectedId]);

  return (
    <div className="flex h-[60vh] overflow-hidden rounded-xl border">
      {/* Left: ticket list */}
      <aside
        className={cn(
          'flex flex-col border-r',
          selectedTicket
            ? 'hidden md:flex md:w-64 lg:w-72'
            : 'flex w-full md:w-64 lg:w-72',
        )}
      >
        {/* List header */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Taleplerim</span>
          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setSubject(''); }}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
              showForm
                ? 'bg-muted text-foreground'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            {showForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {showForm ? 'Vazgeç' : 'Yeni'}
          </button>
        </div>

        {/* New ticket form */}
        {showForm && (
          <div className="shrink-0 border-b bg-muted/30 p-3">
            <form onSubmit={handleCreateTicket} className="space-y-2">
              <input
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Sorununuzu açıklayın…"
                required
                maxLength={200}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={creating || !subject.trim()}
                className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Açılıyor…' : 'Talep Aç'}
              </button>
            </form>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {ticketsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <MessageCircle className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Henüz talep yok</p>
              <p className="text-xs text-muted-foreground/60">
                Yeni bir talep açmak için &quot;Yeni&quot;ye tıklayın.
              </p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => select(ticket.id)}
                className={cn(
                  'w-full border-b px-4 py-3 text-left transition last:border-0 hover:bg-muted/50',
                  selectedId === ticket.id && 'bg-primary/5',
                )}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {ticket.subject}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatShortDate(ticket.created_at)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[10px] font-semibold',
                      ticket.status === 'open'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {ticket.status === 'open' ? 'Açık' : 'Çözüldü'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Right: chat or empty state */}
      {selectedTicket ? (
        <div className="flex flex-1">
          <TicketChat
            key={selectedTicket.id}
            ticket={selectedTicket}
            currentUserId={userId}
            isAdmin={false}
            onResolved={handleResolved}
            onBack={() => select(null)}
          />
        </div>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center md:flex">
          <LifeBuoy className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Görüntülemek için bir talep seçin
          </p>
        </div>
      )}
    </div>
  );
}
