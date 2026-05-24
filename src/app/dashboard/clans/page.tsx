'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';

type Member = {
  playerUuid: string;
  playerName: string;
  role: 'leader' | 'deputy' | 'member';
  joinedAt: string;
};

type Clan = {
  id: number;
  tag: string;
  name: string;
  colorHex: string;
  leaderUuid: string;
  createdAt: string;
  members: Member[];
};

type ServerOpt = { id: number; name: string };

/**
 * Clans admin surface — DB-backed view of every clan registered
 * across the panel's servers. Phase 2 ships this read-only-ish: the
 * admin can browse, switch servers, and inspect rosters, but
 * mutating actions (force-disband, rename, recolor) live on the
 * plugin REST surface and are reached by sending the same payload
 * through the panel's same-origin proxy in a later patch.
 */
export default function ClansPage() {
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const [serverId, setServerId] = useState<number | null>(null);
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: number | null) => {
    setLoading(true);
    setError('');
    try {
      const qs = id ? `?serverId=${id}` : '';
      const res = await api<{ clans: Clan[]; servers: ServerOpt[]; serverId?: number }>(
        `/panel/clans-list${qs}`,
      );
      setServers(res.servers);
      setClans(res.clans);
      if (res.serverId) setServerId(res.serverId);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
      setClans([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  async function importFromPowerClans() {
    if (!serverId) return;
    if (
      !confirm(
        'Pull every clan PowerClans currently knows about into the DB? Existing tags are skipped — safe to re-run.',
      )
    ) {
      return;
    }
    try {
      const res = await api<{
        imported: number;
        skipped: number;
        report: Array<{ tag: string; status: string; reason?: string }>;
      }>('/panel/clans/import-powerclans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });
      alert(
        `Imported ${res.imported}, skipped ${res.skipped}.\n\n` +
          res.report
            .map((r) =>
              `${r.tag}: ${r.status}${r.reason ? ' (' + r.reason + ')' : ''}`,
            )
            .join('\n'),
      );
      load(serverId);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Import failed');
    }
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Clans</h1>
          <p className="page-subtitle">
            DB-backed roster — every clan registered across this panel's servers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {serverId && (
            <button onClick={importFromPowerClans} className="btn-ghost" title="Pull PowerClans data via the plugin REST">
              + Import PowerClans
            </button>
          )}
          {servers.length > 0 && (
            <select
              value={serverId ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                setServerId(v);
                load(v);
              }}
              className="input max-w-[240px]"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <section className="brutal-card">
        <div className="flex items-center justify-between border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-6 py-4">
          <span className="label-mono">Registered clans</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {clans.length} total
          </span>
        </div>
        {loading ? (
          <p className="px-6 py-6 text-sm text-[var(--text-mute)]">Loading…</p>
        ) : error ? (
          <p className="px-6 py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white">
            ! {error}
          </p>
        ) : servers.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
              No servers registered.
            </p>
            <p className="mt-2 text-xs text-[var(--text-faint)]">
              Run <code className="text-[var(--text-soft)]">/clancape setup</code>{' '}
              on a Paper server first, then link via{' '}
              <code className="text-[var(--text-soft)]">/dashboard/servers</code>.
            </p>
          </div>
        ) : clans.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
              No clans yet on this server.
            </p>
            <p className="mt-2 text-xs text-[var(--text-faint)]">
              Leaders create clans in-game via{' '}
              <code className="text-[var(--text-soft)]">/clan create</code>.
            </p>
          </div>
        ) : (
          <ul>
            {clans.map((c) => (
              <ClanRow key={c.id} clan={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ClanRow({ clan }: { clan: Clan }) {
  const [open, setOpen] = useState(false);
  const leader = clan.members.find((m) => m.role === 'leader');

  return (
    <li className="border-b border-[var(--rule)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-5 px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span
          aria-hidden
          className="h-8 w-8 border-2 border-[var(--rule-strong)]"
          style={{ backgroundColor: clan.colorHex }}
        />
        <span className="min-w-0">
          <span className="block font-sans text-base font-extrabold uppercase tracking-wider text-white">
            {clan.tag}
          </span>
          <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
            {clan.name}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-mute)]">
          {clan.members.length} member{clan.members.length === 1 ? '' : 's'}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)] sm:inline">
          {leader?.playerName ?? '—'}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--rule)] bg-[var(--bg-sink)] px-6 py-4">
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <Meta label="ID" value={`#${clan.id}`} />
            <Meta label="Created" value={new Date(clan.createdAt).toLocaleString()} />
            <Meta label="Color" value={clan.colorHex} />
            <Meta label="Leader UUID" value={clan.leaderUuid} mono />
          </div>
          <p className="label-mono mt-5">Members</p>
          <ul className="mt-2">
            {clan.members.map((m) => (
              <li
                key={m.playerUuid}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-[var(--rule)] py-2 first:border-t-0"
              >
                <span className="font-sans text-sm text-white">{m.playerName}</span>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
                    m.role === 'leader'
                      ? 'text-white'
                      : m.role === 'deputy'
                        ? 'text-[var(--text-soft)]'
                        : 'text-[var(--text-mute)]'
                  }`}
                >
                  {m.role}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  {new Date(m.joinedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
        {label}
      </p>
      <p
        className={`mt-1 ${mono ? 'font-mono text-[11px]' : 'font-sans text-sm'} text-[var(--text-soft)]`}
      >
        {value}
      </p>
    </div>
  );
}
