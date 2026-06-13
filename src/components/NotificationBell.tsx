import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link_url: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, link_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setNotifications(data as Notification[]);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        fetchNotifications,
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifications, userId]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleItemClick(n: Notification) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item)),
      );
    }
    setOpen(false);
    if (n.link_url) navigate(n.link_url);
  }

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    'flex w-full gap-3 border-b px-4 py-3 text-left transition last:border-0 hover:bg-muted/50',
                    !n.is_read && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.is_read ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
