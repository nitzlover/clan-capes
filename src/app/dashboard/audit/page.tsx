'use client';

import { useEffect, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';

type AuditEntry = { timestamp: string; raw: string };

/**
 * Audit route — full operator trail.
 *
 * The overview shows the most recent six lines; this page lists every
 * entry the server returns, scrollable in a brutalist frame. Monospace
 * type, tabular timestamps, no truncation so admins can copy exact
 * strings out of the log.
 */
export default function AuditPage() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await api<{ entries: AuditEntry[] }>('/panel/audit');
        if (!cancelled) setAudit(a.entries);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load audit');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Audit</h1>
          <p className="page-subtitle">
            Every action recorded by the plugin and the panel.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            receipt_long
          </span>
          {audit.length} entries
        </span>
      </div>

      <section className="brutal-card p-0">
        <div className="flex items-center justify-between border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-6 py-4">
          <span className="label-mono">Operator trail</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            newest first
          </span>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-2">
          {loading ? (
            <p className="px-4 py-6 text-sm text-[var(--text-mute)]">Loading…</p>
          ) : error ? (
            <p className="px-4 py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white">
              ! {error}
            </p>
          ) : audit.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-mute)]">No entries.</p>
          ) : (
            <ul className="font-mono text-[11px] text-[var(--text-mute)]">
              {audit.map((a, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[180px_1fr] gap-4 border-t border-[var(--rule)] px-4 py-2 first:border-t-0"
                >
                  <span className="text-[var(--text-faint)] tabular">
                    {a.timestamp}
                  </span>
                  <span className="whitespace-pre-wrap break-words text-[var(--text-soft)]">
                    {a.raw}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
