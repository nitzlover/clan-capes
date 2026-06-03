'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SelectServerPrompt } from '@/components/ServerPicker';
import { useSelectedServer } from '@/lib/selected-server';
import { api, UnauthorizedError } from '@/lib/api';
import { nearestVanilla } from '@/lib/vanilla-color';
import {
  ArmorTrimEditor,
  type ArmorTrimRecord,
} from '@/components/ArmorTrimEditor';
import { MemberCard3D } from '@/components/MemberCard3D';
import { Select, type SelectOption } from '@/components/Select';
import { Reveal } from '@/components/motion';
import { SkeletonRows } from '@/components/Skeleton';

/** member / deputy role choices for the custom <Select> (leader uses /transfer). */
const ROLE_OPTIONS: SelectOption[] = [
  { value: 'member', label: 'member' },
  { value: 'deputy', label: 'deputy' },
];

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
  friendlyFire: boolean;
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
  // 1.0.13 — drop the page-local server picker. The dashboard layout
  // mounts a global <ServerPicker> that this page now reads via
  // useSelectedServer; the old in-page <select> would compete with
  // the global one and confuse the operator.
  const { value: globalServerId } = useSelectedServer();
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const serverId: number | null =
    typeof globalServerId === 'number' ? globalServerId : null;
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // 150ms debounced filter input — keeps re-renders cheap on big rosters
  // without lagging behind every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 150);
    return () => window.clearTimeout(handle);
  }, [query]);
  const visibleClans = useMemo(() => {
    if (!debouncedQuery) return clans;
    return clans.filter((c) => {
      if (c.tag.toLowerCase().includes(debouncedQuery)) return true;
      if (c.name.toLowerCase().includes(debouncedQuery)) return true;
      return c.members.some((m) =>
        m.playerName.toLowerCase().includes(debouncedQuery),
      );
    });
  }, [clans, debouncedQuery]);
  // Set of lowercased UUIDs currently online on the selected server.
  // `null` = no fresh heartbeat (snapshot stale) → UI shows the
  // "unknown" dot. Polled every 30s in lockstep with the panel cache.
  const [onlineUuids, setOnlineUuids] = useState<Set<string> | null>(null);

  const load = useCallback(
    async (id: number | null) => {
      if (id === null) {
        setServers([]);
        setClans([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await api<{
          clans: Clan[];
          servers: ServerOpt[];
          serverId?: number;
        }>(`/panel/clans-list?serverId=${id}`);
        setServers(res.servers);
        setClans(res.clans);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setClans([]);
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    load(serverId);
  }, [load, serverId]);

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
          {/* 1.0.13 — local server <select> removed. Global ServerPicker
              in the dashboard layout drives this page now. */}
        </div>
      </div>

      <section className="brutal-card">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-6 py-4">
          <span className="label-mono">Registered clans</span>
          <div className="flex items-center gap-3">
            {clans.length > 0 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tag / name / member…"
                aria-label="Search clans"
                className="input h-9 w-[260px] max-w-[40vw] font-mono text-[11px] uppercase tracking-[0.16em]"
              />
            )}
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              {debouncedQuery
                ? `${visibleClans.length}/${clans.length}`
                : `${clans.length} total`}
            </span>
          </div>
        </div>
        {loading ? (
          <div className="px-6 py-4">
            <SkeletonRows rows={6} />
          </div>
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
        ) : visibleClans.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
              No clans match "{debouncedQuery}".
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-2 text-xs text-[var(--text-soft)] underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <Reveal>
            <ul>
              {visibleClans.map((c) => (
                <ClanRow
                  key={c.id}
                  clan={c}
                  serverId={serverId}
                  onlineUuids={onlineUuids}
                  onChange={() => load(serverId)}
                />
              ))}
            </ul>
          </Reveal>
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
              <OnlineDot count={onlineCount} />
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
  // 3D roster row is also opt-in — each card is its own WebGL
  // context (skinview3d) and a 20-member clan would otherwise blow
  // past the browser's context cap the moment the row expands.
  const [show3D, setShow3D] = useState(false);

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

  // Compact one-glance health summary — duplicates a few fields the
  // collapsed row also shows, but having them side-by-side at the top
  // of the editor saves the operator a scroll up to compare.
  const editorOnlineCount =
    onlineUuids === null
      ? null
      : clan.members.filter((m) => onlineUuids.has(m.playerUuid.toLowerCase())).length;

  return (
    <div className="border-t border-[var(--rule)] bg-[var(--bg-sink)] px-6 py-5">
      <KpiStrip clan={clan} onlineCount={editorOnlineCount} />
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
            <FriendlyFireSwitch clan={clan} onChange={onChange} qs={qs} />
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

      <button
        type="button"
        onClick={() => setShow3D((s) => !s)}
        className="mt-6 mb-2 flex w-full items-center justify-between border-b border-[var(--rule)] pb-2 text-left transition-colors hover:border-[var(--rule-strong)]"
        aria-expanded={show3D}
      >
        <span className="label-mono">3D roster</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
          {show3D ? '▾ hide' : '▸ show'}
        </span>
      </button>
      {show3D && (
        <div className="-mx-1 mb-4 flex flex-wrap justify-center gap-3 px-1 py-3">
          {clan.members.map((m, i) => (
            <MemberCard3D
              key={m.playerUuid}
              playerUuid={m.playerUuid}
              playerName={m.playerName}
              role={m.role}
              subtitle={
                onlineUuids === null
                  ? undefined
                  : onlineUuids.has(m.playerUuid.toLowerCase())
                    ? '● online'
                    : 'offline'
              }
              // Lazy-mount everyone past the first six so a clan
              // with 30 members doesn't fire 30 WebGL contexts the
              // moment 3D roster expands.
              lazy={i >= 6}
            />
          ))}
        </div>
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

      <ActivityFeed clanTag={clan.tag} />
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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--rule)] py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
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
        <span className="font-sans text-xs font-semibold text-white">
          leader
        </span>
      ) : (
        <Select
          value={m.role}
          options={ROLE_OPTIONS}
          onChange={(v) => onRoleChange(v as 'member' | 'deputy')}
          aria-label="Member role"
          minWidth={120}
          className="max-w-[130px]"
        />
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
        <div className="field">
          <span className="label-soft">role</span>
          <Select
            value={role}
            options={ROLE_OPTIONS}
            onChange={(v) => setRole(v as 'member' | 'deputy')}
            aria-label="New member role"
          />
        </div>
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
/**
 * Online indicator dot. Continuously pulses while the clan has at
 * least one member online (subtle ambient signal that the row is
 * "alive"), and replays a one-shot punch every time the count
 * actually changes so the user catches the delta even mid-glance.
 *
 * Implementation: `key={count}` forces the inner element to remount,
 * which restarts the `pulse-dot-on` CSS animation (defined in
 * globals.css). When count > 0 we layer an `infinite` animation on
 * top via inline style; otherwise the dot stays static grey.
 */
function OnlineDot({ count }: { count: number }) {
  const live = count > 0;
  return (
    <span
      key={count}
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full ${
        live ? 'bg-[#5fd068]' : 'bg-[var(--rule-strong)]'
      }`}
      style={live ? { animation: 'pulse-dot-on 1s ease-out' } : undefined}
    />
  );
}

/**
 * Compact KPI chip strip — sits at the top of the expanded
 * ClanEditor so the operator gets a one-glance health summary
 * before diving into the editor. Reads only from props (no extra
 * fetches) so it adds zero latency to expand.
 *
 * Chips skipped for now because they'd each cost a network round-
 * trip the row otherwise wouldn't pay: trims count, banner ✓,
 * latest edit. Re-open if/when we move those into the clans-list
 * payload.
 */
function KpiStrip({
  clan,
  onlineCount,
}: {
  clan: Clan;
  onlineCount: number | null;
}) {
  const total = clan.members.length;
  const onlinePct =
    onlineCount === null || total === 0 ? null : Math.round((onlineCount / total) * 100);
  const ageDays = useMemo(() => {
    const t = Date.parse(clan.createdAt);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  }, [clan.createdAt]);

  const chips: { label: string; value: string; title?: string }[] = [];
  if (clan.stats) {
    chips.push({
      label: 'K/D',
      value: clan.stats.kd.toFixed(2),
      title: `${clan.stats.kills} kills · ${clan.stats.deaths} deaths`,
    });
  }
  if (onlineCount !== null && onlinePct !== null) {
    chips.push({
      label: 'Online',
      value: `${onlineCount}/${total} ${onlinePct}%`,
      title: 'Online of total members',
    });
  } else {
    chips.push({ label: 'Members', value: String(total) });
  }
  if (ageDays !== null) {
    chips.push({
      label: 'Age',
      value: ageDays >= 1 ? `${ageDays}d` : '<1d',
      title: new Date(clan.createdAt).toLocaleString(),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          title={c.title}
          className="inline-flex items-center gap-2 border border-[var(--rule-strong)] bg-[var(--bg-sink)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em]"
        >
          <span className="text-[var(--text-faint)]">{c.label}</span>
          <span className="text-[var(--text-soft)]">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Optimistic friendly-fire toggle.
 *
 * Hits the same PATCH endpoint that name + colour use, but renders
 * separately so the boolean state has its own visual affordance
 * instead of hiding behind a Save button. Flips locally on click,
 * reverts on server error.
 */
function FriendlyFireSwitch({
  clan,
  onChange,
  qs,
}: {
  clan: Clan;
  onChange: () => void;
  qs: string;
}) {
  const [value, setValue] = useState(clan.friendlyFire);
  const [busy, setBusy] = useState(false);
  // Reset local state if the parent reloads a fresh clan row (e.g.
  // after disband/recreate, or a race with another panel session).
  useEffect(() => {
    setValue(clan.friendlyFire);
  }, [clan.friendlyFire]);

  async function toggle() {
    if (busy) return;
    const next = !value;
    setValue(next);
    setBusy(true);
    try {
      await api(`/panel/clans/${clan.tag}${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendlyFire: next }),
      });
      onChange();
    } catch (e) {
      setValue(!next);
      if (!(e instanceof UnauthorizedError)) {
        alert(e instanceof Error ? e.message : 'Toggle failed');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="label-soft">friendly fire</span>
      <div className="toggle-row">
        <span className="text-sm text-[var(--text-soft)]">
          {value ? 'on — PvP allowed inside clan' : 'off — clan damage blocked'}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={value}
          aria-label="Toggle friendly fire"
          className={`toggle-switch ${value ? 'is-on' : ''}`}
        >
          <span aria-hidden className="thumb" />
        </button>
      </div>
    </div>
  );
}

/**
 * Recent operator activity for one clan — last ~10 audit rows where
 * `target = clan.tag`. Collapsed by default so an operator who just
 * wants to rename a clan doesn't pay the fetch; expanding lazily
 * loads the feed.
 *
 * Each row mixes the action keyword (CLAN_EDIT, BANNER_SET,
 * ARMOR_TRIM_SET, ANNOUNCEMENT_EDIT, etc.) with the actor and a
 * relative time stamp. No filter UI — that's what /dashboard/audit
 * is for; this is the inline shortcut.
 */
type AuditRow = {
  id?: string;
  timestamp: string;
  actor?: string;
  action?: string;
  target?: string | null;
  payload?: unknown;
  raw?: string;
};

const ACTION_ICONS: Record<string, string> = {
  CLAN_CREATE: '+ ',
  CLAN_EDIT: '~ ',
  CLAN_DISBAND: '× ',
  BANNER_SET: '⚑ ',
  BANNER_CLEAR: '⚑ ',
  CAPE_UPLOAD: '↑ ',
  CAPE_DELETE: '× ',
  ARMOR_TRIM_SET: '◆ ',
  ARMOR_TRIM_CLEAR: '× ',
  ANNOUNCEMENT_EDIT: '✎ ',
  ANNOUNCEMENT_CLEAR: '× ',
  MEMBER_JOIN: '+ ',
  MEMBER_LEAVE: '− ',
  MEMBER_KICK: '× ',
  MEMBER_ROLE: '~ ',
  TRANSFER: '⇄ ',
};

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ActivityFeed({ clanTag }: { clanTag: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ entries: AuditRow[] }>(
          `/panel/audit?target=${encodeURIComponent(clanTag)}&limit=10`,
        );
        if (cancelled) return;
        setRows(res.entries);
        setLoaded(true);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, clanTag]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between border-b border-[var(--rule)] pb-2 text-left transition-colors hover:border-[var(--rule-strong)]"
        aria-expanded={open}
      >
        <span className="label-mono">Activity</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
          {open ? '▾ hide' : '▸ show'}
        </span>
      </button>
      {open && (
        <div className="space-y-2">
          {!loaded && !error && (
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Loading…
            </p>
          )}
          {error && (
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
              ! {error}
            </p>
          )}
          {loaded && rows.length === 0 && (
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              No activity for {clanTag}.
            </p>
          )}
          {loaded && rows.length > 0 && (
            <ul className="border-t border-[var(--rule)]">
              {rows.map((r, i) => {
                const icon = r.action ? ACTION_ICONS[r.action] ?? '· ' : '· ';
                return (
                  <li
                    key={r.id ?? i}
                    className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-b border-[var(--rule)] py-2 font-mono text-[11px]"
                  >
                    <span className="text-[var(--text-mute)]">{icon}</span>
                    <span className="truncate text-[var(--text-soft)]">
                      <span className="text-white">{r.action ?? 'EVENT'}</span>
                      {r.actor ? ` · ${r.actor}` : ''}
                      {r.raw ? ` · ${r.raw}` : ''}
                    </span>
                    <span
                      className="text-[var(--text-faint)] tabular"
                      title={new Date(r.timestamp).toLocaleString()}
                    >
                      {relativeTime(r.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

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
