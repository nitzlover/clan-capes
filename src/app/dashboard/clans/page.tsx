'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';
import { nearestVanilla } from '@/lib/vanilla-color';
import {
  ArmorTrimEditor,
  type ArmorTrimRecord,
} from '@/components/ArmorTrimEditor';

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
  stats?: { kills: number; deaths: number; kd: number };
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
  // Set of lowercased UUIDs currently online on the selected server.
  // `null` = no fresh heartbeat (snapshot stale) → UI shows the
  // "unknown" dot. Polled every 30s in lockstep with the panel cache.
  const [onlineUuids, setOnlineUuids] = useState<Set<string> | null>(null);

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

  // Poll the in-memory online cache so the green dots stay live without
  // refreshing the whole clan list. Cheap (single endpoint, no DB hit
  // on the panel side) — 30 s interval matches the heartbeat cadence
  // tolerance without flooding the network.
  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    async function poll() {
      try {
        const resp = await api<{
          source: 'plugin' | 'stale';
          uuids: string[];
        }>(`/panel/online?serverId=${serverId}`);
        if (cancelled) return;
        if (resp.source === 'plugin') {
          setOnlineUuids(new Set(resp.uuids.map((u) => u.toLowerCase())));
        } else {
          setOnlineUuids(null);
        }
      } catch {
        // Don't surface to the user — stale dots are tolerable.
        if (!cancelled) setOnlineUuids(null);
      }
    }
    poll();
    const handle = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [serverId]);

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
            <button
              onClick={refreshNames}
              className="btn-ghost"
              title='Re-resolve "Leader" placeholder names via Mojang'
            >
              ⟳ Refresh names
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
                onlineUuids={onlineUuids}
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
  onlineUuids,
  onChange,
}: {
  clan: Clan;
  serverId: number | null;
  onlineUuids: Set<string> | null;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const leader = clan.members.find((m) => m.role === 'leader');
  // How many members of this clan are currently online — feeds the
  // header chip so the operator can see clan activity at a glance
  // without expanding the row.
  const onlineCount =
    onlineUuids === null
      ? null
      : clan.members.filter((m) => onlineUuids.has(m.playerUuid.toLowerCase())).length;

  return (
    <li className="border-b border-[var(--rule)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-5 px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
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
          {onlineCount !== null && (
            <span
              className="ml-2 inline-flex items-center gap-1 text-[var(--text-soft)]"
              title={`${onlineCount} online now`}
            >
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${
                  onlineCount > 0 ? 'bg-[#5fd068]' : 'bg-[var(--rule-strong)]'
                }`}
              />
              {onlineCount} online
            </span>
          )}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)] sm:inline">
          {leader?.playerName ?? '—'}
        </span>
        {clan.stats && (
          <span
            className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-mute)] md:inline"
            title={`${clan.stats.kills} kills · ${clan.stats.deaths} deaths`}
          >
            {clan.stats.kd.toFixed(2)} K/D
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ClanEditor
          clan={clan}
          serverId={serverId}
          onlineUuids={onlineUuids}
          onChange={onChange}
        />
      )}
    </li>
  );
}

function ClanEditor({
  clan,
  serverId,
  onlineUuids,
  onChange,
}: {
  clan: Clan;
  serverId: number | null;
  onlineUuids: Set<string> | null;
  onChange: () => void;
}) {
  const qs = serverId ? `?serverId=${serverId}` : '';
  const [name, setName] = useState(clan.name);
  const [color, setColor] = useState(clan.colorHex);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // Armour-trim section is opt-in — keeps the row compact when the
  // operator is just renaming or kicking members, and avoids paying
  // the WebGL + texture fetch cost until they actually want to edit
  // trims.
  const [showTrims, setShowTrims] = useState(false);

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
              <ColorSnapPreview hex={color} />
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

      <button
        type="button"
        onClick={() => setShowTrims((s) => !s)}
        className="mt-6 mb-2 flex w-full items-center justify-between border-b border-[var(--rule)] pb-2 text-left transition-colors hover:border-[var(--rule-strong)]"
        aria-expanded={showTrims}
      >
        <span className="label-mono">Armour trims</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
          {showTrims ? '▾ hide' : '▸ show'}
        </span>
      </button>
      {showTrims && (
        <ArmorTrimEditor
          loadTrims={async () => {
            const r = await api<{ trims: ArmorTrimRecord[] }>(
              `/panel/clans/${clan.tag}/armor-trim${qs}`,
            );
            return r.trims;
          }}
          saveSlot={async (slot, material, pattern) => {
            await api(`/panel/clans/${clan.tag}/armor-trim/${slot}${qs}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ material, pattern }),
            });
          }}
          clearSlot={async (slot) => {
            await api(`/panel/clans/${clan.tag}/armor-trim/${slot}${qs}`, {
              method: 'DELETE',
            });
          }}
        />
      )}

      <p className="label-mono mt-6 mb-2">Members</p>
      <ul className="border-t border-[var(--rule)]">
        {clan.members.map((m) => (
          <MemberRow
            key={m.playerUuid}
            m={m}
            online={
              onlineUuids === null
                ? null
                : onlineUuids.has(m.playerUuid.toLowerCase())
            }
            onRoleChange={(role) => memberEdit(m.playerUuid, { role })}
            onRename={(playerName) => memberEdit(m.playerUuid, { playerName })}
            onKick={() => memberKick(m.playerUuid, m.playerName)}
            onTransfer={() => transfer(m.playerUuid, m.playerName)}
          />
        ))}
      </ul>

      <AddMemberForm clanTag={clan.tag} qs={qs} onAdded={onChange} />
    </div>
  );
}

