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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrimPreview } from '@/components/TrimPreview';

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
        <ul className="space-y-3">
          {rowList.map(([slot, row]) => {
            const dirty =
              !row.saved
              || row.saved.material !== row.material
              || row.saved.pattern !== row.pattern;
            return (
              <li
                key={slot}
                className="grid items-end gap-3 border border-[var(--rule)] bg-[var(--bg-sink)] px-4 py-3 md:grid-cols-[110px_auto_1fr_1fr_auto_auto]"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-soft)]">
                  {SLOT_LABELS[slot]}
                </span>
                <TrimPreview slot={slot} material={row.material} pattern={row.pattern} />
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Material
                  </span>
                  <TrimSelect
                    value={row.material}
                    options={TRIM_MATERIALS as readonly string[] as string[]}
                    onChange={(v) =>
                      update(slot, { material: v as TrimMaterial, msg: null })
                    }
                    disabled={row.busy}
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Pattern
                  </span>
                  <TrimSelect
                    value={row.pattern}
                    options={TRIM_PATTERNS as readonly string[] as string[]}
                    onChange={(v) =>
                      update(slot, { pattern: v as TrimPattern, msg: null })
                    }
                    disabled={row.busy}
                  />
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
                    className={`md:col-span-6 font-mono text-[10px] uppercase tracking-[0.22em] ${
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

/**
 * B&W brutalist dropdown for the trim material + pattern pickers.
 * Replaces the native `<select>` because the OS-painted listbox uses
 * its own (very-not-monochrome) menu background which clashes with the
 * rest of the admin shell. Mirrors the ClanSelect pattern — popover
 * button + listbox, click-outside + Escape to dismiss, ARIA wired up.
 */
function TrimSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-2 border-[var(--rule-strong)] bg-transparent px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:border-white disabled:opacity-40"
      >
        <span className="truncate">{value}</span>
        <span aria-hidden className="text-[var(--text-mute)]">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          tabIndex={-1}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto border-2 border-white bg-[var(--bg-raise)] shadow-[4px_4px_0_0_rgba(255,255,255,0.18)]"
        >
          {options.map((opt) => {
            const active = opt === value;
            return (
              <li key={opt}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                    active ? 'bg-white text-black' : 'text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
