import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { colors } from '../colors';

type Mode = 'login' | 'signup';

interface Props {
  onAuthenticated: () => void;
}

export default function Login({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
    setAccessDenied(null);
  }

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Validation', 'Please fill in all fields.');
      return;
    }

    setMessage(null);
    setAccessDenied(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        setMessage({
          text: 'Account created! Please wait for an administrator to approve your account before signing in.',
          ok: true,
        });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (error) throw error;

        const { data: userProfile } = await supabase
          .from('users')
          .select('role, approval_status')
          .eq('id', data.user.id)
          .single();

        if (userProfile && userProfile.role !== 'admin' && userProfile.approval_status !== 'approved') {
          await supabase.auth.signOut();
          setAccessDenied(
            userProfile.approval_status === 'rejected'
              ? 'Your account application has been rejected.'
              : 'Your account is pending administrator approval.',
          );
          return;
        }

        // Auth state change in useAuthMobile will handle navigation
        onAuthenticated();
      }
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : 'An unexpected error occurred.',
        ok: false,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow items-center justify-center px-5 py-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand header */}
          <View className="mb-8 items-center">
            <Text className="text-3xl font-bold tracking-tight text-foreground">L'Ayk</Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
            </Text>
          </View>

          {/* Card */}
          <View className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">

            {/* Access denied banner */}
            {accessDenied && (
              <View className="mb-5 flex-row gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4">
                <AlertCircle size={18} color={colors.destructive} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-destructive">Access Denied</Text>
                  <Text className="mt-0.5 text-sm text-destructive">{accessDenied}</Text>
                </View>
              </View>
            )}

            {/* Full name (signup only) */}
            {mode === 'signup' && (
              <View className="mb-4">
                <Text className="mb-1.5 text-sm font-medium text-foreground">Full Name</Text>
                <TextInput
                  className="rounded-xl border border-input bg-background px-3.5 py-3 text-sm text-foreground"
                  placeholder="Jane Doe"
                  placeholderTextColor={colors.mutedForeground}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            {/* Email */}
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-foreground">Email</Text>
              <TextInput
                className="rounded-xl border border-input bg-background px-3.5 py-3 text-sm text-foreground"
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-foreground">Password</Text>
              <TextInput
                className="rounded-xl border border-input bg-background px-3.5 py-3 text-sm text-foreground"
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {/* Feedback message */}
            {message && (
              <View
                className={`mb-4 rounded-xl px-3.5 py-3 ${
                  message.ok ? 'bg-green-500/10' : 'bg-destructive/10'
                }`}
              >
                <Text
                  className={`text-sm ${message.ok ? 'text-green-600' : 'text-destructive'}`}
                >
                  {message.text}
                </Text>
              </View>
            )}

            {/* Submit button */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              className="w-full items-center rounded-xl bg-primary py-3 disabled:opacity-50"
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text className="text-sm font-semibold text-primary-foreground">
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </Pressable>

            {/* Mode toggle */}
            <View className="mt-5 flex-row items-center justify-center gap-1.5">
              <Text className="text-sm text-muted-foreground">
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              </Text>
              <Pressable onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
                <Text className="text-sm font-semibold text-primary underline">
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
