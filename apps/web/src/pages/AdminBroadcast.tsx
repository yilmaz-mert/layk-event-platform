import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Send, X } from 'lucide-react';
import { supabase, formatShortDate } from '@layk/core';
import { cn } from '@layk/core';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

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

// ── Searchable combo component ────────────────────────────────────────────────

function SearchableCombo({
  options,
  value,
  placeholder,
  emptyMessage,
  onSelect,
  onClear,
  inputId,
  invalid = false,
}: {
  inputId?: string;
  invalid?: boolean;
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
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background py-1 pl-3 pr-1">
        <span className="min-w-0 flex-1 break-words py-1 text-sm font-medium text-foreground">
          {selected.label}
          {selected.sublabel && (
            <span className="block break-all font-normal text-muted-foreground">{selected.sublabel}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Seçimi temizle: ${selected.label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input wrapper — plain div so no button-inside-button nesting */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-input bg-background pl-3 pr-1',
          'transition',
          open && 'ring-2 ring-ring',
          invalid && 'border-destructive',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid && inputId ? `${inputId}-error` : undefined}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-expanded={open}
          aria-autocomplete="list"
          className="min-h-10 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-sm pointer-coarse:min-h-11"
        />
        {/* Chevron: preventDefault on mousedown stops the input from blurring */}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? closeDropdown() : openDropdown())}
          aria-label={open ? 'Listeyi kapat' : 'Listeyi aç'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
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
              {query.trim() ? `"${query}" için sonuç yok` : emptyMessage}
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
                  'flex min-h-11 w-full flex-col gap-0.5 px-3 py-2 text-left transition',
                  activeIndex === i ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <span className="break-words text-sm font-medium text-foreground">{o.label}</span>
                {o.sublabel && (
                  <span className="break-all text-xs text-muted-foreground">{o.sublabel}</span>
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

const AUDIENCE_OPTIONS: { value: TargetType; label: string; hint: string }[] = [
  { value: 'all', label: 'Tüm onaylı kullanıcılar', hint: 'Onaylanmış her hesaba gider.' },
  { value: 'specific', label: 'Belirli bir kullanıcı', hint: 'Aşağıdan tek bir kişi seçin.' },
  { value: 'event_attendees', label: 'Etkinlik katılımcıları', hint: 'Seçilen etkinliğin onaylı rezervasyonu olanlara gider.' },
];

const approvalNote: Record<UserRow['approval_status'], string | undefined> = {
  approved: undefined,
  pending: 'Onay bekliyor',
  rejected: 'Reddedildi',
};

type FieldKey = 'target' | 'title' | 'message';
type Result = { kind: 'success' | 'error'; text: string } | null;

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm pointer-coarse:min-h-11 aria-[invalid=true]:border-destructive';

export default function AdminBroadcast() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetEventId, setTargetEventId] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [result, setResult] = useState<Result>(null);
  // Recipients resolved before the confirm step, so the dialog can show the exact count.
  const [pending, setPending] = useState<{ ids: string[]; audience: string } | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      if (usersRes.error || eventsRes.error) setLoadError((usersRes.error ?? eventsRes.error)!.message);
    }
    loadData();
  }, []);

  const approvedUsers = users.filter((u) => u.approval_status === 'approved');

  const userOptions: ComboOption[] = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email,
    sublabel: [u.full_name ? u.email : null, approvalNote[u.approval_status]].filter(Boolean).join(' · ') || undefined,
  }));

  const eventOptions: ComboOption[] = events.map((ev) => ({
    id: ev.id,
    label: ev.title,
    sublabel: formatShortDate(ev.event_date),
  }));

  const selectedUser = users.find((u) => u.id === targetUserId);
  const selectedEvent = events.find((e) => e.id === targetEventId);

  function audienceSummary(): string {
    if (targetType === 'all') return `${approvedUsers.length} onaylı kullanıcı`;
    if (targetType === 'specific') return selectedUser ? (selectedUser.full_name ?? selectedUser.email) : 'Kullanıcı seçilmedi';
    return selectedEvent ? `"${selectedEvent.title}" katılımcıları` : 'Etkinlik seçilmedi';
  }

  function clearError(key: FieldKey) {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (result?.kind === 'success') setResult(null);
  }

  function selectAudience(value: TargetType) {
    setTargetType(value);
    setTargetUserId('');
    setTargetEventId('');
    clearError('target');
  }

  // Step 1: validate and resolve recipients (read-only), then ask for confirmation.
  async function handlePrepare(e: React.FormEvent) {
    e.preventDefault();
    if (preparing || sending) return;
    setResult(null);

    const found: Partial<Record<FieldKey, string>> = {};
    if (targetType === 'specific' && !targetUserId) found.target = 'Bir kullanıcı seçin.';
    if (targetType === 'event_attendees' && !targetEventId) found.target = 'Bir etkinlik seçin.';
    if (!title.trim()) found.title = 'Başlık gereklidir.';
    if (!message.trim()) found.message = 'Mesaj gereklidir.';
    setErrors(found);
    const first = (['target', 'title', 'message'] as const).find((k) => found[k]);
    if (first) {
      document.getElementById(`broadcast-${first}`)?.focus();
      return;
    }

    setPreparing(true);
    let ids: string[];
    if (targetType === 'all') {
      ids = approvedUsers.map((u) => u.id);
    } else if (targetType === 'specific') {
      ids = [targetUserId];
    } else {
      const { data, error } = await supabase
        .from('reservations')
        .select('user_id')
        .eq('event_id', targetEventId)
        .eq('status', 'confirmed');
      if (error) {
        setResult({ kind: 'error', text: `Alıcılar alınamadı: ${error.message}. Yazdığınız içerik korunuyor; tekrar deneyin.` });
        setPreparing(false);
        return;
      }
      ids = (data ?? []).map((r: { user_id: string }) => r.user_id);
    }
    setPreparing(false);

    if (ids.length === 0) {
      setResult({ kind: 'error', text: 'Seçilen kitle için alıcı bulunamadı. Başka bir kitle seçin.' });
      return;
    }
    setPending({ ids, audience: audienceSummary() });
  }

  // Step 2: the actual send, only after confirmation.
  async function handleSend() {
    if (!pending || sending) return;
    setSending(true);
    const rows = pending.ids.map((uid) => ({
      user_id: uid,
      title: title.trim(),
      message: message.trim(),
      type: 'admin_broadcast',
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    const count = pending.ids.length;
    setPending(null);
    setSending(false);

    if (error) {
      setResult({ kind: 'error', text: `Duyuru gönderilemedi: ${error.message}. Yazdığınız içerik korunuyor; tekrar deneyin.` });
    } else {
      const noun = targetType === 'event_attendees' ? `${count} katılımcıya` : `${count} kullanıcıya`;
      setResult({ kind: 'success', text: `Duyuru ${noun} gönderildi.` });
      setTitle('');
      setMessage('');
      setTargetUserId('');
      setTargetEventId('');
    }
  }

  const busy = preparing || sending;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Duyurular</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Kullanıcılara uygulama içi bildirim gönderin.</p>
      </div>

      {loadError && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Kullanıcı veya etkinlik listesi yüklenemedi ({loadError}). Sayfayı yenileyip tekrar deneyin.
        </p>
      )}

      <form onSubmit={handlePrepare} noValidate className="space-y-6 rounded-xl border bg-card p-4 sm:p-6">
        {/* Audience */}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold text-foreground">Alıcılar</legend>
          <div className="grid gap-2">
            {AUDIENCE_OPTIONS.map(({ value, label, hint }) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40 has-checked:border-foreground has-checked:bg-muted/60 has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="targetType"
                  value={value}
                  checked={targetType === value}
                  onChange={() => selectAudience(value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {label}
                    {value === 'all' && <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">({approvedUsers.length})</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          {targetType !== 'all' && (
            <div className="space-y-1.5">
              <label htmlFor="broadcast-target" className="block text-sm font-medium text-foreground">
                {targetType === 'specific' ? 'Kullanıcı' : 'Etkinlik'}
              </label>
              <SearchableCombo
                key={targetType}
                inputId="broadcast-target"
                invalid={Boolean(errors.target)}
                options={targetType === 'specific' ? userOptions : eventOptions}
                value={targetType === 'specific' ? targetUserId : targetEventId}
                placeholder={targetType === 'specific' ? 'Ad veya e-posta ara…' : 'Etkinlik başlığı veya tarihi ara…'}
                emptyMessage={targetType === 'specific' ? 'Uygun kullanıcı yok' : 'Aktif etkinlik yok'}
                onSelect={(id) => { (targetType === 'specific' ? setTargetUserId : setTargetEventId)(id); clearError('target'); }}
                onClear={() => (targetType === 'specific' ? setTargetUserId : setTargetEventId)('')}
              />
              {errors.target && <p id="broadcast-target-error" className="text-xs text-destructive">{errors.target}</p>}
            </div>
          )}
        </fieldset>

        {/* Content */}
        <fieldset className="space-y-4 border-t pt-5">
          <legend className="float-left mb-4 w-full text-sm font-semibold text-foreground">İçerik</legend>
          <div className="clear-both space-y-1.5">
            <label htmlFor="broadcast-title" className="block text-sm font-medium text-foreground">
              Başlık<span className="ml-0.5 text-destructive" aria-hidden>*</span>
            </label>
            <input
              id="broadcast-title"
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); clearError('title'); }}
              placeholder="örn. Hafta sonu programı güncellendi"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'broadcast-title-error' : undefined}
              className={inputClass}
            />
            {errors.title && <p id="broadcast-title-error" className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="broadcast-message" className="block text-sm font-medium text-foreground">
              Mesaj<span className="ml-0.5 text-destructive" aria-hidden>*</span>
            </label>
            <textarea
              id="broadcast-message"
              value={message}
              onChange={(e) => { setMessage(e.target.value); clearError('message'); }}
              placeholder="Mesajınızı yazın…"
              rows={5}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={errors.message ? 'broadcast-message-error' : 'broadcast-message-count'}
              className={cn(inputClass, 'resize-y break-words')}
            />
            {errors.message ? (
              <p id="broadcast-message-error" className="text-xs text-destructive">{errors.message}</p>
            ) : (
              <p id="broadcast-message-count" className="text-xs tabular-nums text-muted-foreground">{message.trim().length} karakter</p>
            )}
          </div>
        </fieldset>

        {/* Result */}
        {result && (
          <p
            role={result.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-lg px-3 py-2.5 text-sm break-words',
              result.kind === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
            )}
          >
            {result.text}
          </p>
        )}

        {/* Summary + send */}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words text-sm text-muted-foreground">
            Alıcılar: <span className="font-medium text-foreground">{audienceSummary()}</span>
          </p>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy || undefined}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:pointer-coarse:h-11"
          >
            <Send className="h-4 w-4" aria-hidden />
            {sending ? 'Gönderiliyor…' : preparing ? 'Alıcılar hazırlanıyor…' : 'Gönder'}
          </button>
        </div>
      </form>

      {pending && (
        <ConfirmDialog
          title="Duyuru gönderilsin mi?"
          confirmLabel={`${pending.ids.length} kişiye gönder`}
          busy={sending}
          onConfirm={handleSend}
          onCancel={() => setPending(null)}
          tone="primary"
        >
          <p>
            <span className="font-medium text-foreground">{pending.audience}</span>
            {targetType === 'all' ? '' : ` (${pending.ids.length} kişi)`} uygulama içi bildirim alacak.
          </p>
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-foreground">
            <p className="break-words font-medium">{title.trim()}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{message.trim()}</p>
          </div>
        </ConfirmDialog>
      )}
    </main>
  );
}
