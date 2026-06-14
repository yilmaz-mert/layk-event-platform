import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Send, X } from 'lucide-react';
import { supabase } from '@layk/core';
import { useToast } from '@/components/Toast';
import { cn } from '@layk/core';

type TargetType = 'all' | 'specific' | 'event_attendees';

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

interface EventRow {
  id: string;
  title: string;
  event_date: string;
}

interface ComboOption {
  id: string;
  label: string;
  sublabel?: string;
}

function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

// ── Searchable combo component ────────────────────────────────────────────────

function SearchableCombo({
  options,
  value,
  placeholder,
  emptyMessage,
  onSelect,
  onClear,
}: {
  options: ComboOption[];
  value: string;
  placeholder: string;
  emptyMessage: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on outside click (mousedown fires before blur, so no flicker)
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selected = options.find((o) => o.id === value);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  // Reset keyboard cursor when filtered list changes
  useEffect(() => { setActiveIndex(-1); }, [query]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-option]');
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function openDropdown() {
    setOpen(true);
    inputRef.current?.focus();
  }

  function closeDropdown() {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (open && activeIndex >= 0 && activeIndex < filtered.length) {
          onSelect(filtered[activeIndex].id);
          closeDropdown();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
        <span className="flex-1 text-sm font-medium text-foreground">
          {selected.label}
          {selected.sublabel && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {selected.sublabel}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input wrapper — plain div so no button-inside-button nesting */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2',
          'transition',
          open && 'ring-2 ring-ring',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-expanded={open}
          aria-autocomplete="list"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {/* Chevron: preventDefault on mousedown stops the input from blurring */}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? closeDropdown() : openDropdown())}
          aria-label={open ? 'Close list' : 'Open list'}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-input bg-background shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {query.trim() ? `No results for "${query}"` : emptyMessage}
            </p>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.id}
                data-option
                type="button"
                role="option"
                aria-selected={activeIndex === i}
                /* preventDefault prevents the input losing focus before onClick fires */
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(o.id); closeDropdown(); }}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-3 py-2 text-left transition',
                  activeIndex === i ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <span className="text-sm font-medium text-foreground">{o.label}</span>
                {o.sublabel && (
                  <span className="text-xs text-muted-foreground">{o.sublabel}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminBroadcast() {
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetEventId, setTargetEventId] = useState('');
  const [sending, setSending] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    async function loadData() {
      const [usersRes, eventsRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, full_name, email, approval_status')
          .order('full_name', { ascending: true }),
        supabase
          .from('events')
          .select('id, title, event_date')
          .eq('status', 'active')
          .order('event_date', { ascending: true }),
      ]);
      if (usersRes.data) setUsers(usersRes.data as UserRow[]);
      if (eventsRes.data) setEvents(eventsRes.data as EventRow[]);
    }
    loadData();
  }, []);

  const approvedUsers = users.filter((u) => u.approval_status === 'approved');

  const userOptions: ComboOption[] = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email,
    sublabel: u.full_name ? u.email : undefined,
  }));

  const eventOptions: ComboOption[] = events.map((ev) => ({
    id: ev.id,
    label: ev.title,
    sublabel: formatEventDate(ev.event_date),
  }));

  function recipientHint(): string {
    if (targetType === 'all') {
      return `${approvedUsers.length} approved user${approvedUsers.length !== 1 ? 's' : ''} will receive this.`;
    }
    if (targetType === 'specific') return 'One user will receive this.';
    return 'All confirmed attendees of the selected event will receive this.';
  }

  function resetTargets() {
    setTargetUserId('');
    setTargetEventId('');
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    let recipientIds: string[] = [];

    if (targetType === 'all') {
      recipientIds = approvedUsers.map((u) => u.id);
    } else if (targetType === 'specific') {
      recipientIds = [targetUserId];
    } else {
      const { data, error } = await supabase
        .from('reservations')
        .select('user_id')
        .eq('event_id', targetEventId)
        .eq('status', 'confirmed');
      if (error) {
        toast.error(error.message);
        setSending(false);
        return;
      }
      recipientIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    }

    if (recipientIds.length === 0) {
      toast.error('No recipients found for the selected audience.');
      setSending(false);
      return;
    }

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      title: title.trim(),
      message: message.trim(),
      type: 'admin_broadcast',
    }));

    const { error } = await supabase.from('notifications').insert(rows);

    if (error) {
      toast.error(error.message);
    } else {
      const count = recipientIds.length;
      const noun =
        targetType === 'event_attendees'
          ? `${count} attendee${count !== 1 ? 's' : ''}`
          : `${count} user${count !== 1 ? 's' : ''}`;
      toast.success(`Broadcast sent to ${noun}.`);
      setTitle('');
      setMessage('');
      resetTargets();
    }

    setSending(false);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Broadcast Center</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Send targeted notifications to your members.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <form onSubmit={handleBroadcast} className="space-y-5">
          {/* Audience selector */}
          <fieldset>
            <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Audience
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5">
              {(
                [
                  ['all', 'All Approved Users'],
                  ['specific', 'Specific User'],
                  ['event_attendees', 'Event Attendees'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="targetType"
                    value={value}
                    checked={targetType === value}
                    onChange={() => {
                      setTargetType(value);
                      resetTargets();
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Searchable user picker */}
          {targetType === 'specific' && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Search by name or email address
              </p>
              <SearchableCombo
                options={userOptions}
                value={targetUserId}
                placeholder="Search users…"
                emptyMessage="No users available"
                onSelect={setTargetUserId}
                onClear={() => setTargetUserId('')}
              />
              {/* Hidden required sentinel */}
              <input
                tabIndex={-1}
                value={targetUserId}
                required
                onChange={() => {}}
                className="sr-only"
                aria-hidden="true"
              />
            </div>
          )}

          {/* Searchable event picker */}
          {targetType === 'event_attendees' && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Search by event title or date
              </p>
              <SearchableCombo
                options={eventOptions}
                value={targetEventId}
                placeholder="Search events…"
                emptyMessage="No active events"
                onSelect={setTargetEventId}
                onClear={() => setTargetEventId('')}
              />
              <input
                tabIndex={-1}
                value={targetEventId}
                required
                onChange={() => {}}
                className="sr-only"
                aria-hidden="true"
              />
            </div>
          )}

          {/* Notification title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Message body */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message…"
            required
            rows={4}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-xs text-muted-foreground">{recipientHint()}</p>
            <button
              type="submit"
              disabled={sending}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
