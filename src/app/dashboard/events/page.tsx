'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [configs, setConfigs] = useState<EventConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<ConfigResponse>('/panel/events/config');
      setConfigs(r.configs);
      setError('');
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="page-subtitle">
            Scheduler config for the in-game PvP events. History + active
            monitor land here once the plugin&apos;s EventScheduler ships.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            schedule
          </span>
          {configs.length} types
        </span>
      </div>

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
    </div>
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty =
    enabled !== initial.enabled
    || interval !== initial.intervalMinutes
    || duration !== initial.durationMinutes
    || radius !== initial.radiusBlocks;

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
          payload: initial.payload,
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
