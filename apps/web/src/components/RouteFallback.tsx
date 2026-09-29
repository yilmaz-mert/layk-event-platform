/** Shown while a lazily loaded route chunk (the admin pages) is downloading. */
export default function RouteFallback() {
  return (
    <div role="status" className="flex justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" aria-hidden />
      <span className="sr-only">Yükleniyor</span>
    </div>
  );
}
