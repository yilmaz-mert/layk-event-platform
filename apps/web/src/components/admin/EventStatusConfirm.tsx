import { useEffect, useId, useState } from 'react';
import { cn, supabase } from '@layk/core';
import ConfirmDialog from './ConfirmDialog';
import { adminInputClass } from './EventFormModal';

/** Event fields after the change, used to predict whether a notice goes out (mirrors migration 0033). */
export interface StatusChangeTarget {
  id: string;
  title: string;
  is_published: boolean;
  is_archived: boolean;
  event_date: string;
  cancellation_note: string | null;
  reopen_notice_pending: boolean;
}

const visibleAndUpcoming = (e: StatusChangeTarget) =>
  e.is_published && !e.is_archived && new Date(e.event_date) > new Date();

/**
 * Confirms cancelling or reactivating an event. Cancelling keeps every reservation;
 * reactivating shows what is kept, since user-cancelled bookings do not come back.
 */
export default function EventStatusConfirm({
  kind,
  event,
  busy = false,
  onConfirm,
  onCancel,
}: {
  kind: 'cancel' | 'reactivate';
  event: StatusChangeTarget;
  busy?: boolean;
  /** Receives the (trimmed, possibly null) cancellation note when cancelling. */
  onConfirm: (cancellationNote: string | null) => void;
  onCancel: () => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState(event.cancellation_note ?? '');
  const [kept, setKept] = useState<{ reservations: number; tickets: number } | null>(null);
  const [keptError, setKeptError] = useState(false);

  useEffect(() => {
    if (kind !== 'reactivate') return;
    let ignore = false;
    supabase
      .from('reservations')
      .select('tickets_requested')
      .eq('event_id', event.id)
      .eq('status', 'confirmed')
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) setKeptError(true);
        else setKept({ reservations: data.length, tickets: data.reduce((n, r) => n + r.tickets_requested, 0) });
      });
    return () => { ignore = true; };
  }, [kind, event.id]);

  const title = <span className="font-medium text-foreground">{event.title}</span>;

  if (kind === 'cancel') {
    return (
      <ConfirmDialog
        title="Etkinlik iptal edilsin mi?"
        confirmLabel="Etkinliği iptal et"
        busy={busy}
        onConfirm={() => onConfirm(note.trim() || null)}
        onCancel={onCancel}
      >
        <p>
          {title} Keşfet'ten kalkacak ve rezervasyona kapanacak. Mevcut rezervasyonlar silinmez; kullanıcılar kaydını
          “Etkinlik iptal edildi” olarak görür ve isterse kendi rezervasyonunu iptal edebilir.
        </p>
        <p className="mt-2">
          {visibleAndUpcoming(event)
            ? 'Onaylı rezervasyonu olanlara uygulama içi bildirim gider.'
            : 'Etkinlik yayında, arşiv dışında ve gelecek tarihli olmadığı için bildirim gitmez.'}
        </p>
        <label htmlFor={noteId} className="mt-3 block text-sm font-medium text-foreground">
          İptal açıklaması <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
        </label>
        <textarea
          id={noteId}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          placeholder="Etkinlik sayfasında katılımcılara gösterilir."
          className={cn(adminInputClass, 'mt-1.5 resize-y')}
        />
      </ConfirmDialog>
    );
  }

  const notifies = event.reopen_notice_pending && visibleAndUpcoming(event);
  return (
    <ConfirmDialog
      title="Etkinlik yeniden etkinleştirilsin mi?"
      confirmLabel="Yeniden etkinleştir"
      tone="primary"
      busy={busy || (!kept && !keptError)}
      onConfirm={() => onConfirm(null)}
      onCancel={onCancel}
    >
      <p>
        {title} yeniden rezervasyona açılacak.{' '}
        {kept
          ? `Korunan onaylı rezervasyon: ${kept.reservations} (toplam ${kept.tickets} bilet).`
          : keptError
            ? 'Korunan rezervasyon sayısı alınamadı.'
            : 'Korunan rezervasyonlar hesaplanıyor…'}{' '}
        Kullanıcıların kendi iptal ettiği rezervasyonlar geri gelmez.
      </p>
      <p className="mt-2">
        {notifies
          ? 'Rezervasyonu devam eden kullanıcılara güncel tarih ve mekanla uygulama içi bildirim gider.'
          : visibleAndUpcoming(event)
            ? 'Bu etkinlik için bekleyen bir iptal bildirimi olmadığından yeniden açılma bildirimi gitmez.'
            : 'Etkinlik yayında, arşiv dışında ve gelecek tarihli olmadığı için Keşfet’te görünmez; bildirim, rezervasyona açıldığında gider.'}
      </p>
    </ConfirmDialog>
  );
}
