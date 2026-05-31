'use client';

import { useCallback, useEffect, useState } from 'react';
import { SelectServerPrompt } from '@/components/ServerPicker';
import { useSelectedServer } from '@/lib/selected-server';
import { api, UnauthorizedError } from '@/lib/api';

/**
 * Wave 5 — events admin surface.
 *
 * First iteration: config editor for the two event types (Airdrop +
 * KotH). Per-server config is fetched once on mount, edited inline,
 * and PUT back on Save. History + active monitor land in subsequent
 * iterations once the plugin's EventScheduler is wired up.
 *
 * The plugin polls /api/plugin/events/config every reload and on
 * its own scheduled tick, so a saved change here propagates to the
 * server's next scheduler decision without an extra deploy.
 */

type EventTypeName = 'airdrop' | 'koth';

type EventConfig = {
  type: EventTypeName;
  enabled: boolean;
  intervalMinutes: number;
  durationMinutes: number;
  radiusBlocks: number;
  payload: Record<string, unknown>;
};

type ConfigResponse = {
  serverId?: number;
  configs: EventConfig[];
};

// Humanise camelCase payload keys for the advanced editor + a hint
// per known knob. Unknown keys fall back to a spaced-out label.
const PAYLOAD_HINTS: Record<string, string> = {
  prepMinutes: 'Travel window before the drop lands.',
  landingMinutes: 'PvP window after the drop lands.',
  finaleMinutes: 'Sudden-death cap after landing.',
  lootCollectionMinutes: 'Winner-only window to loot the chest.',
  spawnRadiusBlocks: 'Zone centre is random within this of spawn.',
  crashCommebackSeconds: 'Re-entry grace after a crash / zone exit.',
  teammateCommebackMinutes: 'Grace for teammates of the last member in.',
  minClansOnline: 'Distinct clans required to fire the event.',
  minPlayersPerClanOnline: 'Online members per clan to count it.',
};

