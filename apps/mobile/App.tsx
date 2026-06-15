import './global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { MobileAuthProvider, useAuthMobile } from './src/hooks/useAuthMobile';
import { useMobileRealtimeSync } from './src/hooks/useMobileRealtimeSync';
import { initPushNotifications } from './src/lib/notifications';
import Navigator from './src/navigation/Navigator';

function AppContent() {
  const { profile } = useAuthMobile();
  const { colorScheme } = useColorScheme();

  useMobileRealtimeSync();

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
