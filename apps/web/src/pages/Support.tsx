import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LifeBuoy, Loader2, MessageCircle, Plus, X } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
import { useToast } from '@/components/Toast';
import { cn } from '@layk/core';
import TicketChat, { type SupportTicket } from '@/components/TicketChat';

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export default function Support() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  const loadTickets = useCallback(async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Realtime: ticket status changes (e.g., admin resolves a ticket)
  useEffect(() => {
    const channel = supabase
      .channel('my-support-tickets')
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !profile) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('support_tickets')
      .insert({ user_id: profile.id, subject: subject.trim() })
      .select('*')
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      const ticket = data as SupportTicket;
      setTickets((prev) => [ticket, ...prev]);
      setSubject('');
      setShowForm(false);
      setSelectedId(ticket.id);
    }
    setCreating(false);
  }

  function handleResolved() {
    if (!selectedId) return;
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, status: 'resolved' as const } : t)),
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Left panel: ticket list ── */}
      <aside
        className={cn(
          'flex w-full flex-col border-r md:w-72 lg:w-80',
          selectedTicket ? 'hidden md:flex' : 'flex',
        )}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-primary" />
            <h1 className="font-semibold text-foreground">Support</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setSubject('');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              showForm
                ? 'bg-muted text-foreground'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'New Ticket'}
          </button>
        </div>

        {/* New ticket inline form */}
        {showForm && (
          <div className="shrink-0 border-b bg-muted/30 p-4">
            <form onSubmit={handleCreate} className="space-y-2">
              <input
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Describe your issue briefly…"
                required
                maxLength={200}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={creating || !subject.trim()}
                className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Opening…' : 'Open Ticket'}
              </button>
            </form>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No support tickets yet</p>
              <p className="text-xs text-muted-foreground/60">
                Click &quot;New Ticket&quot; to contact support.
              </p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                className={cn(
                  'w-full border-b px-4 py-3 text-left transition last:border-0 hover:bg-muted/50',
                  selectedId === ticket.id && 'bg-primary/5',
                )}
              >
                <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(ticket.created_at)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[10px] font-semibold',
                      ticket.status === 'open'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {ticket.status === 'open' ? 'Open' : 'Resolved'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right panel: chat ── */}
      {selectedTicket ? (
        <div className="flex flex-1">
          <TicketChat
            key={selectedTicket.id}
            ticket={selectedTicket}
            currentUserId={profile!.id}
            isAdmin={false}
            onResolved={handleResolved}
            onBack={() => setSelectedId(null)}
          />
        </div>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center md:flex">
          <LifeBuoy className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Select a ticket to view the conversation
          </p>
        </div>
      )}
    </div>
  );
}
