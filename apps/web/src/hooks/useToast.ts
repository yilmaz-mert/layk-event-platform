import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
}

export const ToastContext = createContext<ToastContextValue>({
  toast: { success: () => {}, error: () => {} },
});

/** success/error toasts; rendered by <ToastProvider> (components/Toast.tsx). */
export function useToast() {
  return useContext(ToastContext);
}
