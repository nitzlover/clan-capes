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
  /** Render as a shield-shaped silhouette with silver rim instead of a
   *  flat banner rectangle. Used in the editor so admins see what the
   *  in-game shield will actually look like. */
  shape?: 'banner' | 'shield';
};

/**
 * Heater-shield silhouette as a CSS polygon — percentage coords scale to
 * the container at any size. The rim is drawn by stacking two clipped
 * boxes: outer one filled with wood-tone, inner one (slightly inset)
 * holds the actual banner content. This keeps the rim visible as a thin
 * band around the cloth, mimicking the vanilla shield item.
 */
const SHIELD_POLYGON = `polygon(
  10% 0%,
  90% 0%,
  96% 4%,
  96% 64%,
  88% 80%,
  50% 100%,
  12% 80%,
  4% 64%,
  4% 4%
)`;
const SHIELD_RATIO = 1.25; // height / width — heater shield aspect

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
export function BannerPreview({
  spec,
  width = 100,
  label,
  framed = true,
  shape = 'banner',
}: Props) {
  const safe = spec ?? { baseColor: 0, patterns: [] };
  const base = colorForOrdinal(safe.baseColor);
  // Banner mode keeps the native 20×40 aspect; shield mode crops the
  // bottom half of the banner into the shield silhouette, so its height
  // is governed by the shield path's 20×24 aspect.
  const h = shape === 'shield' ? Math.round(width * SHIELD_RATIO) : width * 2;

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

  const innerStyle = {
    position: 'relative' as const,
    width,
    height: h,
    boxShadow: framed ? '0 6px 18px rgba(0,0,0,0.45)' : undefined,
    imageRendering: 'pixelated' as const,
  };

  const inner =
    shape === 'shield' ? (
      <div style={{ ...innerStyle, overflow: 'visible' }}>
        {/* Wood/silver rim — outer shield silhouette filled with a
            gradient, clipped to the shield polygon. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, #b4995f 0%, #7d6438 55%, #463713 100%)',
            clipPath: SHIELD_POLYGON,
            WebkitClipPath: SHIELD_POLYGON,
          }}
        />
        {/* Banner cloth — same silhouette, inset ~10% to leave the rim
            visible around the edges. The native 20×40 banner content is
            anchored to the top so the bottom (off-shield) part of the
            pattern hangs out of view, mirroring how the item renders
            in-game (only the top ~60% of the banner sits on the shield). */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '6%',
            left: '10%',
            right: '10%',
            bottom: '12%',
            clipPath: SHIELD_POLYGON,
            WebkitClipPath: SHIELD_POLYGON,
            overflow: 'hidden',
            background: base.hex,
            imageRendering: 'pixelated',
          }}
        >
          {/* Stretch the banner to the inner cloth area; the layers stack
              on top via the same percentage inset. */}
          <div style={{ position: 'absolute', inset: 0 }}>{layers}</div>
        </div>
        {/* Small silver boss for that shield look. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '47%',
            top: '40%',
            width: '6%',
            height: '5%',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #efe6c8, #8c7c4a)',
            boxShadow: '0 1px 1px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    ) : (
      <div style={{ ...innerStyle, background: base.hex }}>{layers}</div>
    );

  return (
    <div className="inline-flex flex-col gap-2">
      {label && (
        <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      )}
      <div
        className={
          framed
            ? 'overflow-visible rounded border border-white/10 bg-[#1e1e1e] p-2'
            : ''
        }
      >
        {inner}
      </div>
      {framed && (
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
          {shape === 'shield' ? 'shield · ' : 'base · '}
          {BANNER_COLORS[safe.baseColor]?.name ?? 'white'} · {safe.patterns.length} layer{safe.patterns.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

