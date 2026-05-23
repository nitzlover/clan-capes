'use client';

import { useState } from 'react';
import {
  BANNER_COLORS,
  BANNER_PATTERNS,
  EMPTY_SPEC,
  type BannerSpec,
} from '@/lib/banners';
import { BannerPreview } from '@/components/BannerPreview';

type Props = {
  /** Initial spec — either the clan's saved banner or an empty one. */
  initial?: BannerSpec | null;
  /** Triggered when the admin clicks Save. The parent talks to the API. */
  onSave: (spec: BannerSpec) => Promise<void> | void;
  /** Triggered when the admin clicks Remove. Parent calls DELETE. */
  onRemove?: () => Promise<void> | void;
  /** Disable controls while a network request is in flight. */
  busy?: boolean;
  /** Inline error from the parent (server-side validation failure). */
  error?: string | null;
};

/**
 * Per-clan banner editor.
 *
 * Layout: base-color dropdown on the left, list of pattern rows below, live
 * preview on the right. Each pattern row has a colour + pattern dropdown
 * and add/remove/reorder buttons. The full vanilla 16 colours and 34
 * patterns are exposed — no curation, no permission tiers, no banner-
 * loom-style "you must craft this item first" gating.
 *
 * Vanilla server-side caps shields at 6 pattern layers; we enforce the same
 * limit client-side so an admin can't accidentally build a banner the
 * plugin won't be able to apply.
 */
const MAX_LAYERS = 6;

export function BannerEditor({ initial, onSave, onRemove, busy, error }: Props) {
  const [spec, setSpec] = useState<BannerSpec>(() => ({
    baseColor: initial?.baseColor ?? EMPTY_SPEC.baseColor,
    patterns: initial?.patterns ? [...initial.patterns] : [],
  }));

  function updateBase(value: number) {
    setSpec((s) => ({ ...s, baseColor: value }));
  }

  function setLayer(idx: number, patch: Partial<{ color: number; pattern: string }>) {
    setSpec((s) => {
      const next = [...s.patterns];
      next[idx] = { ...next[idx], ...patch };
      return { ...s, patterns: next };
    });
  }

  function addLayer() {
    if (spec.patterns.length >= MAX_LAYERS) return;
    setSpec((s) => ({
      ...s,
      patterns: [...s.patterns, { color: 0, pattern: BANNER_PATTERNS[0].code }],
    }));
  }

  function removeLayer(idx: number) {
    setSpec((s) => ({ ...s, patterns: s.patterns.filter((_, i) => i !== idx) }));
  }

  function moveLayer(idx: number, dir: -1 | 1) {
    setSpec((s) => {
      const next = [...s.patterns];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return s;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...s, patterns: next };
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto]">
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="label-mono mb-1.5 block">Base colour</span>
          <select
            value={spec.baseColor}
            disabled={busy}
            onChange={(e) => updateBase(Number(e.target.value))}
            className="w-full max-w-xs rounded-lg border border-white/10 bg-black/40 px-3 py-2 disabled:opacity-50"
          >
            {BANNER_COLORS.map((c) => (
              <option key={c.ordinal} value={c.ordinal}>
                {c.name} ({c.hex})
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label-mono">Patterns ({spec.patterns.length}/{MAX_LAYERS})</span>
            <button
              type="button"
              onClick={addLayer}
              disabled={busy || spec.patterns.length >= MAX_LAYERS}
              className="rounded-md border border-white/15 px-2.5 py-1 text-xs uppercase tracking-[0.18em] text-white/80 hover:text-white disabled:opacity-40"
            >
              + add layer
            </button>
          </div>
          {spec.patterns.length === 0 && (
            <p className="text-xs text-white/40">No patterns. Base colour only.</p>
          )}
          <ul className="space-y-2">
            {spec.patterns.map((p, idx) => (
              <li
                key={idx}
                className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 p-2"
              >
                <span className="font-mono text-xs text-white/40">#{idx + 1}</span>
                <select
                  value={p.color}
                  disabled={busy}
                  onChange={(e) => setLayer(idx, { color: Number(e.target.value) })}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm disabled:opacity-50"
                >
                  {BANNER_COLORS.map((c) => (
                    <option key={c.ordinal} value={c.ordinal}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={p.pattern}
                  disabled={busy}
                  onChange={(e) => setLayer(idx, { pattern: e.target.value })}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm disabled:opacity-50"
                >
                  {BANNER_PATTERNS.map((pat) => (
                    <option key={pat.code} value={pat.code}>
                      {pat.code} — {pat.label}
                    </option>
                  ))}
                </select>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveLayer(idx, -1)}
                    disabled={busy || idx === 0}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLayer(idx, 1)}
                    disabled={busy || idx === spec.patterns.length - 1}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLayer(idx)}
                    disabled={busy}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-red-300 hover:text-red-200 disabled:opacity-30"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onSave(spec)}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? 'Saving…' : 'Save banner'}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove()}
              disabled={busy}
              className="rounded-lg border border-red-300/30 px-4 py-2 text-sm text-red-200 hover:bg-red-300/10 disabled:opacity-40"
            >
              Remove banner
            </button>
          )}
          {error && (
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-red-300">
              {error}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-start gap-2">
        <BannerPreview spec={spec} width={120} label="Preview" />
      </div>
    </div>
  );
}
