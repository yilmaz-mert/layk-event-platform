import './global.css';

import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { MobileAuthProvider, useAuthMobile } from './src/hooks/useAuthMobile';
import { useMobileRealtimeSync } from './src/hooks/useMobileRealtimeSync';
import { initPushNotifications } from './src/lib/notifications';
import Navigator from './src/navigation/Navigator';

// Hex values matching global.css :root and .dark blocks.
const NAV_BAR_COLORS = {
  light: '#ffffff',
  dark:  '#020617',
} as const;

function AppContent() {
  const { profile } = useAuthMobile();
  const { colorScheme } = useColorScheme();

  useMobileRealtimeSync();

  // ── Android navigation bar instant sync ────────────────────────────────────
  // Without this, the Android bottom nav bar keeps its previous color until
  // the app is backgrounded and reopened. This effect fires synchronously
  // whenever the color scheme changes, forcing an immediate repaint.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const isDark = colorScheme === 'dark';
    const bgColor = isDark ? NAV_BAR_COLORS.dark : NAV_BAR_COLORS.light;
    const buttonStyle = isDark ? 'light' : 'dark';

    NavigationBar.setBackgroundColorAsync(bgColor).catch(() => {});
    NavigationBar.setButtonStyleAsync(buttonStyle).catch(() => {});
  }, [colorScheme]);

  useEffect(() => {
    if (profile?.id) {
      initPushNotifications(profile.id);
    }
  }, [profile?.id]);

  return (
    <>
      <View className={`flex-1 bg-background ${colorScheme === 'dark' ? 'dark' : ''}`}>
        <Navigator />
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <AppContent />
      </MobileAuthProvider>
    </SafeAreaProvider>
  );
}
