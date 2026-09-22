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
      'flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors sm:px-3',
      isActive
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-0.5 px-4 py-2 sm:gap-1">
          <Link to="/" className="mr-auto rounded text-lg font-semibold tracking-tight text-foreground">L&apos;Ayk</Link>

          <NavLink to="/" end className={navClass} aria-label="Keşfet">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Keşfet</span>
          </NavLink>

          {!isGuest && (
            <NavLink to="/my-bookings" className={navClass} aria-label="Rezervasyonlarım">
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Rezervasyonlarım</span>
            </NavLink>
          )}

          {!isGuest && (
            <NavLink to="/profile" className={navClass} aria-label="Profilim">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profilim</span>
            </NavLink>
          )}

          {profile?.id && <NotificationBell userId={profile.id} />}

          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Görsel tema tercihini değiştir"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

          {isGuest ? (
            <Link
              to="/login"
              className="ml-1 flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Giriş yap
            </Link>
          ) : (
            <button
              onClick={handleSignOut}
              aria-label="Çıkış yap"
              className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
