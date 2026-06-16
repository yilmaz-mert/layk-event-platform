import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  Ticket,
  User,
  type LucideProps,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase-mobile';
import { useAuthMobile } from '../hooks/useAuthMobile';
import type { PushDeepLink } from '../lib/notifications';
import { useColors } from '../colors';
import Login from '../screens/Login';
import AdminDashboard from '../screens/AdminDashboard';
import UserFeed from '../screens/UserFeed';
import MyBookings from '../screens/MyBookings';
import Support from '../screens/Support';
import EventDetails from '../screens/EventDetails';
import TicketChat from '../screens/TicketChat';
import Profile from '../screens/Profile';

// ── Screen types ──────────────────────────────────────────────────────────────

type Tab = 'feed' | 'bookings' | 'profile';

type Screen =
  | { id: 'feed' }
  | { id: 'bookings' }
  | { id: 'profile' }
  // Sub-screens (no tab bar shown)
  | { id: 'support' }
  | { id: 'event-details'; eventId: string }
  // ticketId: for direct-ticket flow (Support screen)
  // reservationId: for find-or-create flow (MyBookings screen)
  | { id: 'ticket-chat'; ticketId?: string; reservationId?: string; title: string };

const ROOT_TAB_IDS: Array<Screen['id']> = ['feed', 'bookings', 'profile'];

// ── Bottom tab bar ─────────────────────────────────────────────────────────────

interface TabBarProps {
  active: Tab;
  onPress: (tab: Tab) => void;
}

function TabBar({ active, onPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const c = useColors();

  type IconComponent = React.ComponentType<
    LucideProps & { size?: number | string; color?: string; strokeWidth?: number | string }
  >;
  const tabs: { id: Tab; label: string; Icon: IconComponent }[] = [
    { id: 'feed',     label: 'Events',   Icon: CalendarDays },
    { id: 'bookings', label: 'Bookings', Icon: Ticket },
    { id: 'profile',  label: 'Profile',  Icon: User },
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
              size={21}
              color={isActive ? c.primary : c.mutedForeground}
              strokeWidth={isActive ? 2.5 : 1.75}
            />
            <Text
              className={`text-[10px] font-medium ${
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
  const c = useColors();
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Ticket size={32} color={c.mutedForeground} strokeWidth={1.5} />
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

interface NavigatorProps {
  deepLink?: PushDeepLink | null;
  onDeepLinkConsumed?: () => void;
}

export default function Navigator({ deepLink, onDeepLinkConsumed }: NavigatorProps) {
  const { session, profile, loading } = useAuthMobile();
  const c = useColors();
  const [screen, setScreen] = useState<Screen>({ id: 'feed' });
  const [activeTab, setActiveTab] = useState<Tab>('feed');

  // Android hardware back: exit natively from any root tab; go back on sub-screens.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (ROOT_TAB_IDS.includes(screen.id)) return false;
      setScreen({ id: activeTab });
      return true;
    });
    return () => sub.remove();
  }, [screen.id, activeTab]);

  // Route a tapped push notification once the user is past the loading/login/
  // approval gates (admins have no event-details/ticket-chat screens to land on).
  useEffect(() => {
    if (!deepLink || !session || !profile) return;
    if (profile.role === 'admin' || profile.approval_status !== 'approved') return;

    if (deepLink.screen === 'event-details') {
      setScreen({ id: 'event-details', eventId: deepLink.eventId });
    } else if (deepLink.screen === 'ticket-chat') {
      setScreen({ id: 'ticket-chat', ticketId: deepLink.ticketId, title: 'Support' });
    }
    onDeepLinkConsumed?.();
  }, [deepLink, session, profile, onDeepLinkConsumed]);

  // ── Auth loading ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={c.primary} />
        <Text className="mt-3 text-sm text-muted-foreground">Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!session || !profile) {
    return <Login onAuthenticated={() => setScreen({ id: 'feed' })} />;
  }

  // ── Admin portal interception (bypasses user tab system) ─────────────────

  if (profile.role === 'admin') {
    return (
      <AdminDashboard
        onSignOut={async () => { await supabase.auth.signOut(); }}
      />
    );
  }

  // ── Pending / rejected ───────────────────────────────────────────────────

  if (profile.approval_status !== 'approved') {
    return (
      <PendingApproval
        onSignOut={async () => { await supabase.auth.signOut(); }}
      />
    );
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  function goToTab(tab: Tab) {
    setActiveTab(tab);
    setScreen({ id: tab });
  }

  function goBack() {
    setScreen({ id: activeTab });
  }

  // MyBookings passes (reservationId, eventTitle)
  function goToChat(reservationId: string, eventTitle: string) {
    setScreen({ id: 'ticket-chat', reservationId, title: eventTitle });
  }

  // Support screen passes (ticketId, subject)
  function goToTicketById(ticketId: string, subject: string) {
    setScreen({ id: 'ticket-chat', ticketId, title: subject });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const showTabs = ROOT_TAB_IDS.includes(screen.id);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1">
        {screen.id === 'feed' && (
          <UserFeed onEventPress={(id) => setScreen({ id: 'event-details', eventId: id })} />
        )}
        {screen.id === 'bookings' && (
          <MyBookings
            onEventPress={(id) => setScreen({ id: 'event-details', eventId: id })}
            onChatPress={goToChat}
          />
        )}
        {screen.id === 'profile' && (
          <Profile onSupportPress={() => setScreen({ id: 'support' })} />
        )}
        {screen.id === 'support' && (
          <Support onBack={goBack} onChatPress={goToTicketById} />
        )}
        {screen.id === 'event-details' && (
          <EventDetails eventId={screen.eventId} onBack={goBack} />
        )}
        {screen.id === 'ticket-chat' && (
          <TicketChat
            ticketId={screen.ticketId}
            reservationId={screen.reservationId}
            title={screen.title}
            onBack={goBack}
          />
        )}
      </View>

      {showTabs && <TabBar active={activeTab} onPress={goToTab} />}
    </View>
  );
}
