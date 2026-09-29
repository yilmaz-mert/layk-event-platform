import { Archive } from 'lucide-react';
import { cn } from '@layk/core';
import { categoryDotStyle } from '@/lib/eventDisplay';
import { statusLabels, type EventStatus } from './eventStatus';

// Small presentational pieces shared by the admin event list and detail pages.

const statusTone: Record<EventStatus, string> = {
  active: 'text-success',
  completed: 'text-muted-foreground',
  cancelled: 'text-destructive',
};

/** Event status plus draft/archived state — one badge set, so "Aktif" never appears twice. */
export function EventStateBadges({
  status,
  published,
  archived,
  showStatus = true,
  className,
}: {
  status: EventStatus;
  published: boolean;
  archived: boolean;
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium', className)}>
      {showStatus && (
        <span className={cn('inline-flex items-center gap-1.5', statusTone[status])}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {statusLabels[status]}
        </span>
      )}
      {!published && (
        <span className="rounded-md bg-warning/10 px-1.5 py-0.5 text-warning">Taslak</span>
      )}
      {archived && (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
          <Archive className="h-3 w-3" aria-hidden />
          Arşivde
        </span>
      )}
    </span>
  );
}

/** Category name with the accepted user-side colour dot. */
export function CategoryLabel({
  name,
  color,
  className,
}: {
  name: string | null | undefined;
  color: string | null | undefined;
  className?: string;
}) {
  if (!name) return <span className={cn('text-xs text-muted-foreground', className)}>Kategori yok</span>;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={categoryDotStyle(color)} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** "27 / 50" with a thin fill bar. */
export function OccupancyMeter({
  booked,
  capacity,
  className,
}: {
  booked: number;
  capacity: number;
  className?: string;
}) {
  const pct = capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;
  const full = capacity > 0 && booked >= capacity;
  return (
    <span className={cn('inline-flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs tabular-nums text-foreground lg:whitespace-nowrap">
        <span className="font-semibold">{booked}</span>
        <span className="text-muted-foreground"> / {capacity}</span>
        {full && <span className="ml-1.5 text-destructive">Dolu</span>}
      </span>
      <span
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Doluluk"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span
          className={cn('block h-full rounded-full', full ? 'bg-destructive' : 'bg-foreground/70')}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}
