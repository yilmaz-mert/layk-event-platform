import type { CSSProperties } from 'react';

// Web-only display helpers for event dates, availability and category dots.
// @layk/core's formatters are shared with mobile, so they stay untouched.

const dayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const relFmt = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

/** "Pzt 28 Eyl" — the year is added only when it isn't the current one. */
export function formatEventDay(iso: string): string {
  const d = new Date(iso);
  return (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d);
}

/** "01:26" — always two-digit hours so times line up in lists. */
export function formatEventTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "bugün", "yarın", "3 gün sonra" — calendar days, upcoming events only. */
export function formatRelativeDay(iso: string): string | null {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (days < 0 || days > 30) return null;
  return relFmt.format(days, 'day');
}

export type AvailabilityTone = 'normal' | 'low' | 'full';

export function getAvailability(capacity: number, booked: number): { spotsLeft: number; tone: AvailabilityTone; label: string } {
  const spotsLeft = Math.max(0, capacity - booked);
  if (spotsLeft === 0) return { spotsLeft, tone: 'full', label: 'Kontenjan doldu' };
  if (spotsLeft <= 5 || spotsLeft / capacity <= 0.1) return { spotsLeft, tone: 'low', label: `Son ${spotsLeft} yer` };
  return { spotsLeft, tone: 'normal', label: `${spotsLeft} yer kaldı` };
}

export const availabilityToneClass: Record<AvailabilityTone, string> = {
  normal: 'text-muted-foreground',
  low: 'text-warning',
  full: 'text-destructive',
};

/**
 * Category colours come from the DB and are often fully saturated (#ff00ff…).
 * Nudged 20% toward the text colour in oklab: keeps the hue (oklch mixing with
 * the bluish grey rotated red→magenta) and lifts pale colours off white / dark
 * colours off the dark background.
 */
export function categoryDotStyle(color: string | null | undefined): CSSProperties {
  return {
    backgroundColor: color
      ? `color-mix(in oklab, ${color} 80%, var(--foreground))`
      : 'var(--muted-foreground)',
  };
}
