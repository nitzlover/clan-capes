'use client';

/**
 * /dashboard/settings — palette + cooldown + max-layers admin tab.
 *
 * Edits are local-state until "Save" hits PATCH /api/panel/settings.
 * On success the server's merged-with-defaults snapshot wins, so a
 * stale local edit (e.g. someone else saved between load + save)
 * gets visibly replaced.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';

type Settings = {
  palette: string[];
  createCooldownMs: number;
  bannerMaxLayers: number;
};

type SettingsResponse = { serverId: number; settings: Settings };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const [serverId, setServerId] = useState<number | null>(null);
  const [server, setServer] = useState<Settings | null>(null);

  const [palette, setPalette] = useState<string[]>([]);
  const [cooldownMin, setCooldownMin] = useState<number>(60);
  const [maxLayers, setMaxLayers] = useState<number>(6);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api<SettingsResponse>('/panel/settings');
      setServerId(resp.serverId);
      setServer(resp.settings);
      setPalette(resp.settings.palette);
      setCooldownMin(Math.round(resp.settings.createCooldownMs / 60000));
      setMaxLayers(resp.settings.bannerMaxLayers);
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

  const dirty = useMemo(() => {
    if (!server) return false;
    if (server.bannerMaxLayers !== maxLayers) return true;
    if (Math.round(server.createCooldownMs / 60000) !== cooldownMin) return true;
    if (server.palette.length !== palette.length) return true;
    for (let i = 0; i < palette.length; i++) {
      if (palette[i].toUpperCase() !== server.palette[i].toUpperCase()) return true;
    }
    return false;
  }, [server, palette, cooldownMin, maxLayers]);

  function addColor(raw: string) {
    const trimmed = raw.trim().toUpperCase();
    if (!HEX_RE.test(trimmed)) {
      setMsg({ kind: 'err', text: 'Hex must look like #RRGGBB' });
      return;
    }
    if (palette.includes(trimmed)) {
      setMsg({ kind: 'err', text: 'Already in palette' });
      return;
    }
    setPalette([...palette, trimmed]);
    setMsg(null);
  }

  function removeColor(hex: string) {
    if (palette.length <= 1) {
      setMsg({ kind: 'err', text: 'Need at least one colour in the palette' });
      return;
    }
    setPalette(palette.filter((c) => c !== hex));
    setMsg(null);
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const resp = await api<SettingsResponse>('/panel/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId,
          patch: {
            palette,
            createCooldownMs: cooldownMin * 60000,
            bannerMaxLayers: maxLayers,
          },
        }),
      });
      setServer(resp.settings);
      setPalette(resp.settings.palette);
      setCooldownMin(Math.round(resp.settings.createCooldownMs / 60000));
      setMaxLayers(resp.settings.bannerMaxLayers);
      setMsg({ kind: 'ok', text: 'Saved.' });
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Per-server operator knobs. Plugin polls these every ~5 min.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-mute)]">Loading…</p>
      ) : error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      ) : (
        <>
          <PaletteSection palette={palette} onAdd={addColor} onRemove={removeColor} />

          <section className="brutal-card mb-6 grid gap-4 p-5 md:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                /clan create cooldown (minutes)
              </span>
              <input
                type="number"
                min={0}
                max={10080}
                step={1}
                value={cooldownMin}
                onChange={(e) => setCooldownMin(Math.max(0, Number(e.target.value)))}
                className="brutal-input mt-1 w-full font-mono"
              />
              <span className="mt-1 block text-[11px] text-[var(--text-mute)]">
                0 disables the cooldown. Anti-spam keeps players from cycling
                palette slots through disband-and-recreate.
              </span>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Banner pattern layers
              </span>
              <input
                type="number"
                min={1}
                max={12}
                step={1}
                value={maxLayers}
                onChange={(e) => setMaxLayers(Math.min(12, Math.max(1, Number(e.target.value))))}
                className="brutal-input mt-1 w-full font-mono"
              />
              <span className="mt-1 block text-[11px] text-[var(--text-mute)]">
                Minecraft renders the first 6 layers natively; values above
                that are stored but render glitchy. Default 6.
              </span>
            </label>
          </section>

          <section className="brutal-card flex items-center gap-4 p-5">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="brutal-btn disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
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
          </section>
        </>
      )}
    </div>
  );
}

function PaletteSection({
  palette,
  onAdd,
  onRemove,
}: {
  palette: string[];
  onAdd: (raw: string) => void;
  onRemove: (hex: string) => void;
}) {
  const [draft, setDraft] = useState('#');
  const [picker, setPicker] = useState('#FF5555');

  return (
    <section className="brutal-card mb-6 p-5">
      <p className="label-mono mb-3">Palette ({palette.length})</p>
      <p className="mb-4 text-[11px] text-[var(--text-mute)]">
        Colours allocateUnusedColor picks from when a player runs /clan create
        without an explicit #hex. Order is preserved but shuffled per allocate
        call so concurrent creates don't all grab slot 0.
      </p>
      <ul className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
        {palette.map((hex) => (
          <li
            key={hex}
            className="relative flex h-16 items-end justify-between border-2 border-[var(--rule-strong)] p-1"
            style={{ backgroundColor: hex }}
          >
            <span className="rounded bg-[var(--bg-sink)]/85 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white">
              {hex}
            </span>
            <button
              type="button"
              onClick={() => onRemove(hex)}
              className="rounded bg-[var(--bg-sink)]/85 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white hover:bg-white hover:text-black"
              aria-label={`Remove ${hex}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={picker}
            onChange={(e) => {
              setPicker(e.target.value.toUpperCase());
              setDraft(e.target.value.toUpperCase());
            }}
            className="h-10 w-12 cursor-pointer border-2 border-[var(--rule-strong)] bg-transparent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Add hex
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="#RRGGBB"
            className="brutal-input mt-1 font-mono"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const v = draft.trim().toUpperCase();
            if (HEX_RE.test(v)) {
              onAdd(v);
              setDraft('#');
            } else {
              onAdd(picker);
            }
          }}
          className="brutal-btn"
        >
          Add
        </button>
      </div>
    </section>
  );
}
