import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LifeBuoy, Loader2, MessageCircle, Plus, User, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import TicketChat, { type SupportTicket } from '@/components/TicketChat';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'focus:ring-offset-1 transition';

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export default function UserProfile() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') === 'support' ? 'support' : 'profile';

  // ── Profile form state ─────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Support ticket state ───────────────────────────────────────────────────
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  // ── Profile data ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (profile?.id) fetchProfile(profile.id);
  }, [profile?.id]);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('full_name, phone_number')
      .eq('id', userId)
      .single();
    if (data) {
      setFullName(data.full_name ?? '');
      setPhoneNumber(data.phone_number ?? '');
    }
    setProfileLoading(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile?.id) return;
    setSaving(true);

    const trimmedName = fullName.trim() || null;
    const trimmedPhone = phoneNumber.trim() || null;

    const { error } = await supabase
      .from('users')
      .update({ full_name: trimmedName, phone_number: trimmedPhone })
      .eq('id', profile.id);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    await supabase.auth.updateUser({ data: { full_name: trimmedName, phone_number: trimmedPhone } });
    await fetchProfile(profile.id);
    toast.success('Profile updated.');
    setSaving(false);
  }

  // ── Support ticket data ────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    setTickets((data ?? []) as SupportTicket[]);
    setTicketsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab !== 'support') return;
    loadTickets();
  }, [activeTab, loadTickets]);

  // Deep-link: reactively open the ticket identified by ?ticketId= in the URL
  useEffect(() => {
    const ticketId = searchParams.get('ticketId');
    if (activeTab !== 'support' || !ticketId || tickets.length === 0) return;
    if (tickets.some((t) => t.id === ticketId)) {
      setSelectedId(ticketId);
      setSearchParams({ tab: 'support' }, { replace: true });
    }
  }, [searchParams, activeTab, tickets, setSearchParams]);

  // Realtime: status updates (e.g., admin resolves a ticket while user is viewing)
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

  // ── Tab navigation ─────────────────────────────────────────────────────────
  function openProfileTab() { setSearchParams({}, { replace: true }); }
  function openSupportTab() { setSearchParams({ tab: 'support' }, { replace: true }); }

  return (
    <main
      className={cn(
        'mx-auto px-4 pb-16 pt-6 transition-[max-width]',
        activeTab === 'support' ? 'max-w-4xl' : 'max-w-lg',
      )}
    >
      {/* ── Page header ── */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          {activeTab === 'support' ? (
            <LifeBuoy className="h-5 w-5 text-primary" />
          ) : (
            <User className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">
            {activeTab === 'support' ? 'Support Tickets' : 'My Profile'}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="mb-6 flex border-b">
        <button
          type="button"
          onClick={openProfileTab}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition',
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <User className="h-4 w-4" />
          My Profile
        </button>
        <button
          type="button"
          onClick={openSupportTab}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition',
            activeTab === 'support'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <LifeBuoy className="h-4 w-4" />
          Support Tickets
        </button>
      </div>

      {/* ── Profile tab ── */}
      {activeTab === 'profile' && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {profileLoading ? (
            <div className="animate-pulse space-y-5">
              {[80, 160, 80, 160, 80, 160, 96].map((w, i) => (
                <div
                  key={i}
                  className="rounded bg-muted"
                  style={{ height: i % 2 === 0 ? '16px' : '42px', width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input
                  type="email"
                  value={profile?.email ?? ''}
                  disabled
                  className={cn(inputClass, 'cursor-not-allowed opacity-60')}
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
              </div>

              <div className="border-t pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Support Tickets tab ── */}
      {activeTab === 'support' && (
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
              <span className="text-sm font-semibold text-foreground">My Tickets</span>
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
                {showForm ? 'Cancel' : 'New'}
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
                    placeholder="Describe your issue…"
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
              {ticketsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                  <MessageCircle className="h-7 w-7 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No tickets yet</p>
                  <p className="text-xs text-muted-foreground/60">
                    Click &quot;New&quot; to open one.
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
                    <p className="truncate text-sm font-medium text-foreground">
                      {ticket.subject}
                    </p>
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

          {/* Right: chat or empty state */}
          {selectedTicket && profile?.id ? (
            <div className="flex flex-1">
              <TicketChat
                key={selectedTicket.id}
                ticket={selectedTicket}
                currentUserId={profile.id}
                isAdmin={false}
                onResolved={handleResolved}
                onBack={() => setSelectedId(null)}
              />
            </div>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center md:flex">
              <LifeBuoy className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Select a ticket to view the conversation
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
