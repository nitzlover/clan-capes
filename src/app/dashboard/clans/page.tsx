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
 * across the panel's servers, plus an inline editor for every row.
 * Admins can rename, recolor, fix display names left over from a
 * PowerClans import, promote / demote members, transfer leadership,
 * remove members, and disband the whole clan. Every mutation writes
 * an `admin:<username>` audit row.
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

  async function refreshNames() {
    if (!serverId) return;
    if (!confirm('Re-resolve every "Leader" / "Member" placeholder name via Mojang? Existing real names are untouched.')) {
      return;
    }
    try {
      const res = await api<{
        refreshed: number;
        skipped: number;
        report: Array<{ uuid: string; old: string; new?: string; reason?: string }>;
      }>('/panel/clans/backfill-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });
      alert(
        `Refreshed ${res.refreshed}, skipped ${res.skipped}.\n\n` +
          res.report
            .map((r) =>
              r.new
                ? `${r.old} → ${r.new}`
                : `${r.old}: ${r.reason ?? 'no change'}`,
            )
            .join('\n'),
      );
      load(serverId);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Refresh failed');
    }
  }

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
            DB-backed roster — inspect and edit every clan registered with the panel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {serverId && (
            <>
              <button
                onClick={refreshNames}
                className="btn-ghost"
                title='Re-resolve "Leader" placeholder names via Mojang'
              >
                ⟳ Refresh names
              </button>
              <button
                onClick={importFromPowerClans}
                className="btn-ghost"
                title="Pull PowerClans data via the plugin REST"
              >
                + Import PowerClans
              </button>
            </>
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
              <code className="text-[var(--text-soft)]">/clan create</code> or hit{' '}
              <strong className="text-white">+ Import PowerClans</strong> above.
            </p>
          </div>
        ) : (
          <ul>
            {clans.map((c) => (
              <ClanRow
                key={c.id}
                clan={c}
                serverId={serverId}
                onChange={() => load(serverId)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ClanRow({
  clan,
  serverId,
  onChange,
}: {
  clan: Clan;
  serverId: number | null;
  onChange: () => void;
}) {
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
        <ClanEditor clan={clan} serverId={serverId} onChange={onChange} />
      )}
    </li>
  );
}

function ClanEditor({
  clan,
  serverId,
  onChange,
}: {
  clan: Clan;
  serverId: number | null;
  onChange: () => void;
}) {
  const qs = serverId ? `?serverId=${serverId}` : '';
  const [name, setName] = useState(clan.name);
  const [color, setColor] = useState(clan.colorHex);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function saveMeta() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/panel/clans/${clan.tag}${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, colorHex: color }),
      });
      setMsg({ kind: 'ok', text: 'Saved.' });
      onChange();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  async function disband() {
    if (!confirm(`Disband ${clan.tag}? Members are marked as left; rows stay for audit.`)) return;
    setBusy(true);
    try {
      await api(`/panel/clans/${clan.tag}${qs}`, { method: 'DELETE' });
      onChange();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Disband failed' });
    } finally {
      setBusy(false);
    }
  }

  async function memberEdit(uuid: string, body: Record<string, unknown>) {
    try {
      await api(`/panel/clans/${clan.tag}/members/${uuid}${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onChange();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Member edit failed');
    }
  }

  async function memberKick(uuid: string, name: string) {
    if (!confirm(`Remove ${name} from ${clan.tag}?`)) return;
    try {
      await api(`/panel/clans/${clan.tag}/members/${uuid}${qs}`, { method: 'DELETE' });
      onChange();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Kick failed');
    }
  }

  async function transfer(uuid: string, name: string) {
    if (!confirm(`Make ${name} the new leader of ${clan.tag}? The current leader becomes deputy.`)) return;
    try {
      await api(`/panel/clans/${clan.tag}/transfer${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newLeaderUuid: uuid }),
      });
      onChange();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Transfer failed');
    }
  }

  return (
    <div className="border-t border-[var(--rule)] bg-[var(--bg-sink)] px-6 py-5">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="label-mono mb-3">Edit clan</p>
          <div className="space-y-3">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input mt-1"
                maxLength={32}
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Color
              </span>
              <span className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="h-10 w-12 cursor-pointer border-2 border-[var(--rule-strong)] bg-transparent"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="input font-mono"
                  maxLength={7}
                />
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={saveMeta} disabled={busy} className="btn-primary disabled:opacity-40">
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button onClick={disband} disabled={busy} className="btn-danger-link">
                Disband clan
              </button>
              {msg && (
                <span
                  className={`font-mono text-[11px] uppercase tracking-[0.22em] ${
                    msg.kind === 'ok' ? 'text-[var(--text-soft)]' : 'text-white'
                  }`}
                >
                  {msg.kind === 'ok' ? '✓' : '!'} {msg.text}
                </span>
              )}
            </div>
          </div>
        </div>
        <div>
          <p className="label-mono mb-3">Meta</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px]">
            <Field label="ID" value={`#${clan.id}`} />
            <Field label="Created" value={new Date(clan.createdAt).toLocaleString()} />
            <Field label="Leader UUID" value={clan.leaderUuid} wide />
          </div>
        </div>
      </div>

      <p className="label-mono mt-6 mb-2">Members</p>
      <ul className="border-t border-[var(--rule)]">
        {clan.members.map((m) => (
          <MemberRow
            key={m.playerUuid}
            m={m}
            onRoleChange={(role) => memberEdit(m.playerUuid, { role })}
            onRename={(playerName) => memberEdit(m.playerUuid, { playerName })}
            onKick={() => memberKick(m.playerUuid, m.playerName)}
            onTransfer={() => transfer(m.playerUuid, m.playerName)}
          />
        ))}
      </ul>
    </div>
  );
}

function MemberRow({
  m,
  onRoleChange,
  onRename,
  onKick,
  onTransfer,
}: {
  m: Member;
  onRoleChange: (role: 'member' | 'deputy') => void;
  onRename: (name: string) => void;
  onKick: () => void;
  onTransfer: () => void;
}) {
  const [name, setName] = useState(m.playerName);
  const dirty = name !== m.playerName;
  return (
    <li className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-[var(--rule)] py-3 last:border-b-0">
      <span className="flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => dirty && onRename(name.trim())}
          className="input max-w-[200px] py-1.5 text-sm"
          maxLength={32}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
          {m.playerUuid.slice(0, 8)}…
        </span>
      </span>
      {m.role === 'leader' ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white">
          leader
        </span>
      ) : (
        <select
          value={m.role}
          onChange={(e) => onRoleChange(e.target.value as 'member' | 'deputy')}
          className="input max-w-[120px] py-1 font-mono text-[10px] uppercase tracking-[0.22em]"
        >
          <option value="member">member</option>
          <option value="deputy">deputy</option>
        </select>
      )}
      <button
        onClick={onTransfer}
        disabled={m.role === 'leader'}
        className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline disabled:opacity-30"
      >
        promote → leader
      </button>
      <button
        onClick={onKick}
        disabled={m.role === 'leader'}
        className="btn-danger-link disabled:opacity-30"
      >
        Remove
      </button>
    </li>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 break-all text-[var(--text-soft)]">{value}</p>
    </div>
  );
}
