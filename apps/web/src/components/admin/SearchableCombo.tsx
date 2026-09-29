import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@layk/core';

export interface ComboOption {
  id: string;
  label: string;
  sublabel?: string;
  /** Colours the sublabel, e.g. an over-capacity event. */
  sublabelTone?: 'warning' | 'danger';
}

const toneClass = { warning: 'font-medium text-warning', danger: 'font-medium text-destructive' } as const;

/**
 * Type-to-filter picker for a single option (users in Duyurular, events in the user dialog).
 * Keyboard: ↑/↓ to move, Enter to pick, Escape closes the list — and only the list, so a
 * surrounding dialog doesn't close on the same key press.
 */
export default function SearchableCombo({
  options,
  value,
  placeholder,
  emptyMessage,
  onSelect,
  onClear,
  inputId,
  ariaLabel,
  invalid = false,
  disabled = false,
}: {
  options: ComboOption[];
  value: string;
  placeholder: string;
  emptyMessage: string;
  onSelect: (id: string) => void;
  onClear: () => void;
  /** Pair with a visible <label htmlFor>; otherwise pass ariaLabel. */
  inputId?: string;
  ariaLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
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
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          closeDropdown();
        }
        break;
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background py-1 pl-3 pr-1">
        <span className="min-w-0 flex-1 break-words py-1 text-sm font-medium text-foreground">
          {selected.label}
          {selected.sublabel && (
            <span className={cn('block break-words text-xs font-normal text-muted-foreground', selected.sublabelTone && toneClass[selected.sublabelTone])}>
              {selected.sublabel}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label={`Seçimi temizle: ${selected.label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none pointer-coarse:h-11 pointer-coarse:w-11"
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
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid && inputId ? `${inputId}-error` : undefined}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-expanded={open}
          aria-autocomplete="list"
          className="min-h-10 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed sm:text-sm pointer-coarse:min-h-11"
        />
        {/* Chevron: preventDefault on mousedown stops the input from blurring */}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
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
                  <span className={cn('break-words text-xs text-muted-foreground', o.sublabelTone && toneClass[o.sublabelTone])}>
                    {o.sublabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
