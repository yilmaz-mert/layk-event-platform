import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bookmark, CalendarDays, LogOut, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export default function UserLayout() {
  const navigate = useNavigate();

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
