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
 * Per-clan banner editor — minecraft.tools-style.
 *
 * Layout: base-colour swatch grid + 6 stackable pattern layers on the
 * left, live shield preview on the right. Each layer exposes the full
 * vanilla 16-colour swatch picker and a 41-tile shape grid sliced
 * straight out of `/public/mc/shieldx7.png` — clicking a tile sets the
 * pattern code, clicking a swatch sets the dye ordinal. No dropdowns,
 * no banner-loom gating, no per-pattern unlock tiers.
 *
 * Vanilla server-side caps shields at 6 pattern layers; we enforce the
 * same limit client-side so the saved spec is always plugin-applyable.
 */
const MAX_LAYERS = 6;

// Every pattern now has a modern-key shield texture under
// /public/mc/shield-patterns/, so the whole picker is renderable — no
// atlas-column gating any more.
const SHIELD_PATTERN_CODES = BANNER_PATTERNS.map((p) => p.code);

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
      patterns: [...s.patterns, { color: 0, pattern: SHIELD_PATTERN_CODES[0] }],
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
          <p className="label-mono mb-3">Base colour</p>
          <ColorSwatches
            value={spec.baseColor}
            disabled={busy}
            onChange={updateBase}
          />
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
          <ul className="space-y-6">
            {spec.patterns.map((p, idx) => (
              <li
                key={idx}
                className="border-t border-[var(--rule)] pt-5 first:border-t-0 first:pt-0"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Layer {String(idx + 1).padStart(2, '0')}
                    {' · '}
                    <span className="text-[var(--text-mute)]">{p.pattern}</span>
                  </span>
                  <div className="flex items-center gap-3 text-[var(--text-mute)]">
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
                </div>
                <ColorSwatches
                  value={p.color}
                  disabled={busy}
                  onChange={(v) => setLayer(idx, { color: v })}
                />
                <div className="mt-3">
                  <ShapeGrid
                    value={p.pattern}
                    dyeOrdinal={p.color}
                    disabled={busy}
                    onChange={(code) => setLayer(idx, { pattern: code })}
                  />
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
        <BannerPreview spec={spec} width={160} label="Shield" shape="shield" />
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

/**
 * 16-cell dye swatch row. Used for both the base-colour and per-layer
 * colour pickers. Click sets the DyeColor ordinal directly. Grid is
 * locked to 16 columns via inline `grid-template-columns` because the
 * default Tailwind grid scale stops at 12.
 */
function ColorSwatches({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
    >
      {BANNER_COLORS.map((c) => {
        const active = value === c.ordinal;
        return (
          <button
            key={c.ordinal}
            type="button"
            disabled={disabled}
            onClick={() => onChange(c.ordinal)}
            title={c.name}
            aria-label={c.name}
            aria-pressed={active}
            className={`aspect-square border transition-colors disabled:opacity-40 ${
              active
                ? 'border-white ring-1 ring-white'
                : 'border-[var(--rule)] hover:border-[var(--rule-strong)]'
            }`}
            style={{ backgroundColor: c.hex }}
          />
        );
      })}
    </div>
  );
}

/**
 * Grid of shape tiles, each one a single (shape × dye) cell out of the
 * shieldx7.png atlas. The dye colour passed in is the colour the user
 * already picked for this layer — so every tile previews how the shape
 * will actually look in that colour, exactly the way minecraft.tools
 * shows it.
 */
function ShapeGrid({
  value,
  dyeOrdinal,
  disabled,
  onChange,
}: {
  value: string;
  dyeOrdinal: number;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const TILE_W = 40;
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_W}px, 1fr))` }}
    >
      {SHIELD_PATTERN_CODES.map((code) => (
        <ShapeTile
          key={code}
          code={code}
          dyeOrdinal={dyeOrdinal}
          tileWidth={TILE_W}
          selected={value === code}
          disabled={disabled}
          onClick={() => onChange(code)}
        />
      ))}
    </div>
  );
}

/**
 * Single atlas-sliced thumbnail of one (shape × dye) combination.
 * Same math as ShieldSprite but at thumbnail scale — keeps the editor
 * pickers visually consistent with the big preview on the right.
 */
function ShapeTile({
  code,
  dyeOrdinal,
  tileWidth,
  selected,
  disabled,
  onClick,
}: {
  code: string;
  dyeOrdinal: number;
  tileWidth: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const cellW = tileWidth;
  const cellH = Math.round(tileWidth * (154 / 84));
  const dyeHex = BANNER_COLORS[Math.max(0, Math.min(15, dyeOrdinal | 0))]?.hex ?? '#f9fffe';
  const maskUrl = `/mc/shield-patterns/${code}.png`;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={code}
      aria-label={code}
      aria-pressed={selected}
      className={`relative border transition-colors disabled:opacity-40 ${
        selected
          ? 'border-white ring-1 ring-white'
          : 'border-[var(--rule)] hover:border-[var(--rule-strong)]'
      }`}
      style={{
        width: cellW,
        height: cellH,
        // Dark MC-ish backdrop so transparent pattern pixels read against
        // something instead of bleeding into the page bg.
        backgroundColor: '#1d1d21',
        imageRendering: 'pixelated',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: dyeHex,
          WebkitMaskImage: `url(${maskUrl})`,
          maskImage: `url(${maskUrl})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          imageRendering: 'pixelated',
        }}
      />
    </button>
  );
}
