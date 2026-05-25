'use client';

/**
 * /dashboard/leaderboard — clan + player K/D rankings for the active
 * season. Bottom of the page exposes the (irreversible) "reset season"
 * admin button that bumps the active season key on the current server.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';

type ClanRow = {
  clanId: number;
  tag: string;
  name: string;
  colorHex: string;
  kills: number;
  deaths: number;
  kd: number;
};

type PlayerRow = {
  playerUuid: string;
  playerName: string | null;
  clanTag: string | null;
  kills: number;
  deaths: number;
  kd: number;
};

type LeaderboardResponse = {
  season: string;
  serverId: number;
  clans: ClanRow[];
  players: PlayerRow[];
};

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api<LeaderboardResponse>('/panel/leaderboard');
      setData(resp);
      setError('');
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function resetSeason() {
    if (!data) return;
    const next = prompt(
      'New season key — e.g. 2026-Q3 or "season-2". Leave empty to use the quarter default.',
      '',
    );
    if (next === null) return;
    if (
      !confirm(
        `Bump active season to "${next || '(quarter default)'}"? Previous totals are kept under "${data.season}" and the new leaderboard starts at 0.`,
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const resp = await api<{ ok: boolean; season: string }>(
        '/panel/season-reset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId: data.serverId,
            seasonKey: next.trim() || undefined,
          }),
        },
      );
      alert(`Active season is now ${resp.season}.`);
      void reload();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">
            Active season {data ? <code className="font-mono">{data.season}</code> : '…'} — sorted by K/D desc.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-mute)]">Loading…</p>
      ) : error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      ) : data ? (
        <>
          <section className="brutal-card mb-6 p-0">
            <div className="border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-5 py-3">
              <span className="label-mono">Clans ({data.clans.length})</span>
            </div>
            {data.clans.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[var(--text-mute)]">
                No clan kills logged yet.
              </p>
            ) : (
              <ul>
                {data.clans.map((c, i) => (
                  <li
                    key={c.clanId}
                    className="grid grid-cols-[40px_auto_1fr_repeat(3,90px)] items-center gap-3 border-b border-[var(--rule)] px-5 py-3 last:border-b-0"
                  >
                    <span className="font-mono text-[12px] text-[var(--text-faint)]">
                      #{i + 1}
                    </span>
                    <span
                      aria-hidden
                      className="h-6 w-6 border-2 border-[var(--rule-strong)]"
                      style={{ backgroundColor: c.colorHex }}
                    />
                    <span>
                      <span className="block text-sm text-white">[{c.tag}]</span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {c.name}
                      </span>
                    </span>
                    <span className="text-right font-mono text-[11px] text-[var(--text-soft)]">
                      {c.kills} K
                    </span>
                    <span className="text-right font-mono text-[11px] text-[var(--text-faint)]">
                      {c.deaths} D
                    </span>
                    <span className="text-right font-mono text-[12px] text-white">
                      {c.kd.toFixed(2)} K/D
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="brutal-card mb-6 p-0">
            <div className="border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-5 py-3">
              <span className="label-mono">Players ({data.players.length})</span>
            </div>
            {data.players.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[var(--text-mute)]">
                No player kills logged yet.
              </p>
            ) : (
              <ul>
                {data.players.map((p, i) => (
                  <li
                    key={p.playerUuid}
                    className="grid grid-cols-[40px_1fr_auto_repeat(3,90px)] items-center gap-3 border-b border-[var(--rule)] px-5 py-3 last:border-b-0"
                  >
                    <span className="font-mono text-[12px] text-[var(--text-faint)]">
                      #{i + 1}
                    </span>
                    <span>
                      <span className="block text-sm text-white">
                        {p.playerName ?? p.playerUuid.slice(0, 8) + '…'}
                      </span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {p.playerUuid.slice(0, 8)}…
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
                      {p.clanTag ?? '—'}
                    </span>
                    <span className="text-right font-mono text-[11px] text-[var(--text-soft)]">
                      {p.kills} K
                    </span>
                    <span className="text-right font-mono text-[11px] text-[var(--text-faint)]">
                      {p.deaths} D
                    </span>
                    <span className="text-right font-mono text-[12px] text-white">
                      {p.kd.toFixed(2)} K/D
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="brutal-card border-white p-5">
            <p className="label-mono mb-2 text-white">Reset season</p>
            <p className="text-sm text-[var(--text-mute)]">
              Bumps the active season pointer. Previous aggregates stay
              addressable under the old key (history is never destroyed)
              and the new leaderboard starts at zero.
            </p>
            <button
              type="button"
              onClick={resetSeason}
              disabled={resetting}
              className="brutal-btn mt-4 disabled:opacity-40"
            >
              {resetting ? 'Resetting…' : 'Bump active season'}
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}
