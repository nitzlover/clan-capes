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
  /**
   * Render style.
   *   "banner" — flat 20×40 cloth, used in the editor side-panel preview.
   *   "shield" — Minecraft inventory-style shield: brown wooden plank
   *              backing + iron rim + iron rivet pins at the 4 corners,
   *              cloth painted in the centre.
   *   "block"  — vanilla banner block: cloth + wooden pole hanging
   *              below it, like the banner item in a player's hand.
   */
  shape?: 'banner' | 'shield' | 'block';
};

/**
 * Banner / shield preview painted in Minecraft's own pixel-art language.
 *
 * The cloth itself uses the same CSS mask-image trick as before — each
 * pattern is a 20×40 alpha PNG, dye colour fills the rect, mask cuts it
 * to the pattern shape. The previous shield mode tried to render a
 * stylised SVG heater silhouette which looked nothing like the in-game
 * item. This rewrite drops the heater shape entirely:
 *
 *   - shield mode mirrors the vanilla shield's INVENTORY sprite: a wood
 *     plank background, iron rim line, iron rivet pins at the corners,
 *     and the banner cloth painted across the front. That's the shape
 *     players actually see in their hotbar and in their hand.
 *   - block mode mirrors the vanilla banner ITEM: cloth on top with a
 *     small wooden pole hanging below it. Same shape as a banner held
 *     in offhand or sitting in an item frame.
 *   - banner mode is unchanged — flat cloth, used in the editor's
 *     side-by-side "you are editing this 20×40 texture" preview.
 *
 * Everything is plain CSS + img masks. No external textures, no canvas,
 * no Three.js. Pixel-perfect look comes from the `imageRendering:
 * pixelated` lock and from snapping all the woodgrain accents to
 * percentage units so they read like 1-px MC pixels at any size.
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

  // Native banner aspect = 1:2. Shield items render slightly wider —
  // closer to the in-game inventory sprite (1:1.15 give or take). Block
  // mode adds a pole below the cloth, so its overall height is taller.
  const h =
    shape === 'shield' ? Math.round(width * 1.18) :
    shape === 'block' ? Math.round(width * 2.4) :
    width * 2;

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

  const inner =
    shape === 'shield' ? (
      <ShieldSprite width={width} height={h} baseHex={base.hex}>
        {layers}
      </ShieldSprite>
    ) : shape === 'block' ? (
      <BannerBlockSprite width={width} height={h} baseHex={base.hex}>
        {layers}
      </BannerBlockSprite>
    ) : (
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
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {label}
        </p>
      )}
      <div className={framed ? 'inline-block bg-[var(--bg-sink)] p-2' : ''}>
        {inner}
      </div>
      {framed && (
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {shape === 'shield' ? 'shield · ' : shape === 'block' ? 'banner · ' : 'base · '}
          {BANNER_COLORS[safe.baseColor]?.name ?? 'white'} · {safe.patterns.length} layer{safe.patterns.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

/**
 * Minecraft shield inventory sprite — wood plank + iron rim + cloth.
 *
 * The proportions are taken from the vanilla shield item icon:
 *   - 4px iron rim around the outside
 *   - 2px wood plank band visible above the cloth (the "shield boss"
 *     band that runs across the top in the in-game item icon)
 *   - cloth fills the rest, with iron rivets at each corner
 */
function ShieldSprite({
  width,
  height,
  baseHex,
  children,
}: {
  width: number;
  height: number;
  baseHex: string;
  children: React.ReactNode;
}) {
  const ironRim = '#a4a4a4';
  const ironRimDark = '#5b5b5b';
  const wood = '#7c5a32';
  const woodDark = '#4a3416';

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        background: ironRim,
        boxShadow: 'inset 0 0 0 1px ' + ironRimDark + ', 0 6px 18px rgba(0,0,0,0.45)',
        imageRendering: 'pixelated',
      }}
    >
      {/* Wood plank backing — inset 4% so iron rim shows around it. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '4%',
          background: `repeating-linear-gradient(180deg, ${wood} 0 6%, ${woodDark} 6% 7%, ${wood} 7% 13%)`,
          imageRendering: 'pixelated',
        }}
      />
      {/* Cloth area — banner sits across most of the shield, leaving the
          top wood band visible like in the vanilla item icon. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '12%',
          left: '10%',
          right: '10%',
          bottom: '8%',
          background: baseHex,
          imageRendering: 'pixelated',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
      </div>
      {/* Iron rivet pins at the corners. */}
      <Rivet x="6%" y="6%" />
      <Rivet x="84%" y="6%" />
      <Rivet x="6%" y="84%" />
      <Rivet x="84%" y="84%" />
    </div>
  );
}

function Rivet({ x, y }: { x: string; y: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: '10%',
        height: '9%',
        background: 'radial-gradient(circle at 30% 30%, #efefef, #5b5b5b 70%, #1c1c1c)',
        boxShadow: '0 1px 1px rgba(0,0,0,0.55)',
      }}
    />
  );
}

/**
 * Vanilla banner block sprite — cloth + wooden pole hanging below.
 * Used as the small clan-row thumbnail and in the editor's secondary
 * preview. The cloth keeps its native 1:2 aspect; the pole sits below.
 */
function BannerBlockSprite({
  width,
  height,
  baseHex,
  children,
}: {
  width: number;
  height: number;
  baseHex: string;
  children: React.ReactNode;
}) {
  const clothH = Math.round(width * 2);
  const poleH = height - clothH;
  const wood = '#5a3c1f';
  const woodHi = '#7c5a32';

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        imageRendering: 'pixelated',
      }}
    >
      {/* Cloth — same 1:2 banner rectangle. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: clothH,
          background: baseHex,
          boxShadow: '0 6px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
      </div>
      {/* Wood crossbar attaching the cloth to the pole. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: clothH,
          left: '-10%',
          width: '120%',
          height: Math.max(4, Math.round(poleH * 0.18)),
          background: `linear-gradient(180deg, ${woodHi}, ${wood})`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.45)',
        }}
      />
      {/* Vertical pole. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: clothH + Math.round(poleH * 0.18),
          left: '45%',
          width: '10%',
          bottom: 0,
          background: `linear-gradient(90deg, ${wood} 0%, ${woodHi} 50%, ${wood} 100%)`,
        }}
      />
    </div>
  );
}
