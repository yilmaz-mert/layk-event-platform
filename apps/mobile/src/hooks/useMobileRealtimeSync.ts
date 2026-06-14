import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase-mobile';

// Re-establishes Supabase Realtime WebSocket connections when the app
// returns to the foreground after being backgrounded or suspended.
//
// Why this is required:
//   Mobile OSes kill WebSockets when an app is backgrounded. Without an
//   explicit reconnect, the support ticket chat and live notification
//   channels remain silently broken until the user restarts the app.
//
// Usage: call once at the root component level (e.g. inside App.tsx).
export function useMobileRealtimeSync(): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          // App came back to foreground — reconnect all realtime channels
          // so that live support chat and interest notifications resume.
          supabase.realtime.connect();
        }
        appState.current = nextState;
      },
    );

    return () => subscription.remove();
  }, []);
}
