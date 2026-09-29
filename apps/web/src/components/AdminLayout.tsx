import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronDown, Headphones, LogOut, Megaphone, Moon, Shield, Sun, Users, X } from 'lucide-react';
import { supabase } from '@layk/core';
import { useAuth } from '@layk/core';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@layk/core';

const NAV_ITEMS = [
  { to: '/admin', end: true, label: 'Kullanıcılar', icon: Users },
  { to: '/admin/events', end: false, label: 'Etkinlikler', icon: CalendarDays },
  { to: '/admin/broadcast', end: false, label: 'Duyuru', icon: Megaphone },
  { to: '/admin/tickets', end: false, label: 'Destek', icon: Headphones },
] as const;

function currentSection(pathname: string) {
  return NAV_ITEMS.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to))) ?? NAV_ITEMS[0];
}

export default function AdminLayout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const section = currentSection(pathname);

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

  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  function navClass({ isActive }: { isActive: boolean }) {
    return cn(
      'flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors pointer-coarse:h-11',
      isActive
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );
  }

  function mobileNavClass({ isActive }: { isActive: boolean }) {
    return cn(
      'flex h-12 items-center gap-3 rounded-lg px-3 text-base transition-colors',
      isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );
  }

  const ticketBadge = openTicketCount > 0 && (
    <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-destructive">
      {openTicketCount} açık
    </span>
  );

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <header className={cn('sticky top-0 z-40 border-b', menuOpen ? 'bg-background' : 'bg-background/95 backdrop-blur-sm')}>
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
          {/* Brand */}
          <div className="mr-auto flex shrink-0 items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-lg font-semibold tracking-tight text-foreground">L&apos;Ayk</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground max-[359px]:hidden">Yönetim</span>
          </div>

          {/* Desktop nav */}
          <nav aria-label="Yönetim" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={end} className={navClass}>
                <span className="relative">
                  <Icon className="h-4 w-4" aria-hidden />
                  {to === '/admin/tickets' && openTicketCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white">
                      {openTicketCount > 9 ? '9+' : openTicketCount}
                    </span>
                  )}
                </span>
                {label}
                {to === '/admin/tickets' && openTicketCount > 0 && (
                  <span className="sr-only">({openTicketCount} açık talep)</span>
                )}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={toggleTheme}
            className="hidden h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label="Görsel tema tercihini değiştir"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>

          <div className="mx-1 hidden h-4 w-px bg-border md:block" />

          {/* Admin email — visible only on large screens */}
          {profile?.email && (
            <span className="mr-2 hidden max-w-[160px] truncate text-xs text-muted-foreground lg:inline">
              {profile.email}
            </span>
          )}

          <button
            onClick={handleSignOut}
            aria-label="Çıkış yap"
            className="hidden h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex pointer-coarse:h-11 pointer-coarse:min-w-11"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden lg:inline">Çıkış Yap</span>
          </button>

          {/* Mobile menu toggle — doubles as the current-page label; truncates before it can crowd the brand */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            className="ml-2 flex h-11 min-w-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted md:hidden"
          >
            <span className="sr-only">Menü: </span>
            <span className="min-w-0 truncate">{section.label}</span>
            {section.to === '/admin/tickets' || openTicketCount === 0 ? null : (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                <span className="sr-only">, {openTicketCount} açık destek talebi</span>
              </>
            )}
            {menuOpen ? <X className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
          </button>
        </div>

        {menuOpen && (
          <div
            id="admin-mobile-menu"
            // Opaque sheet under the header bar; scrolls on its own on short / landscape screens.
            // Dark: one step lighter than the page (card) with a visible hairline, not just a shadow.
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-3.75rem)] overflow-y-auto overscroll-contain rounded-b-xl border-b bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-lg md:hidden dark:border-x dark:border-foreground/15 dark:bg-card"
          >
            <nav aria-label="Yönetim">
              <ul className="space-y-1">
                {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={end} className={mobileNavClass} onClick={() => setMenuOpen(false)}>
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      {label}
                      {to === '/admin/tickets' && ticketBadge}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-2 space-y-1 border-t pt-2">
              {profile?.email && (
                <p className="truncate px-3 py-2 text-xs text-muted-foreground">{profile.email}</p>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {theme === 'light' ? <Moon className="h-5 w-5 shrink-0" aria-hidden /> : <Sun className="h-5 w-5 shrink-0" aria-hidden />}
                {theme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç'}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden />
                Çıkış yap
              </button>
            </div>
          </div>
        )}
      </header>

      {menuOpen && (
        // Dim scrim: the same neutral black in both themes so the page clearly recedes.
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden onClick={closeMenu} />
      )}

      {/* Page content is inert while the menu is open, so Tab stays in the menu. */}
      <div inert={menuOpen || undefined}>
        <Outlet />
      </div>
    </div>
  );
}
