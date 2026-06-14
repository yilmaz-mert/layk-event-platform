import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { activeTicketId } from '@/lib/activeTicket';

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
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, link_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notif = payload.new as Notification;

          // Suppress badge + audio when the user already has this ticket open
          if (notif.type === 'ticket_reply' && notif.link_url) {
            const notifTicketId = new URLSearchParams(
              notif.link_url.split('?')[1] ?? '',
            ).get('ticketId');
            if (notifTicketId !== null && notifTicketId === activeTicketId) {
              supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
              return;
            }
          }

          setNotifications((prev) => [notif, ...prev].slice(0, 20));
          new Audio('/notification.mp3').play().catch(() => {});
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
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
    if (n.type === 'ticket_reply') {
      navigate(n.link_url ?? '/profile?tab=support');
    } else if (n.link_url) {
      navigate(n.link_url);
    }
  }

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function handleDismiss(e: React.MouseEvent, notifId: string) {
    e.stopPropagation();
    // Optimistic remove
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    const { error } = await supabase.from('notifications').delete().eq('id', notifId);
    if (error) {
      toast.error('Failed to dismiss notification.');
      fetchNotifications();
    }
  }

  async function handleClearAll() {
    if (notifications.length === 0) return;
    setClearingAll(true);
    // Optimistic clear
    setNotifications([]);
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);
    if (error) {
      toast.error('Failed to clear notifications.');
      fetchNotifications();
    }
    setClearingAll(false);
  }

  return (
    <>
      {open && (
        <div
          className="fixed left-0 top-0 z-40 h-screen w-screen bg-black/40 backdrop-blur-md dark:bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
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
        <div className="fixed inset-x-4 top-20 z-50 overflow-hidden rounded-xl border bg-card shadow-xl md:absolute md:inset-x-auto md:left-auto md:right-0 md:top-full md:mt-2 md:w-80">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">
              Notifications
              {notifications.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({notifications.length})
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  disabled={clearingAll}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleItemClick(n)}
                  onKeyDown={(e) => e.key === 'Enter' && handleItemClick(n)}
                  className={cn(
                    'group flex w-full cursor-pointer gap-3 border-b px-4 py-3 text-left transition last:border-0 hover:bg-muted/50',
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
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {/* Dismiss button */}
                  <button
                    type="button"
                    onClick={(e) => handleDismiss(e, n.id)}
                    aria-label="Dismiss notification"
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition hover:bg-muted hover:text-muted-foreground group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
