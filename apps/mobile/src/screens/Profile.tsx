import { Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Moon, Shield } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useAuthMobile } from '../hooks/useAuthMobile';
import { supabase } from '../lib/supabase-mobile';
import { colors } from '../colors';

export default function Profile() {
  const { profile } = useAuthMobile();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Build avatar initials from name or email fallback
  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : (profile?.email?.[0] ?? '?').toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Page title */}
      <View className="px-5 pt-5 pb-4">
        <Text className="text-2xl font-bold text-foreground">Profile</Text>
      </View>

      {/* Identity card */}
      <View className="mx-4 items-center rounded-2xl border border-border bg-card py-7 px-6">
        {/* Avatar */}
        <View className="h-20 w-20 items-center justify-center rounded-full bg-primary shadow-sm">
          <Text className="text-2xl font-bold tracking-wide text-primary-foreground">
            {initials}
          </Text>
        </View>

        {/* Name */}
        {profile?.full_name ? (
          <Text className="mt-4 text-lg font-semibold text-foreground">
            {profile.full_name}
          </Text>
        ) : null}

        {/* Email */}
        <Text className="mt-1 text-sm text-muted-foreground">{profile?.email}</Text>

        {/* Role badge */}
        <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
          <Shield size={11} color={colors.primary} />
          <Text className="text-xs font-semibold text-primary capitalize">
            {profile?.role ?? 'user'}
          </Text>
        </View>
      </View>

      {/* Settings section */}
      <View className="mx-4 mt-4 rounded-2xl border border-border bg-card overflow-hidden">
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
          <View className="flex-row items-center gap-3">
            <Moon size={17} color={colors.mutedForeground} strokeWidth={1.75} />
            <View>
              <Text className="text-sm font-medium text-foreground">Dark Mode</Text>
              <Text className="text-xs text-muted-foreground">
                {isDark ? 'On' : 'Off'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleColorScheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.primaryForeground}
            ios_backgroundColor={colors.border}
          />
        </View>
      </View>

      {/* Sign out */}
      <View className="mx-4 mt-4">
        <Pressable
          onPress={handleSignOut}
          className="flex-row items-center justify-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/8 py-4 active:opacity-60"
        >
          <LogOut size={16} color={colors.destructive} strokeWidth={2} />
          <Text className="text-sm font-semibold text-destructive">Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
