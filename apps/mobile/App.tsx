import './global.css';

import { memo, useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { MobileAuthProvider, useAuthMobile } from './src/hooks/useAuthMobile';
import { useMobileRealtimeSync } from './src/hooks/useMobileRealtimeSync';
import { initPushNotifications } from './src/lib/notifications';
import Navigator from './src/navigation/Navigator';

// ThemeShell subscribes to colorScheme and owns the root dark-class wrapper.
// By passing Navigator as `children` (created above in App, not inside here),
// a theme change re-renders only this shell — not the entire Navigator tree.
function ThemeShell({ children }: { children: ReactNode }) {
  const { colorScheme } = useColorScheme();

  // Android API 34+: edge-to-edge is enforced; only icon contrast is settable.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setButtonStyleAsync(colorScheme === 'dark' ? 'light' : 'dark').catch(() => {});
  }, [colorScheme]);

  return (
    <View className={`flex-1 bg-background ${colorScheme === 'dark' ? 'dark' : ''}`}>
      {children}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

// memo() guard: auth-context updates only re-render this subtree when profile
// actually changes, not when ThemeShell re-renders for a color-scheme change.
const AppContent = memo(function AppContent() {
  const { profile } = useAuthMobile();

  useMobileRealtimeSync();

  useEffect(() => {
    if (profile?.id) {
      initPushNotifications(profile.id);
    }
  }, [profile?.id]);

  return <Navigator />;
});

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <ThemeShell>
          <AppContent />
        </ThemeShell>
      </MobileAuthProvider>
    </SafeAreaProvider>
  );
}
