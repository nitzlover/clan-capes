'use client';

import {
  BANNER_COLORS,
  PATTERN_PREVIEW_FALLBACK,
  type BannerSpec,
  colorForOrdinal,
} from '@/lib/banners';

function maskUrlFor(code: string): string {
  // Some plugin-known codes (e.g. "tt", "flw") don't ship a dedicated 20×40
  // alpha mask under public/banner/patterns. Fall back to a visually
  // similar code so the layer is at least visible in the editor preview —
  // the spec still saves the original code so the plugin resolves it
  // correctly server-side.
  const target = PATTERN_PREVIEW_FALLBACK[code] ?? code;
  return `/banner/patterns/${target}.png`;
}

type Props = {
  spec: BannerSpec | null | undefined;
  /** Banner width on screen. The vanilla banner texture is 20×40, so the
   *  height is computed at 2× for the correct aspect. */
  width?: number;
  label?: string;
  /** Outer frame visible? Set false when embedding inside another card. */
  framed?: boolean;
};

/**
 * Live composite of a banner: base colour rectangle + one CSS-masked layer
 * per pattern. Each pattern PNG under `/banner/patterns/<code>.png` is a
 * 20×40 alpha mask, so we render a `<div>` filled with the layer's dye
 * colour and use the PNG as `mask-image` to cut out the pattern shape.
 *
 * Order matters — later patterns paint on top of earlier ones, same as
 * Minecraft itself. We rely on the browser's `mask-image` (modern Chrome,
 * Firefox, Safari) — no canvas, no Skia, zero JS per repaint.
 */
export function BannerPreview({ spec, width = 100, label, framed = true }: Props) {
  const safe = spec ?? { baseColor: 0, patterns: [] };
  const base = colorForOrdinal(safe.baseColor);
  const h = width * 2; // 20×40 native aspect

  const layers = safe.patterns.map((p, idx) => {
    const c = colorForOrdinal(p.color);
    return (
      <div
        key={idx}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: c.hex,
          WebkitMaskImage: `url(${maskUrlFor(p.pattern)})`,
          maskImage: `url(${maskUrlFor(p.pattern)})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          imageRendering: 'pixelated',
        }}
      />
    );
  });

  const inner = (
    <div
      style={{
        position: 'relative',
        width,
        height: h,
        background: base.hex,
        boxShadow: framed ? '0 6px 18px rgba(0,0,0,0.45)' : undefined,
        imageRendering: 'pixelated',
      }}
    >
      {layers}
    </div>
  );

  return (
    <div className="inline-flex flex-col gap-2">
      {label && (
        <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      )}
      <div
        className={
          framed
            ? 'overflow-hidden rounded border border-white/10 bg-[#1e1e1e] p-2'
            : ''
        }
      >
        {inner}
      </div>
      {framed && (
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
          base · {BANNER_COLORS[safe.baseColor]?.name ?? 'white'} · {safe.patterns.length} layer{safe.patterns.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
