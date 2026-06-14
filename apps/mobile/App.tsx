import './global.css';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, Text, View } from 'react-native';
import { useMobileRealtimeSync } from './src/hooks/useMobileRealtimeSync';

export default function App() {
  // Reconnects Supabase Realtime WebSockets whenever the app
  // transitions from background → foreground (Phase 4 requirement).
  useMobileRealtimeSync();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <Text className="text-2xl font-bold text-foreground">L'Ayk</Text>
        <Text className="text-sm text-muted-foreground text-center">
          Mobile app scaffolded. Screens will be added in Phase 5.
        </Text>
        <View className="h-px w-full bg-border" />
        <Text className="text-xs text-muted-foreground">
          Realtime sync active · SecureStore session enabled
        </Text>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