function payloadLabel(key: string): string {
  const spaced = key
    .replace(/([A-Z])/g, ' $1')
    .replace(/\bMinutes\b/, '(min)')
    .replace(/\bSeconds\b/, '(s)')
    .replace(/\bBlocks\b/, '(blocks)')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const LABELS: Record<EventTypeName, { title: string; subtitle: string }> = {
  airdrop: {
    title: 'Airdrop',
    subtitle:
      'Random circular zone, three stages (prep · landing · finale). Last clan standing collects the loot.',
  },
  koth: {
    title: 'King of the Hill',
    subtitle:
      'Fixed zone near spawn, custom structure with a loot chest. Last clan standing wins.',
  },
};

export default function EventsConfigPage() {
  const { value: globalServerId } = useSelectedServer();
  const serverId: number | null =
    typeof globalServerId === 'number' ? globalServerId : null;
  const [configs, setConfigs] = useState<EventConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (serverId === null) {
      setConfigs([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    try {
      const r = await api<ConfigResponse>(`/panel/events/config?serverId=${serverId}`);
      setConfigs(r.configs);
      setError('');
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  if (serverId === null) {
    return (
      <div>
        <div className="page-band">
          <div>
            <h1 className="page-title">Events</h1>
            <p className="page-subtitle">PvP event scheduler + leaderboard.</p>
          </div>
        </div>
        <SelectServerPrompt>
          <p className="text-sm text-[var(--text-faint)]">
            Events run on a single server at a time — pick one above.
          </p>
        </SelectServerPrompt>
      </div>
    );
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="page-subtitle">
            Scheduler config, live monitor, history, and per-clan
            leaderboard for the in-game PvP events.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            schedule
          </span>
          {configs.length} types
        </span>
      </div>

      <ActiveMonitor />

      {loading ? (
        <p className="eyebrow">Loading…</p>
      ) : error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      ) : (
        <div className="space-y-6">
          {configs.map((c) => (
            <EventConfigEditor key={c.type} initial={c} onSaved={load} />
          ))}
        </div>
      )}

      <EventLeaderboard />
      <EventHistory />
    </div>
  );
}

type EventRun = {
  id: number;
  type: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  zone: { x: number; z: number; radius: number };
  winnerTag: string | null;
  participantCount: number;
  killCount: number;
};

const ACTIVE_STATUSES = new Set(['pending', 'prep', 'landing', 'finale', 'active', 'collect']);

/**
 * Live monitor for an in-flight event. Polls /panel/events every 5 s
 * and surfaces any run whose status isn't ended/cancelled, with a
 * pulsing marker. Hides itself when nothing is running so the page
 * stays quiet between events.
 */
function ActiveMonitor() {
  const [active, setActive] = useState<EventRun[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await api<{ events: EventRun[] }>('/panel/events?limit=10');
        if (cancelled) return;
        setActive(r.events.filter((e) => ACTIVE_STATUSES.has(e.status)));
      } catch {
        /* transient — keep prior state */
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (active.length === 0) return null;

  return (
    <section className="brutal-card mb-6 border-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full bg-[#5fd068]"
          style={{ animation: 'pulse-dot-on 1s ease-out infinite' }}
        />
        <p className="label-mono text-white">Live now</p>
      </div>
      <ul className="space-y-2">
        {active.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px]"
          >
            <span className="uppercase text-white">{e.type}</span>
            <span className="text-[var(--text-soft)]">{e.status}</span>
            <span className="text-[var(--text-faint)]">
              zone {e.zone.x}, {e.zone.z} · r{e.zone.radius}
            </span>
            <span className="ml-auto text-[var(--text-soft)]">
              {e.participantCount}p · {e.killCount}k
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type LeaderRow = {
  clanId: number;
  tag: string;
  wins: number;
  events: number;
  kills: number;
  deaths: number;
  kd: number;
};

/**
 * Per-clan event leaderboard — wins, events entered, kills/deaths,
 * K/D. Single fetch on mount; ordered server-side by wins then kills.
 */
function EventLeaderboard() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ rows: LeaderRow[] }>('/panel/events/leaderboard?limit=25');
        if (!cancelled) setRows(r.rows);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows !== null && rows.length === 0) return null;

  return (
    <section className="brutal-card mt-10 p-6">
      <p className="label-mono mb-4">Clan leaderboard</p>
      {rows === null ? (
        <p className="text-sm text-[var(--text-mute)]">Loading…</p>
      ) : (
        <ul className="font-mono text-[11px]">
          <li className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 border-b border-[var(--rule-strong)] pb-2 text-[var(--text-faint)] uppercase tracking-[0.18em]">
            <span>#</span>
            <span>Clan</span>
            <span>Wins</span>
            <span>Events</span>
            <span>K/D</span>
          </li>
          {rows.map((r, i) => (
            <li
              key={r.clanId}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 border-b border-[var(--rule)] py-2"
            >
              <span className="text-[var(--text-faint)]">{i + 1}</span>
              <span className="text-white">{r.tag}</span>
              <span className="text-[var(--text-soft)]">{r.wins}</span>
              <span className="text-[var(--text-mute)]">{r.events}</span>
              <span
                className="text-[var(--text-soft)]"
                title={`${r.kills} K · ${r.deaths} D`}
              >
                {r.kd.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Read-only history of past + active event runs, newest first. Polls
 * once on mount (the operator can refresh the page for a fresh pull —
 * events are infrequent, no need for a live socket here).
 */
function EventHistory() {
  const [runs, setRuns] = useState<EventRun[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ events: EventRun[] }>('/panel/events?limit=50');
        if (!cancelled) setRuns(r.events);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="brutal-card mt-10 p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="label-mono">History</p>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {runs ? `${runs.length} runs` : '—'}
        </span>
      </div>
      {error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      ) : !runs ? (
        <p className="text-sm text-[var(--text-mute)]">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-[var(--text-faint)]">
          No events have run yet. They fire on the configured interval once
          the online-clan threshold is met.
        </p>
      ) : (
        <ul className="border-t border-[var(--rule)] font-mono text-[11px]">
          {runs.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-baseline gap-4 border-b border-[var(--rule)] py-2"
            >
              <span className="uppercase text-white">{r.type}</span>
              <span className="text-[var(--text-faint)]">
                {new Date(r.startedAt).toLocaleString()}
              </span>
              <span
                className={
                  r.status === 'ended'
                    ? 'text-[var(--text-soft)]'
                    : r.status === 'cancelled'
                      ? 'text-[var(--text-mute)]'
                      : 'text-white'
                }
              >
                {r.status}
              </span>
              <span className="text-[var(--text-soft)]">
                {r.winnerTag ? `▸ ${r.winnerTag}` : '—'}
              </span>
              <span
                className="text-[var(--text-faint)]"
                title={`zone ${r.zone.x}, ${r.zone.z} · r${r.zone.radius}`}
              >
                {r.participantCount}p · {r.killCount}k
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventConfigEditor({
  initial,
  onSaved,
}: {
  initial: EventConfig;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [interval, setIntervalMin] = useState(initial.intervalMinutes);
  const [duration, setDuration] = useState(initial.durationMinutes);
  const [radius, setRadius] = useState(initial.radiusBlocks);
  // Editable copy of the variant-specific payload. Only the numeric
  // knobs get input fields; non-numeric keys (e.g. koth structureId)
  // ride along untouched so a save doesn't drop them.
  const [payload, setPayload] = useState<Record<string, unknown>>(
    () => ({ ...initial.payload }),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const numericPayloadKeys = Object.keys(initial.payload).filter(
    (k) => typeof initial.payload[k] === 'number',
  );

  const dirty =
    enabled !== initial.enabled
    || interval !== initial.intervalMinutes
    || duration !== initial.durationMinutes
    || radius !== initial.radiusBlocks
    || JSON.stringify(payload) !== JSON.stringify(initial.payload);

  function setPayloadKey(key: string, n: number) {
    setPayload((prev) => ({ ...prev, [key]: n }));
  }

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/panel/events/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: initial.type,
          enabled,
          intervalMinutes: interval,
          durationMinutes: duration,
          radiusBlocks: radius,
          payload,
        }),
      });
      setMsg({ kind: 'ok', text: 'Saved.' });
      onSaved();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }

  const meta = LABELS[initial.type];

  return (
    <section className="brutal-card p-6">
      <div className="mb-4 flex items-start justify-between gap-6">
        <div>
          <p className="font-sans text-xl font-extrabold uppercase tracking-wider text-white">
            {meta.title}
          </p>
          <p className="mt-1 max-w-xl text-sm text-[var(--text-mute)]">
            {meta.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          disabled={busy}
          aria-pressed={enabled}
          className={`inline-flex items-center gap-3 border-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors disabled:opacity-40 ${
            enabled
              ? 'border-white bg-white/[0.08] text-white'
              : 'border-[var(--rule-strong)] text-[var(--text-mute)] hover:border-white'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${
              enabled ? 'bg-white' : 'bg-[var(--rule-strong)]'
            }`}
          />
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          label="Interval (min)"
          value={interval}
          onChange={setIntervalMin}
          min={5}
          max={10080}
          hint="How often the scheduler fires this event."
        />
        <NumberField
          label="Duration (min)"
          value={duration}
          onChange={setDuration}
          min={1}
          max={720}
          hint="Total active window (prep + landing + finale)."
        />
        <NumberField
          label="Radius (blocks)"
          value={radius}
          onChange={setRadius}
          min={10}
          max={5000}
          hint="Zone radius on the XZ plane."
        />
      </div>

      {numericPayloadKeys.length > 0 && (
        <details className="mt-5 border-t border-[var(--rule)] pt-4">
          <summary className="label-mono cursor-pointer text-[var(--text-faint)] hover:text-white">
            Advanced — stage timing & thresholds
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {numericPayloadKeys.map((k) => (
              <NumberField
                key={k}
                label={payloadLabel(k)}
                value={Number(payload[k] ?? 0)}
                onChange={(n) => setPayloadKey(k, n)}
                min={0}
                max={100_000}
                hint={PAYLOAD_HINTS[k]}
              />
            ))}
          </div>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="btn-primary disabled:opacity-30"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && (
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
              msg.kind === 'ok' ? 'text-[var(--text-soft)]' : 'text-white'
            }`}
          >
            {msg.kind === 'ok' ? '✓' : '!'} {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label-mono text-[var(--text-faint)]">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.round(n));
        }}
        className="input mt-1 w-full font-mono"
      />
      {hint && (
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
          {hint}
        </span>
      )}
    </label>
  );
}
