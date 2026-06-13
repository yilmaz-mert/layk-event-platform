import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bookmark, CalendarDays, LogOut, Moon, Sun, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';

export default function UserLayout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  function navClass({ isActive }: { isActive: boolean }) {
    return cn(
      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
          <span className="mr-auto text-lg font-bold text-foreground">L&apos;Ayk</span>

          <NavLink to="/" end className={navClass}>
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Discover</span>
          </NavLink>

          <NavLink to="/my-bookings" className={navClass}>
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">My Bookings</span>
          </NavLink>

          <NavLink to="/profile" className={navClass}>
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </NavLink>

          {profile?.id && <NotificationBell userId={profile.id} />}

          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Toggle visual theme preference"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
