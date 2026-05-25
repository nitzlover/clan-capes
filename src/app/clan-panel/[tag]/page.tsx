'use client';

/**
 * Leader-scoped clan dashboard.
 *
 * Loaded after the token exchange flow has set the clp_session cookie.
 * Every fetch goes through `leaderApi()` which redirects to /clan-panel
 * on a 401 so a logged-out tab self-heals back to the paste form.
 *
 * Sections:
 *   - Header: clan tag + name + colour swatch + role badge + logout
 *   - Clan info: editable name + colour
 *   - Members: list with role + last-seen, kick + transfer buttons
 *   - Banner: small CTA pointing at the (admin-style) banner editor —
 *     full pattern picker is shared with /dashboard/banners so we just
 *     render the current swatch + a "manage banner" link inline.
 *   - Danger zone: disband (leader only)
 *
 * The page is intentionally narrower than /dashboard/clans because a
 * leader only has one clan in scope — no server picker, no clan list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

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

type Banner = {
  baseColor: number;
  patterns: { color: number; pattern: string }[];
  updatedAt: string;
  updatedBy: string;
} | null;

type StatsRow = { kills: number; deaths: number; kd: number };

type ClanResponse = {
  clan: Clan;
  role: 'leader' | 'deputy';
  banner: Banner;
  season: string;
  stats: { season: StatsRow; lifetime: StatsRow };
  memberStats: Array<{ playerUuid: string; kills: number; deaths: number; kd: number }>;
};

type Me = {
  playerUuid: string;
  playerName: string;
  serverId: number;
  clan: string;
  role: 'leader' | 'deputy';
};

class LeaderUnauthorizedError extends Error {}

async function leaderApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) {
    throw new LeaderUnauthorizedError('Session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function ClanPanelTagPage() {
  const router = useRouter();
  const params = useParams<{ tag: string }>();
  const tag = (params?.tag ?? '').toUpperCase();

  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<ClanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const meResp = await leaderApi<Me>('/api/leader/me');
      setMe(meResp);
      // Server-claimed clan wins — if the URL points at a different
      // tag, bounce to the right one rather than refusing to render.
      if (meResp.clan !== tag) {
        router.replace(`/clan-panel/${encodeURIComponent(meResp.clan)}`);
        return;
      }
      const resp = await leaderApi<ClanResponse>(
        `/api/leader/clans/${encodeURIComponent(tag)}`,
      );
      setData(resp);
      setError('');
    } catch (e) {
      if (e instanceof LeaderUnauthorizedError) {
        router.replace('/clan-panel');
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router, tag]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-[var(--text-mute)]">Loading…</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      </main>
    );
  }
  if (!data || !me) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <HeaderBar me={me} clan={data.clan} role={data.role} onLogout={async () => {
        await fetch('/api/leader/logout', { method: 'POST' }).catch(() => {});
        router.replace('/clan-panel');
      }} />
      <StatsChips season={data.season} stats={data.stats} />
      <ClanInfoSection clan={data.clan} onSaved={reload} />
      <MembersSection
        clan={data.clan}
        me={me}
        role={data.role}
        memberStats={data.memberStats}
        onChange={reload}
      />
      <BannerSection clan={data.clan} banner={data.banner} onChange={reload} />
      {data.role === 'leader' && (
        <DangerZone clan={data.clan} onDisbanded={() => router.replace('/clan-panel')} />
      )}
    </main>
  );
}

function StatsChips({
  season,
  stats,
}: {
  season: string;
  stats: { season: StatsRow; lifetime: StatsRow };
}) {
  return (
    <div className="brutal-card mb-6 grid gap-4 p-5 md:grid-cols-2">
      <StatBlock label={`Season · ${season}`} row={stats.season} />
      <StatBlock label="Lifetime" row={stats.lifetime} />
    </div>
  );
}

function StatBlock({ label, row }: { label: string; row: StatsRow }) {
  return (
    <div>
      <p className="label-mono text-[var(--text-faint)]">{label}</p>
      <p className="mt-2 flex items-baseline gap-3 font-mono">
        <span className="text-2xl text-white">{row.kd.toFixed(2)}</span>
        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
          K/D
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
          {row.kills} K · {row.deaths} D
        </span>
      </p>
    </div>
  );
}

function HeaderBar({
  me,
  clan,
  role,
  onLogout,
}: {
  me: Me;
  clan: Clan;
  role: 'leader' | 'deputy';
  onLogout: () => void;
}) {
  return (
    <div className="brutal-card mb-6 flex items-center gap-5 p-5">
      <span
        aria-hidden
        className="h-12 w-12 border-2 border-[var(--rule-strong)]"
        style={{ backgroundColor: clan.colorHex }}
      />
      <div className="flex-1">
        <h1 className="page-title text-2xl">
          [{clan.tag}] {clan.name}
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-mute)]">
          Signed in as {me.playerName} · {role}
        </p>
      </div>
      <button onClick={onLogout} className="btn-danger-link">
        Sign out
      </button>
    </div>
  );
}

function ClanInfoSection({
  clan,
  onSaved,
}: {
  clan: Clan;
  onSaved: () => void;
}) {
  const [name, setName] = useState(clan.name);
  const [color, setColor] = useState(clan.colorHex);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Reset local edits whenever the parent reloads the clan.
  useEffect(() => {
    setName(clan.name);
    setColor(clan.colorHex);
  }, [clan.name, clan.colorHex]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await leaderApi(`/api/leader/clans/${encodeURIComponent(clan.tag)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, colorHex: color }),
      });
      setMsg({ kind: 'ok', text: 'Saved.' });
      onSaved();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="brutal-card mb-6 p-5">
      <p className="label-mono mb-3">Edit clan</p>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto]">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="brutal-input mt-1 w-full"
            maxLength={32}
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Colour
          </span>
          <span className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="h-10 w-12 cursor-pointer border-2 border-[var(--rule-strong)] bg-transparent"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="brutal-input font-mono"
              maxLength={7}
            />
          </span>
        </label>
        <div className="flex items-end">
          <button onClick={save} disabled={busy} className="brutal-btn w-full disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {msg && (
        <p
          className={`mt-3 font-mono text-[11px] uppercase tracking-[0.22em] ${
            msg.kind === 'ok' ? 'text-[var(--text-soft)]' : 'text-white'
          }`}
        >
          {msg.kind === 'ok' ? '✓' : '!'} {msg.text}
        </p>
      )}
    </section>
  );
}

function MembersSection({
  clan,
  me,
  role,
  memberStats,
  onChange,
}: {
  clan: Clan;
  me: Me;
  role: 'leader' | 'deputy';
  memberStats: Array<{ playerUuid: string; kills: number; deaths: number; kd: number }>;
  onChange: () => void;
}) {
  const sorted = useMemo(() => {
    const order: Record<Member['role'], number> = { leader: 0, deputy: 1, member: 2 };
    return [...clan.members].sort((a, b) =>
      order[a.role] - order[b.role] || a.playerName.localeCompare(b.playerName),
    );
  }, [clan.members]);

  const statsByUuid = useMemo(
    () =>
      new Map(
        memberStats.map((s) => [s.playerUuid.toLowerCase(), s] as const),
      ),
    [memberStats],
  );

  async function transferTo(uuid: string, name: string) {
    if (role !== 'leader') return;
    if (!confirm(`Hand leadership over to ${name}? You'll be demoted to deputy.`)) return;
    try {
      await leaderApi(`/api/leader/clans/${encodeURIComponent(clan.tag)}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newLeaderUuid: uuid }),
      });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Transfer failed');
    }
  }

  async function kick(uuid: string, name: string) {
    if (!confirm(`Remove ${name} from the clan?`)) return;
    try {
      await leaderApi(
        `/api/leader/clans/${encodeURIComponent(clan.tag)}/members/${uuid}`,
        { method: 'DELETE' },
      );
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Remove failed');
    }
  }

  return (
    <section className="brutal-card mb-6 p-0">
      <div className="border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-5 py-3">
        <span className="label-mono">Members ({clan.members.length})</span>
      </div>
      <ul>
        {sorted.map((m) => {
          const isSelf = m.playerUuid.toLowerCase() === me.playerUuid.toLowerCase();
          const canKick = m.role !== 'leader' && !isSelf
            && (role === 'leader' || (role === 'deputy' && m.role === 'member'));
          const canTransfer = role === 'leader' && m.role !== 'leader' && !isSelf;
          const memberStat = statsByUuid.get(m.playerUuid.toLowerCase());
          return (
            <li
              key={m.playerUuid}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-[var(--rule)] px-5 py-3 last:border-b-0"
            >
              <span>
                <span className="block text-sm text-white">{m.playerName}</span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  {m.playerUuid.slice(0, 8)}…
                </span>
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]"
                title={memberStat ? `${memberStat.kills} K · ${memberStat.deaths} D` : 'no kills'}
              >
                {memberStat ? memberStat.kd.toFixed(2) + ' K/D' : '— K/D'}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
                  m.role === 'leader' ? 'text-white' : 'text-[var(--text-mute)]'
                }`}
              >
                {m.role}
              </span>
              <button
                onClick={() => canTransfer && transferTo(m.playerUuid, m.playerName)}
                disabled={!canTransfer}
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline disabled:opacity-30 disabled:no-underline"
              >
                promote → leader
              </button>
              <button
                onClick={() => canKick && kick(m.playerUuid, m.playerName)}
                disabled={!canKick}
                className="btn-danger-link disabled:opacity-30"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BannerSection({
  clan,
  banner,
  onChange,
}: {
  clan: Clan;
  banner: Banner;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function clearBanner() {
    if (!banner) return;
    if (!confirm('Remove the banner spec? Held shields will revert to plain.')) return;
    setBusy(true);
    try {
      await leaderApi(`/api/leader/clans/${encodeURIComponent(clan.tag)}/banner`, {
        method: 'DELETE',
      });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Banner remove failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="brutal-card mb-6 p-5">
      <p className="label-mono mb-3">Banner</p>
      {banner ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-mute)]">
            {banner.patterns.length} layer{banner.patterns.length === 1 ? '' : 's'}
            {' · base color #'}{banner.baseColor}
            {' · updated by '}{banner.updatedBy}
          </p>
          <p className="font-mono text-[11px] text-[var(--text-faint)]">
            Pattern editing lives on the admin panel for now —
            use <code className="font-mono">/dashboard/banners</code> to design layers.
          </p>
          <button onClick={clearBanner} disabled={busy} className="btn-danger-link disabled:opacity-40">
            Remove banner
          </button>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-mute)]">
          No banner yet. Ask an admin to design one in <code className="font-mono">/dashboard/banners</code>.
        </p>
      )}
    </section>
  );
}

function DangerZone({
  clan,
  onDisbanded,
}: {
  clan: Clan;
  onDisbanded: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function disband() {
    if (
      !confirm(
        `Disband ${clan.tag}? Every member will be marked as left and the cape/banner cleared. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await leaderApi(`/api/leader/clans/${encodeURIComponent(clan.tag)}`, {
        method: 'DELETE',
      });
      onDisbanded();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Disband failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="brutal-card border-white p-5">
      <p className="label-mono mb-2 text-white">Danger zone</p>
      <p className="text-sm text-[var(--text-mute)]">
        Disbanding leaves the historical rows in place for stats but removes
        the clan from the active roster, scoreboard teams, and banner mirror.
      </p>
      <button onClick={disband} disabled={busy} className="brutal-btn mt-4 disabled:opacity-40">
        {busy ? 'Disbanding…' : `Disband ${clan.tag}`}
      </button>
    </section>
  );
}
