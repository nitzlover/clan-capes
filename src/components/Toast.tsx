'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type ToastKind = 'info' | 'success' | 'error';

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  ttlMs: number;
};

type ToastContextValue = {
  push: (message: string, opts?: { kind?: ToastKind; ttlMs?: number }) => void;
  success: (message: string, ttlMs?: number) => void;
  error: (message: string, ttlMs?: number) => void;
  info: (message: string, ttlMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_TTL = 4000;
const ERROR_TTL = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>((message, opts) => {
    const kind = opts?.kind ?? 'info';
    const ttlMs = opts?.ttlMs ?? (kind === 'error' ? ERROR_TTL : DEFAULT_TTL);
    const id = ++seq.current;
    setToasts((list) => [...list, { id, kind, message, ttlMs }]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    push,
    success: (m, ttl) => push(m, { kind: 'success', ttlMs: ttl }),
    error: (m, ttl) => push(m, { kind: 'error', ttlMs: ttl }),
    info: (m, ttl) => push(m, { kind: 'info', ttlMs: ttl }),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft fallback: silent no-op + console.warn so a component rendered
    // outside the provider doesn't crash the tree, but the developer
    // sees the misuse in the console.
    if (typeof window !== 'undefined') {
      console.warn('useToast called outside ToastProvider — toasts disabled.');
    }
    const noop = () => {};
    return { push: noop, success: noop, error: noop, info: noop };
  }
  return ctx;
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const handle = window.setTimeout(() => onDismiss(toast.id), toast.ttlMs);
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.ttlMs, onDismiss]);

  // B&W palette per project rule: kind only affects the leading rule + label.
  const kindLabel = toast.kind === 'error' ? '! ERROR'
    : toast.kind === 'success' ? '✓ OK'
    : '· INFO';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      className="pointer-events-auto border-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-4 py-3 shadow-[6px_6px_0_0_var(--rule-strong)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {kindLabel}
          </p>
          <p className="mt-1 break-words font-sans text-sm text-white">
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 font-mono text-xs text-[var(--text-mute)] hover:text-white"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
