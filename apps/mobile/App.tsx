import './global.css';

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { MobileAuthProvider, useAuthMobile } from './src/hooks/useAuthMobile';
import { useMobileRealtimeSync } from './src/hooks/useMobileRealtimeSync';
import { initPushNotifications } from './src/lib/notifications';
import Navigator from './src/navigation/Navigator';

function AppContent() {
  const { profile } = useAuthMobile();

  // Reconnects Supabase Realtime WebSockets on background → foreground transitions
  useMobileRealtimeSync();

  // Register and persist Expo Push Token once profile is loaded
  useEffect(() => {
    if (profile?.id) {
      initPushNotifications(profile.id);
    }
  }, [profile?.id]);

  return (
    <>
      <Navigator />
      <StatusBar style="auto" />
    </>
  );
}

export default function App() {
  return (
    <MobileAuthProvider>
      <AppContent />
    </MobileAuthProvider>
  );
}
