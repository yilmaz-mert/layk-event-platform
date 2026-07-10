type WeekdayStyle = 'short' | 'long';

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, weekday?: WeekdayStyle): string {
  return new Intl.DateTimeFormat('tr-TR', {
    ...(weekday ? { weekday } : {}),
    day: 'numeric',
    month: weekday === 'long' ? 'long' : 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatPrice(value: number): string {
  if (!value) return 'Ücretsiz';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}
