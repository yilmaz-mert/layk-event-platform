import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CalendarDays, Headphones, LogOut, Megaphone, Moon, Shield, Sun, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

export default function AdminLayout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [openTicketCount, setOpenTicketCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');
      setOpenTicketCount(count ?? 0);
    }

    fetchCount();

    const channel = supabase
      .channel('admin-open-ticket-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, fetchCount)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
          {/* Brand */}
          <div className="mr-auto flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-lg font-bold text-foreground">L&apos;Ayk</span>
            <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary sm:inline">
              Admin
            </span>
          </div>

          {/* Nav links */}
          <NavLink to="/admin" end className={navClass}>
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </NavLink>

          <NavLink to="/admin/events" className={navClass}>
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Events</span>
          </NavLink>

          <NavLink to="/admin/broadcast" className={navClass}>
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">Broadcast</span>
          </NavLink>

          <NavLink to="/admin/tickets" className={navClass}>
            <span className="relative">
              <Headphones className="h-4 w-4" />
              {openTicketCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white">
                  {openTicketCount > 9 ? '9+' : openTicketCount}
                </span>
              )}
            </span>
            <span className="hidden sm:inline">Tickets</span>
          </NavLink>

          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Toggle visual theme preference"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Admin email — visible only on large screens */}
          {profile?.email && (
            <span className="mr-2 hidden max-w-[160px] truncate text-xs text-muted-foreground lg:inline">
              {profile.email}
            </span>
          )}

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
