'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';

type AuditEntry = {
  id?: string;
  timestamp: string;
  // Structured (DB) shape
  serverId?: number | null;
  actor?: string;
  action?: string;
  target?: string | null;
  payload?: unknown;
  // Legacy (file) shape
  raw?: string;
};

type AuditResponse = {
  source: 'db' | 'file';
  entries: AuditEntry[];
  knownActors: string[];
  knownActions: string[];
};

/**
 * Audit route — full operator trail with filtering.
 *
 * Backend prefers the DB feed which carries structured columns (actor,
 * action, target, JSON payload) per row; the legacy file feed still
 * surfaces flat lines so a pre-migration deploy is readable.
 *
 * Filter controls (actor / action / target / since / until) build the
 * query string on every change and refetch — debounced lightly so a
 * typist doesn't hammer the endpoint mid-word.
 */
export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams();
    if (actor) qs.set('actor', actor);
    if (action) qs.set('action', action);
    if (target) qs.set('target', target);
    if (since) qs.set('since', new Date(since).toISOString());
    if (until) qs.set('until', new Date(until).toISOString());
    const s = qs.toString();
    return s ? `/panel/audit?${s}` : '/panel/audit';
  }, [actor, action, target, since, until]);

  useEffect(() => {
    let cancelled = false;
    // Debounce text inputs so each keystroke doesn't refetch
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        const resp = await api<AuditResponse>(buildQuery());
        if (!cancelled) {
          setData(resp);
          setError('');
        }
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load audit');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [buildQuery]);

  // Build the action dropdown from any actions seen across this batch.
  // When the user has filtered down to zero matches the dropdown
  // collapses to its currently-selected value — by design, so the
  // filter doesn't disappear mid-edit.
  const actionOptions = useMemo(() => {
    if (!data) return [] as string[];
    const all = new Set<string>(data.knownActions);
    if (action) all.add(action);
    return Array.from(all).sort();
  }, [data, action]);

  const actorOptions = useMemo(() => {
    if (!data) return [] as string[];
    const all = new Set<string>(data.knownActors);
    if (actor) all.add(actor);
    return Array.from(all).sort();
  }, [data, actor]);

  const entries = data?.entries ?? [];
  const hasFilters = Boolean(actor || action || target || since || until);

  function clearFilters() {
    setActor('');
    setAction('');
    setTarget('');
    setSince('');
    setUntil('');
  }

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
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <section className="brutal-card p-0">
        <div className="grid grid-cols-1 gap-3 border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-6 py-4 md:grid-cols-[1fr_1fr_1fr_auto_auto_auto]">
          {/* Actor */}
          <FilterControl label="Actor">
            <input
              list="audit-actor-list"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="admin: / plugin: / UUID…"
              className="brutal-input w-full"
            />
            <datalist id="audit-actor-list">
              {actorOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </FilterControl>

          {/* Action */}
          <FilterControl label="Action">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="brutal-input w-full"
            >
              <option value="">(any)</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </FilterControl>

          {/* Target */}
          <FilterControl label="Target">
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="clan tag, file…"
              className="brutal-input w-full"
            />
          </FilterControl>

          {/* Since */}
          <FilterControl label="Since">
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="brutal-input w-full"
            />
          </FilterControl>

          {/* Until */}
          <FilterControl label="Until">
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="brutal-input w-full"
            />
          </FilterControl>

          {/* Clear */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="brutal-btn w-full disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-6 py-3">
          <span className="label-mono">Operator trail</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {data?.source === 'db' ? 'db feed · newest first' : 'file feed · newest first'}
          </span>
        </div>

        <div className="max-h-[68vh] overflow-y-auto p-2">
          {loading ? (
            <p className="px-4 py-6 text-sm text-[var(--text-mute)]">Loading…</p>
          ) : error ? (
            <p className="px-4 py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white">
              ! {error}
            </p>
          ) : entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-mute)]">
              No entries{hasFilters ? ' match the filters' : ''}.
            </p>
          ) : data?.source === 'db' ? (
            <ul className="font-mono text-[11px] text-[var(--text-mute)]">
              {entries.map((a) => (
                <li
                  key={a.id ?? a.timestamp}
                  className="grid grid-cols-[170px_140px_140px_1fr] gap-4 border-t border-[var(--rule)] px-4 py-2 first:border-t-0"
                >
                  <span className="text-[var(--text-faint)] tabular">
                    {new Date(a.timestamp).toLocaleString()}
                  </span>
                  <span className="truncate text-[var(--text-soft)]" title={a.actor}>
                    {a.actor}
                  </span>
                  <span className="font-semibold uppercase text-white">{a.action}</span>
                  <span className="whitespace-pre-wrap break-words text-[var(--text-soft)]">
                    {a.target && (
                      <strong className="mr-2 text-white">{a.target}</strong>
                    )}
                    {a.payload != null ? JSON.stringify(a.payload) : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="font-mono text-[11px] text-[var(--text-mute)]">
              {entries.map((a, i) => (
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

function FilterControl({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-mono text-[var(--text-faint)]">{label}</span>
      {children}
    </label>
  );
}
