import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ChevronRight, Headphones, MessageSquare } from 'lucide-react';
import { supabase, formatShortDate, formatTime } from '@layk/core';
import { useAuth } from '@layk/core';
import { cn } from '@layk/core';
import TicketChat, { type SupportTicket } from '@/components/TicketChat';
import FilterTabs from '@/components/admin/FilterTabs';

type StatusFilter = 'open' | 'resolved' | 'all';

const filterLabels: Record<StatusFilter, string> = { open: 'Açık', resolved: 'Çözüldü', all: 'Tümü' };

/**
 * Height of the sticky admin header, kept in sync with its real size (it differs between
 * phone, desktop and touch sizes), so the list + chat fill exactly the rest of the screen.
 */
function useHeaderHeight() {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const update = () => setHeight(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return height;
}

function queryTickets() {
  return supabase
    .from('support_tickets')
    .select('*, users!support_tickets_user_id_fkey(full_name, email)')
    .order('created_at', { ascending: false });
}

function ticketWhen(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatTime(iso) : formatShortDate(iso);
}

export default function AdminTickets() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headerHeight = useHeaderHeight();

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  const applyTickets = useCallback(({ data, error }: Awaited<ReturnType<typeof queryTickets>>) => {
    setLoadError(error ? error.message : null);
    if (!error) setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  }, []);

  // Also used by the Realtime INSERT handler to hydrate the users join for new tickets.
  const loadTickets = useCallback(() => queryTickets().then(applyTickets), [applyTickets]);

  useEffect(() => {
    let ignore = false; // the page can unmount before the request resolves
    queryTickets().then((r) => { if (!ignore) applyTickets(r); });
    return () => { ignore = true; };
  }, [applyTickets]);

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

  const handleResolved = useCallback(() => {
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, status: 'resolved' as const } : t)),
    );
  }, [selectedId]);

  const filteredTickets =
    statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter);

  const counts: Record<StatusFilter, number> = {
    open: tickets.filter((t) => t.status === 'open').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    all: tickets.length,
  };

  const emptyStateLabel: Record<StatusFilter, string> = {
    open: 'Açık talep yok. Yeni talepler burada görünecek.',
    resolved: 'Çözülmüş talep yok.',
    all: 'Henüz destek talebi yok.',
  };

  return (
    <div
      className="flex overflow-hidden"
      // Fill the screen below the header; dvh follows the iOS toolbars.
      style={{ height: headerHeight ? `calc(100dvh - ${headerHeight}px)` : 'calc(100dvh - 3.75rem)' }}
    >
      {/* ── Left panel: ticket list ── */}
      <aside
        className={cn(
          'min-w-0 flex-col border-r md:flex md:w-80 md:shrink-0',
          selectedTicket ? 'hidden' : 'flex w-full',
        )}
      >
        <div className="shrink-0 space-y-3 border-b px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Destek</h1>
          <FilterTabs
            label="Talep durumu"
            options={['open', 'resolved', 'all'] as const}
            value={statusFilter}
            labels={filterLabels}
            counts={counts}
            onChange={setStatusFilter}
          />
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <ul aria-busy="true" aria-label="Talepler yükleniyor">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="animate-pulse space-y-2 border-b px-4 py-3">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : loadError ? (
            <div role="alert" className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Talepler yüklenemedi</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{loadError}</p>
              <button
                type="button"
                onClick={() => { setLoading(true); loadTickets(); }}
                className="mt-4 h-11 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Tekrar dene
              </button>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">{emptyStateLabel[statusFilter]}</p>
            </div>
          ) : (
            <ul>
              {filteredTickets.map((ticket) => {
                const user = ticket.users;
                const userName = user?.full_name ?? user?.email ?? 'Bilinmeyen kullanıcı';
                const selected = selectedId === ticket.id;
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      aria-current={selected || undefined}
                      className={cn(
                        'flex w-full items-start gap-2 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        selected && 'bg-muted',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 min-w-0 break-words text-sm font-medium text-foreground">{ticket.subject}</span>
                          <time dateTime={ticket.created_at} className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                            {ticketWhen(ticket.created_at)}
                          </time>
                        </span>
                        <span className="mt-1 flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium',
                              ticket.status === 'open' ? 'text-success' : 'text-muted-foreground',
                            )}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            {ticket.status === 'open' ? 'Açık' : 'Çözüldü'}
                          </span>
                          <span className="min-w-0 truncate text-xs text-muted-foreground" title={user?.email}>{userName}</span>
                        </span>
                      </span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground md:hidden" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Right panel: chat ── */}
      {selectedTicket ? (
        <div className="flex min-w-0 flex-1">
          <TicketChat
            key={selectedTicket.id}
            ticket={selectedTicket}
            currentUserId={profile!.id}
            isAdmin={true}
            onResolved={handleResolved}
            onBack={() => setSelectedId(null)}
            safeAreaBottom
          />
        </div>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-2 px-6 text-center md:flex">
          <Headphones className="h-10 w-10 text-muted-foreground/30" aria-hidden />
          <p className="text-sm text-muted-foreground">Yanıtlamak için soldan bir talep seçin.</p>
        </div>
      )}
    </div>
  );
}
