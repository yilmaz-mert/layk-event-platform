import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, LifeBuoy, LogOut, Moon, Save, Shield, User } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import { useColors } from '../colors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// ── Row components ────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <Text className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {text}
    </Text>
  );
}

interface MenuRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
  showChevron?: boolean;
  danger?: boolean;
}

function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
  rightContent,
  showChevron = false,
  danger = false,
}: MenuRowProps) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted"
    >
      <View className="w-5 items-center">
        {icon}
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-medium ${danger ? 'text-destructive' : 'text-foreground'}`}>
          {label}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
      {rightContent}
      {showChevron && (
        <ChevronRight size={16} color={c.mutedForeground} />
      )}
    </Pressable>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

interface Props {
  onSupportPress: () => void;
}

export default function Profile({ onSupportPress }: Props) {
  const { profile } = useAuthMobile();
  const c = useColors();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Profile form state (mirroring web UserProfile.tsx)
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (profile?.id) void fetchProfileDetails(profile.id);
    return () => { isMounted.current = false; };
  }, [profile?.id]);

  async function fetchProfileDetails(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('full_name, phone_number')
      .eq('id', userId)
      .single();

    if (!isMounted.current) return;
    if (data) {
      setFullName(data.full_name ?? '');
      setPhoneNumber(data.phone_number ?? '');
    }
    setProfileLoading(false);
  }

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);

    const trimmedName = fullName.trim() || null;
    const trimmedPhone = phoneNumber.trim() || null;

    const { error } = await supabase
      .from('users')
      .update({ full_name: trimmedName, phone_number: trimmedPhone })
      .eq('id', profile.id);

    if (!isMounted.current) return;

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      // Keep local auth metadata in sync
      await supabase.auth.updateUser({
        data: { full_name: trimmedName, phone_number: trimmedPhone },
      });
      Alert.alert('Saved', 'Your profile has been updated.');
    }
    setSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const initials = getInitials(profile?.full_name ?? null, profile?.email ?? '');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View className="flex-row items-center gap-3 px-5 pt-5 pb-4">
          <View className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User size={18} color={c.primary} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-2xl font-bold tracking-tight text-foreground">My Profile</Text>
            <Text className="mt-0.5 text-sm text-muted-foreground truncate">
              {profile?.email}
            </Text>
          </View>
        </View>

        {/* ── Avatar + role badge ─────────────────────────────────────────── */}
        <View className="mx-5 items-center rounded-2xl border border-border bg-card py-7 px-6 mb-5">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary shadow-sm">
            <Text className="text-2xl font-bold tracking-wide text-primary-foreground">
              {initials}
            </Text>
          </View>
          {profile?.full_name ? (
            <Text className="mt-4 text-lg font-semibold text-foreground">
              {profile.full_name}
            </Text>
          ) : null}
          <Text className="mt-1 text-sm text-muted-foreground">{profile?.email}</Text>
          <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
            <Shield size={11} color={c.primary} />
            <Text className="text-xs font-semibold text-primary capitalize">
              {profile?.role ?? 'user'}
            </Text>
          </View>
        </View>

        {/* ── Edit profile form ───────────────────────────────────────────── */}
        <View className="mx-5 mb-5">
          <SectionLabel text="Account Details" />
          <View className="rounded-2xl border border-border bg-card overflow-hidden">
            {profileLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator color={c.primary} />
              </View>
            ) : (
              <>
                {/* Full Name */}
                <View className="px-4 pt-4 pb-3 border-b border-border">
                  <Text className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Full Name
                  </Text>
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Your full name"
                    placeholderTextColor={c.mutedForeground}
                    className="text-sm text-foreground"
                    returnKeyType="next"
                  />
                </View>

                {/* Phone Number */}
                <View className="px-4 pt-4 pb-3 border-b border-border">
                  <Text className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Phone Number
                  </Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="+1 (555) 000-0000"
                    placeholderTextColor={c.mutedForeground}
                    keyboardType="phone-pad"
                    className="text-sm text-foreground"
                  />
                </View>

                {/* Email (read-only) */}
                <View className="px-4 pt-4 pb-3">
                  <Text className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Email
                  </Text>
                  <Text className="text-sm text-muted-foreground opacity-60">
                    {profile?.email}
                  </Text>
                  <Text className="mt-1 text-xs text-muted-foreground opacity-60">
                    Email cannot be changed here.
                  </Text>
                </View>

                {/* Save button */}
                <View className="border-t border-border px-4 py-3">
                  <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3 active:opacity-80 disabled:opacity-50"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={c.primaryForeground} />
                    ) : (
                      <Save size={15} color={c.primaryForeground} />
                    )}
                    <Text className="text-sm font-semibold text-primary-foreground">
                      {saving ? 'Saving…' : 'Save Changes'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── Settings ────────────────────────────────────────────────────── */}
        <View className="mx-5 mb-5">
          <SectionLabel text="Preferences" />
          <View className="rounded-2xl border border-border bg-card overflow-hidden">
            <MenuRow
              icon={<Moon size={17} color={c.mutedForeground} strokeWidth={1.75} />}
              label="Dark Mode"
              subtitle={isDark ? 'On' : 'Off'}
              rightContent={
                <Switch
                  value={isDark}
                  onValueChange={toggleColorScheme}
                  trackColor={{ false: c.border, true: c.primary }}
                  thumbColor={c.primaryForeground}
                  ios_backgroundColor={c.border}
                />
              }
            />
          </View>
        </View>

        {/* ── Support ─────────────────────────────────────────────────────── */}
        <View className="mx-5 mb-5">
          <SectionLabel text="Help" />
          <View className="rounded-2xl border border-border bg-card overflow-hidden">
            <MenuRow
              icon={<LifeBuoy size={17} color={c.mutedForeground} strokeWidth={1.75} />}
              label="Help & Support"
              subtitle="View your support tickets"
              onPress={onSupportPress}
              showChevron
            />
          </View>
        </View>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <View className="mx-5">
          <View className="rounded-2xl border border-border bg-card overflow-hidden">
            <MenuRow
              icon={<LogOut size={17} color={c.destructive} strokeWidth={1.75} />}
              label="Sign Out"
              onPress={handleSignOut}
              danger
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
