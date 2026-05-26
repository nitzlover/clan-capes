'use client';

/**
 * Shared per-slot trim editor used by both the admin
 * (/dashboard/clans) and leader (/clan-panel/[tag]) surfaces. The
 * caller wires in the auth-specific HTTP plumbing via the three
 * callback props so this component stays agnostic — admin uses the
 * `api()` wrapper that surfaces 401s as UnauthorizedError, leader
 * uses a `leaderApi()` wrapper that bounces to the paste-token page
 * on 401.
 *
 * Layout: one row per slot (HEAD / CHEST / LEGS / FEET) with a
 * material select, a pattern select, a Save button per row, and a
 * Clear button when the row already has a row in the DB. We keep
 * per-slot dirty + busy state so saving leggings doesn't fight a
 * pending save on the helmet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];

export const TRIM_MATERIALS = [
  'iron',
  'copper',
  'gold',
  'lapis',
  'emerald',
  'diamond',
  'netherite',
  'redstone',
  'amethyst',
  'quartz',
  'resin',
] as const;
export type TrimMaterial = (typeof TRIM_MATERIALS)[number];

export const TRIM_PATTERNS = [
  'sentry',
  'dune',
  'coast',
  'wild',
  'ward',
  'eye',
  'vex',
  'tide',
  'snout',
  'rib',
  'spire',
  'wayfinder',
  'shaper',
  'silence',
  'raiser',
  'host',
  'flow',
  'bolt',
] as const;
export type TrimPattern = (typeof TRIM_PATTERNS)[number];

export type ArmorTrimRecord = {
  slot: ArmorSlot;
  material: TrimMaterial;
  pattern: TrimPattern;
  updatedAt?: string;
  updatedBy?: string;
};

const SLOT_LABELS: Record<ArmorSlot, string> = {
  head: 'Helmet',
  chest: 'Chestplate',
  legs: 'Leggings',
  feet: 'Boots',
};

export type ArmorTrimEditorProps = {
  /** Fetch the current per-slot rows from the server. */
  loadTrims: () => Promise<ArmorTrimRecord[]>;
  /** Upsert a single slot. */
  saveSlot: (
    slot: ArmorSlot,
    material: TrimMaterial,
    pattern: TrimPattern,
  ) => Promise<void>;
  /** Clear a single slot. */
  clearSlot: (slot: ArmorSlot) => Promise<void>;
};

type RowState = {
  /** `null` when the row has never been saved (no DB row). */
  saved: { material: TrimMaterial; pattern: TrimPattern } | null;
  material: TrimMaterial;
  pattern: TrimPattern;
  busy: boolean;
  msg: { kind: 'ok' | 'err'; text: string } | null;
};

function emptyRow(): RowState {
  return {
    saved: null,
    material: TRIM_MATERIALS[0],
    pattern: TRIM_PATTERNS[0],
    busy: false,
    msg: null,
  };
}

export function ArmorTrimEditor({ loadTrims, saveSlot, clearSlot }: ArmorTrimEditorProps) {
  const [rows, setRows] = useState<Record<ArmorSlot, RowState>>(() => ({
    head: emptyRow(),
    chest: emptyRow(),
    legs: emptyRow(),
    feet: emptyRow(),
  }));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await loadTrims();
      const next: Record<ArmorSlot, RowState> = {
        head: emptyRow(),
        chest: emptyRow(),
        legs: emptyRow(),
        feet: emptyRow(),
      };
      for (const row of list) {
        next[row.slot] = {
          saved: { material: row.material, pattern: row.pattern },
          material: row.material,
          pattern: row.pattern,
          busy: false,
          msg: null,
        };
      }
      setRows(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load trims');
    } finally {
      setLoading(false);
    }
  }, [loadTrims]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(<K extends keyof RowState>(
    slot: ArmorSlot,
    patch: Partial<Pick<RowState, K>> | RowState,
  ) => {
    setRows((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
  }, []);

  async function onSave(slot: ArmorSlot) {
    const row = rows[slot];
    if (row.busy) return;
    update(slot, { busy: true, msg: null });
    try {
      await saveSlot(slot, row.material, row.pattern);
      update(slot, {
        busy: false,
        saved: { material: row.material, pattern: row.pattern },
        msg: { kind: 'ok', text: 'Saved.' },
      });
    } catch (e) {
      update(slot, {
        busy: false,
        msg: { kind: 'err', text: e instanceof Error ? e.message : 'Save failed' },
      });
    }
  }

  async function onClear(slot: ArmorSlot) {
    const row = rows[slot];
    if (row.busy) return;
    if (!row.saved) return;
    if (!confirm(`Clear ${SLOT_LABELS[slot].toLowerCase()} trim?`)) return;
    update(slot, { busy: true, msg: null });
    try {
      await clearSlot(slot);
      update(slot, {
        ...emptyRow(),
        msg: { kind: 'ok', text: 'Cleared.' },
      });
    } catch (e) {
      update(slot, {
        busy: false,
        msg: { kind: 'err', text: e instanceof Error ? e.message : 'Clear failed' },
      });
    }
  }

  const rowList = useMemo(() => ARMOR_SLOTS.map((s) => [s, rows[s]] as const), [rows]);

  return (
    <div>
      {loading ? (
        <p className="text-sm text-[var(--text-mute)]">Loading trims…</p>
      ) : loadError ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {loadError}
        </p>
      ) : (
        <ul className="space-y-3">
          {rowList.map(([slot, row]) => {
            const dirty =
              !row.saved
              || row.saved.material !== row.material
              || row.saved.pattern !== row.pattern;
            return (
              <li
                key={slot}
                className="grid items-end gap-3 border border-[var(--rule)] bg-[var(--bg-sink)] px-4 py-3 md:grid-cols-[110px_1fr_1fr_auto_auto]"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-soft)]">
                  {SLOT_LABELS[slot]}
                </span>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Material
                  </span>
                  <select
                    value={row.material}
                    onChange={(e) =>
                      update(slot, { material: e.target.value as TrimMaterial, msg: null })
                    }
                    className="input mt-1 font-mono text-[11px] uppercase tracking-[0.18em]"
                    disabled={row.busy}
                  >
                    {TRIM_MATERIALS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Pattern
                  </span>
                  <select
                    value={row.pattern}
                    onChange={(e) =>
                      update(slot, { pattern: e.target.value as TrimPattern, msg: null })
                    }
                    className="input mt-1 font-mono text-[11px] uppercase tracking-[0.18em]"
                    disabled={row.busy}
                  >
                    {TRIM_PATTERNS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => onSave(slot)}
                  disabled={row.busy || !dirty}
                  className="btn-primary disabled:opacity-30"
                >
                  {row.busy && dirty ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => onClear(slot)}
                  disabled={row.busy || !row.saved}
                  className="btn-danger-link disabled:opacity-30"
                >
                  Clear
                </button>
                {row.msg && (
                  <p
                    className={`md:col-span-5 font-mono text-[10px] uppercase tracking-[0.22em] ${
                      row.msg.kind === 'ok' ? 'text-[var(--text-soft)]' : 'text-white'
                    }`}
                  >
                    {row.msg.kind === 'ok' ? '✓' : '!'} {row.msg.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
