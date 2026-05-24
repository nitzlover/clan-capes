'use client';

import { useState } from 'react';
import {
  BANNER_COLORS,
  BANNER_PATTERNS,
  EMPTY_SPEC,
  parseNbtSpec,
  specToNbt,
  type BannerSpec,
} from '@/lib/banners';
import { BannerPreview } from '@/components/BannerPreview';
import { ImageToBannerCard } from '@/components/ImageToBannerCard';

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
  const [nbtText, setNbtText] = useState('');
  const [nbtMsg, setNbtMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function importNbt() {
    const parsed = parseNbtSpec(nbtText);
    if (!parsed) {
      setNbtMsg({
        kind: 'err',
        text: 'Could not parse NBT (need Base + at least one {Color,Pattern}).',
      });
      return;
    }
    if (parsed.patterns.length > MAX_LAYERS) {
      setSpec({ ...parsed, patterns: parsed.patterns.slice(0, MAX_LAYERS) });
      setNbtMsg({
        kind: 'err',
        text: `NBT had ${parsed.patterns.length} layers, trimmed to ${MAX_LAYERS}.`,
      });
      return;
    }
    setSpec(parsed);
    setNbtMsg({ kind: 'ok', text: `Loaded ${parsed.patterns.length} layer(s).` });
  }

  async function copyNbt() {
    const nbt = specToNbt(spec);
    setNbtText(nbt);
    try {
      await navigator.clipboard.writeText(nbt);
      setNbtMsg({ kind: 'ok', text: 'NBT copied to clipboard.' });
    } catch {
      setNbtMsg({ kind: 'err', text: 'Clipboard blocked — copy from the textarea.' });
    }
  }

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
    <div className="grid gap-10 md:grid-cols-[1fr_auto]">
      <div className="space-y-8">
        <div>
          <label htmlFor="banner-base" className="label-mono mb-2 block">
            Base colour
          </label>
          <select
            id="banner-base"
            value={spec.baseColor}
            disabled={busy}
            onChange={(e) => updateBase(Number(e.target.value))}
            className="input max-w-xs disabled:opacity-50"
          >
            {BANNER_COLORS.map((c) => (
              <option key={c.ordinal} value={c.ordinal}>
                {c.name} · {c.hex}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="label-mono">
              Patterns · {spec.patterns.length}/{MAX_LAYERS}
            </span>
            <button
              type="button"
              onClick={addLayer}
              disabled={busy || spec.patterns.length >= MAX_LAYERS}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline disabled:opacity-30"
            >
              + add layer
            </button>
          </div>
          {spec.patterns.length === 0 && (
            <p className="py-3 text-xs text-[var(--text-faint)]">
              No patterns. Base colour only.
            </p>
          )}
          <ul>
            {spec.patterns.map((p, idx) => (
              <li
                key={idx}
                className="grid grid-cols-[auto_1fr_1.4fr_auto] items-center gap-3 border-t border-[var(--rule)] py-3 first:border-t-0"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)] tabular">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <select
                  value={p.color}
                  disabled={busy}
                  onChange={(e) => setLayer(idx, { color: Number(e.target.value) })}
                  className="input py-1.5 text-sm disabled:opacity-50"
                >
                  {BANNER_COLORS.map((c) => (
                    <option key={c.ordinal} value={c.ordinal}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={p.pattern}
                  disabled={busy}
                  onChange={(e) => setLayer(idx, { pattern: e.target.value })}
                  className="input py-1.5 text-sm disabled:opacity-50"
                >
                  {BANNER_PATTERNS.map((pat) => (
                    <option key={pat.code} value={pat.code}>
                      {pat.code} — {pat.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 text-[var(--text-mute)]">
                  <button
                    type="button"
                    onClick={() => moveLayer(idx, -1)}
                    disabled={busy || idx === 0}
                    className="hover:text-white disabled:opacity-25"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLayer(idx, 1)}
                    disabled={busy || idx === spec.patterns.length - 1}
                    className="hover:text-white disabled:opacity-25"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLayer(idx)}
                    disabled={busy}
                    className="hover:text-white disabled:opacity-25"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-4">
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
              className="btn-ghost"
            >
              Remove
            </button>
          )}
          {error && (
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
              ! {error}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start justify-start gap-6 md:items-center">
        <BannerPreview spec={spec} width={140} label="Shield" shape="shield" />
        <BannerPreview spec={spec} width={70} label="Banner block" shape="block" />
      </div>

      <div className="md:col-span-2 border-t border-[var(--rule)] pt-6">
        <p className="eyebrow mb-3">Import / Export NBT</p>
        <p className="mb-3 font-mono text-[11px] text-[var(--text-faint)]">
          Paste a vanilla banner NBT like
          {' '}
          <code className="text-[var(--text-soft)]">{'{BlockEntityTag:{Base:14,Patterns:[{Color:15,Pattern:"gra"},...]}}'}</code>
          {' '}
          and Import. Copy writes the current spec back in the same format.
        </p>
        <textarea
          value={nbtText}
          onChange={(e) => setNbtText(e.target.value)}
          disabled={busy}
          spellCheck={false}
          placeholder='{BlockEntityTag:{Base:14,Patterns:[{Color:15,Pattern:"gra"},{Color:15,Pattern:"cbo"}]}}'
          className="input h-24 font-mono text-[11px] disabled:opacity-50"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={importNbt}
            disabled={busy || !nbtText.trim()}
            className="btn-ghost"
          >
            Import
          </button>
          <button
            type="button"
            onClick={copyNbt}
            disabled={busy}
            className="btn-ghost"
          >
            Copy
          </button>
          {nbtMsg && (
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
              {nbtMsg.kind === 'ok' ? '✓ ' : '! '}
              {nbtMsg.text}
            </span>
          )}
        </div>
      </div>

      <div className="md:col-span-2 border-t border-[var(--rule)] pt-6">
        <ImageToBannerCard
          busy={busy}
          onAccept={(converted) => {
            // Take the converter output verbatim — the algorithm already
            // caps to MAX_LAYERS, so no extra slicing needed here.
            setSpec(converted);
            setNbtMsg({
              kind: 'ok',
              text: `Loaded ${converted.patterns.length} layer(s) from image.`,
            });
          }}
        />
      </div>
    </div>
  );
}
