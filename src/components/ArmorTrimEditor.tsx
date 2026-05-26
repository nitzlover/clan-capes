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
 * Layout: smithing-table inspired three-pane row per slot —
 *   [ material item grid | live 3D armour preview | pattern grid ]
 * with Save + Clear buttons below. Click any material or pattern
 * tile and the centre 3D piece reskins live before any network
 * call. We keep per-slot dirty + busy state so saving leggings
 * doesn't fight a pending save on the helmet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArmorPiece3D } from '@/components/ArmorPiece3D';
import { materialIconSrc, patternIconSrc } from '@/lib/trim-icons';

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

  // Callers (pages) re-render constantly — online-poll loop, parent
  // state churn — and pass fresh inline closures each pass. Without a
  // ref bridge the initial useEffect would re-fire every render and
  // hammer the panel with a fetch per re-render. Stash the latest
  // closures here and consume them through the ref so the load /
  // save / clear handlers stay stable across renders without forcing
  // every caller to memoise.
  const cbRef = useRef({ loadTrims, saveSlot, clearSlot });
  useEffect(() => {
    cbRef.current = { loadTrims, saveSlot, clearSlot };
  });

  // Single mount-time fetch. Parent triggers re-fetches by remounting
  // the component (e.g. after the clan list reload swaps the clan
  // identity) — not by changing the prop functions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const list = await cbRef.current.loadTrims();
        if (cancelled) return;
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
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Failed to load trims');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      await cbRef.current.saveSlot(slot, row.material, row.pattern);
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
      await cbRef.current.clearSlot(slot);
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
        <ul className="space-y-4">
          {rowList.map(([slot, row]) => {
            const dirty =
              !row.saved
              || row.saved.material !== row.material
              || row.saved.pattern !== row.pattern;
            return (
              <li
                key={slot}
                aria-label={SLOT_LABELS[slot]}
                className="border border-[var(--rule)] bg-[var(--bg-sink)] p-4"
              >
                <div className="grid gap-4 md:grid-cols-[auto_1fr_auto]">
                  {/* Left: material item grid */}
                  <div>
                    <p className="label-mono mb-2 text-[var(--text-faint)]">
                      Material
                    </p>
                    <div className="grid w-[148px] grid-cols-4 gap-1.5">
                      {TRIM_MATERIALS.map((m) => {
                        const active = m === row.material;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() =>
                              !row.busy && update(slot, { material: m, msg: null })
                            }
                            title={m}
                            disabled={row.busy}
                            className={`flex aspect-square items-center justify-center border-2 transition-colors ${
                              active
                                ? 'border-white bg-white/[0.1]'
                                : 'border-[var(--rule-strong)] hover:border-white'
                            } disabled:opacity-40`}
                          >
                            <img
                              src={materialIconSrc(m)}
                              alt={m}
                              className="h-6 w-6"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Center: live 3D piece + slot label + actions */}
                  <div className="flex flex-col items-center">
                    <ArmorPiece3D
                      slot={slot}
                      material={row.material}
                      pattern={row.pattern}
                    />
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-soft)]">
                      {row.material} · {row.pattern}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
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
                    </div>
                    {row.msg && (
                      <p
                        className={`mt-2 font-mono text-[10px] uppercase tracking-[0.22em] ${
                          row.msg.kind === 'ok'
                            ? 'text-[var(--text-soft)]'
                            : 'text-white'
                        }`}
                      >
                        {row.msg.kind === 'ok' ? '✓' : '!'} {row.msg.text}
                      </p>
                    )}
                  </div>

                  {/* Right: pattern template grid */}
                  <div>
                    <p className="label-mono mb-2 text-[var(--text-faint)]">
                      Pattern
                    </p>
                    <div className="grid w-[220px] grid-cols-6 gap-1.5">
                      {TRIM_PATTERNS.map((p) => {
                        const active = p === row.pattern;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              !row.busy && update(slot, { pattern: p, msg: null })
                            }
                            title={p}
                            disabled={row.busy}
                            className={`flex aspect-square items-center justify-center border-2 transition-colors ${
                              active
                                ? 'border-white bg-white/[0.1]'
                                : 'border-[var(--rule-strong)] hover:border-white'
                            } disabled:opacity-40`}
                          >
                            <img
                              src={patternIconSrc(p)}
                              alt={p}
                              className="h-6 w-6"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

