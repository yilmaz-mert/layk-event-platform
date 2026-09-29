export type EventStatus = 'active' | 'cancelled' | 'completed';

export const statusLabels: Record<EventStatus, string> = {
  active: 'Aktif',
  completed: 'Tamamlandı',
  cancelled: 'İptal edildi',
};
