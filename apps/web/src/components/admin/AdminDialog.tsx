import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Native modal <dialog>: showModal() makes the rest of the page inert and
 * stacks nested dialogs in the top layer. On top of that this adds a Tab wrap
 * (so focus never leaves for the browser chrome), Escape / Android back /
 * backdrop routed through onRequestClose, and focus returned to the opener.
 */
export default function AdminDialog({
  onRequestClose,
  onForcedClose,
  initialFocus,
  role,
  labelledBy,
  describedBy,
  className,
  style,
  children,
}: {
  /** Escape, back gesture or backdrop click; the caller decides whether to close. */
  onRequestClose: () => void;
  /** The browser closed the dialog without asking (repeated back gestures). */
  onForcedClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
  labelledBy: string;
  describedBy?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const handlers = useRef({ onRequestClose, onForcedClose });
  const mounted = useRef(false);
  useEffect(() => { handlers.current = { onRequestClose, onForcedClose }; });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    mounted.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    (initialFocus?.current ?? dialog.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => {
      mounted.current = false;
      if (dialog.open) dialog.close();
      document.body.style.overflow = prevOverflow;
      // The opener may have been re-rendered away (e.g. list refresh); then there is nothing to return to.
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === 'Escape') {
      // Cancelling keydown stops the native close request, so the caller can confirm first.
      e.preventDefault();
      e.stopPropagation();
      handlers.current.onRequestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const dialog = e.currentTarget;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains(active) || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      // Android back gesture / other close requests that didn't come through keydown.
      onCancel={(e) => { e.preventDefault(); handlers.current.onRequestClose(); }}
      // `close` is dispatched async: a stale one (e.g. from StrictMode's effect
      // re-run, which closes then re-opens) arrives while the dialog is open again.
      onClose={(e) => { if (mounted.current && !e.currentTarget.open) handlers.current.onForcedClose(); }}
      // Clicks on the dialog element itself land outside the panel (the backdrop area).
      onClick={(e) => { if (e.target === e.currentTarget) handlers.current.onRequestClose(); }}
      className={
        'm-0 max-h-none max-w-none border-0 bg-transparent p-0 text-foreground backdrop:bg-background/80 backdrop:backdrop-blur-sm ' +
        (className ?? '')
      }
      style={style}
    >
      {children}
    </dialog>
  );
}