function MemberRow({
  m,
  online,
  onRoleChange,
  onRename,
  onKick,
  onTransfer,
}: {
  m: Member;
  /** `true` online, `false` offline, `null` snapshot stale → unknown. */
  online: boolean | null;
  onRoleChange: (role: 'member' | 'deputy') => void;
  onRename: (name: string) => void;
  onKick: () => void;
  onTransfer: () => void;
}) {
  const [name, setName] = useState(m.playerName);
  const dirty = name !== m.playerName;
  const dotClass =
    online === null
      ? 'bg-[var(--rule-strong)]'
      : online
        ? 'bg-[#5fd068]'
        : 'bg-[var(--rule)]';
  const dotTitle =
    online === null ? 'No fresh heartbeat' : online ? 'Online now' : 'Offline';
  return (
    <li className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-[var(--rule)] py-3 last:border-b-0">
      <span className="flex items-center gap-3">
        <span
          aria-label={dotTitle}
          title={dotTitle}
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClass}`}
        />
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

/**
 * Inline "add member" form for the expanded clan editor. Admins use
 * this to roster a player without bouncing through the in-game
 * /clan invite + accept flow — handy when on-boarding a new operator
 * or repairing a botched import. The endpoint enforces the single-
 * clan-per-player rule and surfaces a friendly 409 if the player is
 * already rostered somewhere.
 */
function AddMemberForm({
  clanTag,
  qs,
  onAdded,
}: {
  clanTag: string;
  qs: string;
  onAdded: () => void;
}) {
  const [uuid, setUuid] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [role, setRole] = useState<'member' | 'deputy'>('member');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const uuidLooksOk =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      uuid,
    );
  const nameOk = playerName.trim().length > 0 && playerName.trim().length <= 32;
  const canSubmit = uuidLooksOk && nameOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/panel/clans/${clanTag}/members${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerUuid: uuid,
          playerName: playerName.trim(),
          role,
        }),
      });
      setUuid('');
      setPlayerName('');
      setRole('member');
      onAdded();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setErr(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t-2 border-[var(--rule-strong)] pt-5">
      <p className="label-mono mb-3">Add member</p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Player UUID
          </span>
          <input
            value={uuid}
            onChange={(e) => setUuid(e.target.value.trim())}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="input mt-1 font-mono"
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Display name
          </span>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Mojang name"
            className="input mt-1"
            maxLength={32}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'deputy')}
            className="input mt-1 font-mono text-[11px] uppercase tracking-[0.22em]"
          >
            <option value="member">member</option>
            <option value="deputy">deputy</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="btn-primary w-full disabled:opacity-40"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
      {err && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {err}
        </p>
      )}
    </div>
  );
}

/**
 * Shows the operator exactly which vanilla §-code the picked 24-bit
 * colour will snap to in chat + TAB + scoreboard team prefix. Pure
 * preview — no inputs, no callbacks — so it can be dropped anywhere
 * a clan colour is being edited.
 */
function ColorSnapPreview({ hex }: { hex: string }) {
  const snap = useMemo(() => nearestVanilla(hex), [hex]);
  return (
    <span className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-mute)]">
      <span aria-hidden>renders as</span>
      <span
        aria-hidden
        className="inline-block h-4 w-4 border border-[var(--rule-strong)]"
        style={{ backgroundColor: snap.hex }}
      />
      <span className="text-[var(--text-soft)]">
        §{snap.code} · {snap.name}
      </span>
    </span>
  );
}
