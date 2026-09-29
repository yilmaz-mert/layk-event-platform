import { Component, type ReactNode } from 'react';

/**
 * Catches a lazily loaded page that failed to load (network down, or a chunk that is still
 * missing after the one automatic reload in main.tsx) and shows a way out instead of a blank page.
 */
export default class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-sm px-4 py-24 text-center">
        <p className="text-sm font-medium text-foreground">Sayfa yüklenemedi.</p>
        <p className="mt-1 text-sm text-muted-foreground">Bağlantınızı kontrol edip sayfayı yenileyin.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 h-11 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Sayfayı yenile
        </button>
      </div>
    );
  }
}
