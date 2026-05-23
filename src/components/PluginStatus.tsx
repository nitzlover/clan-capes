'use client';

import { useEffect, useState } from 'react';

type Status = 'checking' | 'online' | 'offline';

export function PluginStatus({ pollMs = 15000 }: { pollMs?: number }) {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const r = await fetch('/api/health/plugin', { cache: 'no-store' });
        if (cancelled) return;
        const data = (await r.json()) as { ok?: boolean };
        setStatus(data.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    }

    check();
    const id = setInterval(check, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  const label = status === 'checking' ? '· · ·' : status === 'online' ? 'online' : 'offline';
  const cls =
    status === 'online' ? 'status-pill ok' : status === 'offline' ? 'status-pill bad' : 'status-pill';

  return (
    <span className={cls} aria-live="polite">
      <span className="status-dot" />
      {label}
    </span>
  );
}
