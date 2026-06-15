import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Ticket, User, type LucideProps } from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import Login from '../screens/Login';
import UserFeed from '../screens/UserFeed';
import MyBookings from '../screens/MyBookings';
import EventDetails from '../screens/EventDetails';
import TicketChat from '../screens/TicketChat';
import Profile from '../screens/Profile';
import { colors } from '../colors';

// ── Screen IDs ─────────────────────────────────────────────────────────────────

type Tab = 'feed' | 'bookings' | 'profile';

type Screen =
  | { id: 'feed' }
  | { id: 'bookings' }
  | { id: 'profile' }
  | { id: 'event-details'; eventId: string }
  | { id: 'ticket-chat'; reservationId: string; eventTitle: string };

// ── Bottom tab bar ─────────────────────────────────────────────────────────────

interface TabBarProps {
  active: Tab;
  onPress: (tab: Tab) => void;
}

function TabBar({ active, onPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  type IconComponent = React.ComponentType<LucideProps & { size?: number | string; color?: string; strokeWidth?: number | string }>;
  const tabs: { id: Tab; label: string; Icon: IconComponent }[] = [
    { id: 'feed',     label: 'Events',     Icon: CalendarDays },
    { id: 'bookings', label: 'My Bookings', Icon: Ticket },
    { id: 'profile',  label: 'Profile',    Icon: User },
  ];

  return (
    <View
      className="flex-row border-t border-border bg-card"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <Pressable
            key={id}
            onPress={() => onPress(id)}
            className="flex-1 items-center justify-center pt-2.5 gap-1"
          >
            <Icon
              size={22}
              color={isActive ? colors.primary : colors.mutedForeground}
              strokeWidth={isActive ? 2.5 : 1.75}
            />
            <Text
              className={`text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Pending approval screen ────────────────────────────────────────────────────

function PendingApproval({ onSignOut }: { onSignOut: () => void }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Ticket size={32} color={colors.mutedForeground} strokeWidth={1.5} />
      </View>
      <Text className="mt-5 text-xl font-bold text-foreground">Awaiting Approval</Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">
        Your account is pending administrator approval. You'll be able to browse and book
        events once your account is approved.
      </Text>
      <Pressable
        onPress={onSignOut}
        className="mt-8 rounded-xl border border-border px-6 py-3"
      >
        <Text className="text-sm font-medium text-foreground">Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ── Main Navigator ─────────────────────────────────────────────────────────────

export default function Navigator() {
  const { session, profile, loading } = useAuthMobile();
  const [screen, setScreen] = useState<Screen>({ id: 'feed' });
  const [activeTab, setActiveTab] = useState<Tab>('feed');

  // ── Auth loading splash ──────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-3 text-sm text-muted-foreground">Loading…</Text>
      </SafeAreaView>
    );
  }

  // ── Unauthenticated ──────────────────────────────────────────────────────

  if (!session || !profile) {
    return <Login onAuthenticated={() => setScreen({ id: 'feed' })} />;
  }

  // ── Pending / rejected ───────────────────────────────────────────────────

  if (profile.role !== 'admin' && profile.approval_status !== 'approved') {
    return (
      <PendingApproval
        onSignOut={async () => {
          await supabase.auth.signOut();
        }}
      />
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function goToTab(tab: Tab) {
    setActiveTab(tab);
    setScreen({ id: tab });
  }

  function goToEvent(eventId: string) {
    setScreen({ id: 'event-details', eventId });
  }

  function goToChat(reservationId: string, eventTitle: string) {
    setScreen({ id: 'ticket-chat', reservationId, eventTitle });
  }

  function goBack() {
    setScreen({ id: activeTab });
  }

  // ── Screen rendering ──────────────────────────────────────────────────────

  const needsTabs = screen.id === 'feed' || screen.id === 'bookings' || screen.id === 'profile';

  return (
    <View className="flex-1 bg-background">
      {/* Tab content */}
      <View className="flex-1">
        {screen.id === 'feed' && (
          <UserFeed onEventPress={goToEvent} />
        )}
        {screen.id === 'bookings' && (
          <MyBookings onEventPress={goToEvent} onChatPress={goToChat} />
        )}
        {screen.id === 'profile' && (
          <Profile />
        )}
        {screen.id === 'event-details' && (
          <EventDetails eventId={screen.eventId} onBack={goBack} />
        )}
        {screen.id === 'ticket-chat' && (
          <TicketChat
            reservationId={screen.reservationId}
            eventTitle={screen.eventTitle}
            onBack={goBack}
          />
        )}
      </View>

      {/* Bottom tabs — only on top-level screens */}
      {needsTabs && <TabBar active={activeTab} onPress={goToTab} />}
    </View>
  );
}
