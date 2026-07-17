import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bookmark, CalendarDays, LogOut, Moon, Sun, User } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@layk/core';
import NotificationBell from '@/components/NotificationBell';

export default function UserLayout() {
  const { profile } = useAuth();
  const isGuest = !profile;
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
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
          <span className="mr-auto text-lg font-bold text-foreground">L&apos;Ayk</span>

          <NavLink to="/" end className={navClass}>
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Keşfet</span>
          </NavLink>

          {!isGuest && (
            <NavLink to="/my-bookings" className={navClass}>
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Rezervasyonlarım</span>
            </NavLink>
          )}

          {!isGuest && (
            <NavLink to="/profile" className={navClass}>
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profilim</span>
            </NavLink>
          )}

          {profile?.id && <NotificationBell userId={profile.id} />}

          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Görsel tema tercihini değiştir"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

          {isGuest ? (
            <Link
              to="/login"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Giriş Yap
            </Link>
          ) : (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Çıkış Yap</span>
            </button>
          )}
        </div>
      </header>

      <Outlet />
    </div>
  );
}
