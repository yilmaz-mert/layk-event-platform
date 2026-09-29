import { useId, useRef } from 'react';
import { cn } from '@layk/core';
import AdminDialog from './AdminDialog';

/** Blocking confirmation for consequential admin actions (e.g. cancelling an event). */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  busy = false,
  tone = 'destructive',
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  /** 'primary' for consequential but non-destructive actions (e.g. sending). */
  tone?: 'destructive' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  // The safe choice gets initial focus, so Enter never confirms by accident.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const requestCancel = () => { if (!busy) onCancel(); };

  return (
    <AdminDialog
      role="alertdialog"
      labelledBy={titleId}
      describedBy={bodyId}
      initialFocus={cancelRef}
      onRequestClose={requestCancel}
      onForcedClose={onCancel}
      className="fixed inset-0 h-full w-full items-end justify-center p-4 open:flex sm:items-center"
    >
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg">
        <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
        <div id={bodyId} className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={requestCancel}
            disabled={busy}
            className="h-11 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:h-10 sm:pointer-coarse:h-11"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'h-11 rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 sm:h-10 sm:pointer-coarse:h-11',
              tone === 'destructive' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
            )}
          >
            {busy ? 'İşleniyor…' : confirmLabel}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}
