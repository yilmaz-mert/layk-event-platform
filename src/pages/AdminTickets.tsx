import { useCallback, useEffect, useState } from 'react';
import { Headphones, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import TicketChat, { type SupportTicket } from '@/components/TicketChat';

type StatusFilter = 'open' | 'resolved' | 'all';

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export default function AdminTickets() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  const loadTickets = useCallback(async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*, users!support_tickets_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Realtime: new tickets + status changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-support-tickets')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_tickets' },
        loadTickets, // refetch to hydrate the users join
      )
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
  }, [loadTickets]);

  function handleResolved() {
    if (!selectedId) return;
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, status: 'resolved' as const } : t)),
    );
  }

  const filteredTickets =
    statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter);

  const tabs: { label: string; value: StatusFilter; count: number }[] = [
    { label: 'Open', value: 'open', count: tickets.filter((t) => t.status === 'open').length },
    {
      label: 'Resolved',
      value: 'resolved',
      count: tickets.filter((t) => t.status === 'resolved').length,
    },
    { label: 'All', value: 'all', count: tickets.length },
  ];

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Left panel: ticket list ── */}
      <aside
        className={cn(
          'flex w-full flex-col border-r md:w-72 lg:w-80',
          selectedTicket ? 'hidden md:flex' : 'flex',
        )}
      >
        {/* Panel header + filter tabs */}
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <h1 className="font-semibold text-foreground">Support Tickets</h1>
          </div>
          <div className="mt-3 flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  statusFilter === tab.value
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10px] font-bold',
                    statusFilter === tab.value
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No {statusFilter !== 'all' ? statusFilter : ''} tickets
              </p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const userName =
                ticket.users?.full_name ?? ticket.users?.email ?? 'Unknown user';
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={cn(
                    'w-full border-b px-4 py-3 text-left transition last:border-0 hover:bg-muted/50',
                    selectedId === ticket.id && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {ticket.subject}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
                        ticket.status === 'open'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {ticket.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{userName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                    {formatDate(ticket.created_at)}
                  </p>
                </button>
              );
            })
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
            isAdmin={true}
            onResolved={handleResolved}
            onBack={() => setSelectedId(null)}
          />
        </div>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center md:flex">
          <Headphones className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Select a ticket to view the conversation
          </p>
        </div>
      )}
    </div>
  );
}
