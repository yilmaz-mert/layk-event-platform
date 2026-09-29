import { cn } from '@layk/core';

/**
 * Equal-width filter tabs (label over count) below lg, a chip row on desktop.
 * Same look as the event list's status tabs. Labels may carry soft hyphens
 * (­) so long words break cleanly in narrow columns.
 */
export default function FilterTabs<T extends string>({
  label,
  options,
  value,
  labels,
  counts,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  counts: Record<T, number>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-0.5 rounded-lg border bg-muted/40 p-0.5 lg:flex lg:flex-wrap lg:gap-1.5 lg:border-0 lg:bg-transparent lg:p-0"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-0.5 py-1.5 text-center text-sm leading-tight transition-colors [overflow-wrap:anywhere]',
            'lg:h-9 lg:min-h-0 lg:flex-row lg:gap-1 lg:rounded-full lg:border lg:px-3 lg:py-0 lg:pointer-coarse:h-11',
            value === o
              ? 'bg-foreground font-medium text-background lg:border-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span>{labels[o]}</span>
          <span className="text-xs tabular-nums opacity-70 lg:text-sm">{counts[o]}</span>
        </button>
      ))}
    </div>
  );
}
