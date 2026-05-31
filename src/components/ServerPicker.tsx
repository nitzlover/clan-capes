'use client';

/**
 * Topbar server picker. Wired once into the dashboard layout, read by
 * every dashboard subroute via {@link useSelectedServer}.
 *
 * <h2>States</h2>
 * <ul>
 *   <li>{@code null} — nothing picked yet (first visit, or operator
 *       deliberately cleared). Pages must show a "select a server"
 *       prompt instead of auto-loading.</li>
 *   <li>numeric server id — page scopes its fetches to that server.</li>
 *   <li>{@code 'all'} — aggregated view. Pages declare
 *       {@link Props.allowAll} themselves; when disabled the
 *       picker hides the All option on routes where the aggregation
 *       doesn't make sense (settings, single-server live event view).</li>
 * </ul>
 *
 * <h2>Server list</h2>
 * The component fetches /api/panel/servers once on mount and caches
 * the result in state. Subsequent re-mounts (route changes) re-fetch
 * because servers can be deregistered or new ones come online; the
 * cache life is the lifetime of this component instance.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';
import { useSelectedServer, SelectedServer } from '@/lib/selected-server';
import { Select, SelectOption } from '@/components/Select';

type Server = {
  id: number;
  name: string;
  lastSeenAt?: string | null;
};

export function ServerPicker({ allowAll = true }: { allowAll?: boolean }) {
  const { value, set } = useSelectedServer();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api<{ servers: Server[] }>('/panel/servers');
      setServers(res.servers ?? []);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(e instanceof Error ? e.message : 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onChange = useCallback(
    (raw: string) => {
      if (raw === '') return set(null);
      if (raw === 'all') return set('all');
      const n = Number(raw);
      if (Number.isInteger(n) && n > 0) set(n);
    },
    [set],
  );

  // Active label for the small status pill next to the dropdown.
  const activeLabel = labelFor(value, servers);

  const selectOptions: SelectOption[] = [
    ...(allowAll && servers.length > 1
      ? [{ value: 'all', label: 'All servers', sublabel: `${servers.length}` }]
      : []),
    ...servers.map((s) => ({
      value: String(s.id),
      label: s.name,
      sublabel: `#${s.id}`,
    })),
  ];

  return (
    <div className="flex items-center gap-3">
      <span className="hidden md:inline font-sans text-xs font-medium lowercase text-[var(--text-faint)]">
        server
      </span>
      <Select
        value={selectValue(value)}
        options={selectOptions}
        onChange={onChange}
        placeholder="Select server…"
        disabled={loading || servers.length === 0}
        aria-label="Select server scope"
        minWidth={190}
      />
      {error && (
        <span className="font-sans text-xs font-medium text-red-400">
          {error}
        </span>
      )}
      {!error && !loading && value !== null && (
        <span className="font-sans text-xs font-medium lowercase text-[var(--text-faint)] hidden lg:inline">
          {activeLabel}
        </span>
      )}
    </div>
  );
}

function selectValue(v: SelectedServer): string {
  if (v === null) return '';
  if (v === 'all') return 'all';
  return String(v);
}

function labelFor(v: SelectedServer, servers: Server[]): string {
  if (v === null) return 'no selection';
  if (v === 'all') return 'aggregating all';
  const found = servers.find((s) => s.id === v);
  return found ? `id ${v}` : `id ${v} (unknown)`;
}

/**
 * Inline "select a server first" prompt page-content components can
 * render when {@code useSelectedServer().value === null}. Keeps the
 * empty-state copy consistent across every dashboard subroute.
 */
export function SelectServerPrompt({ children }: { children?: React.ReactNode }) {
  return (
    <div className="brutal-card flex flex-col items-start gap-3 p-8">
      <span className="font-sans text-sm font-semibold lowercase text-white">
        no server selected
      </span>
      <p className="text-[var(--text-soft)] text-sm">
        pick a server in the top bar to load this page&apos;s data.
      </p>
      {children}
    </div>
  );
}
