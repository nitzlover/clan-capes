'use client';

import {
  BANNER_COLORS,
  PATTERN_PREVIEW_FALLBACK,
  SHIELD_PATTERN_FILE,
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

/**
 * Shield-specific pattern mask. These come from the vanilla
 * entity/shield/ atlas (1.21 textures pack) and are already projected
 * onto the shield's 3D front-face UVs — using them gives an exact
 * in-game appearance, not a flat banner cropped to a shield rectangle.
 * Returns null when the code has no shield mapping (no layer drawn).
 */
function shieldMaskUrlFor(code: string): string | null {
  const file = SHIELD_PATTERN_FILE[code];
  return file ? `/mc/shield-patterns/${file}.png` : null;
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

  // Native banner aspect = 1:2. Shield = 14:24 (wood front + iron rim
  // on all four sides) ≈ 1:1.714. Block mode adds a pole below the
  // cloth, so its overall height is taller.
  const h =
    shape === 'shield' ? Math.round(width * (24 / 14)) :
    shape === 'block' ? Math.round(width * 2.4) :
    width * 2;

  // Two layer renderers: flat banner masks (banner mode + block mode)
  // use the 20×40 cloth-shaped masks in /banner/patterns; the shield
  // mode uses the vanilla entity/shield/*.png masks which are already
  // projected onto the 3D shield front face. Keeping them separate
  // means each preview reads correctly without one accidentally borrowing
  // the other's UVs.
  const bannerLayers = safe.patterns.map((p, idx) => {
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
      <ShieldSprite
        width={width}
        baseHex={base.hex}
        patterns={safe.patterns.map((p) => ({
          color: colorForOrdinal(p.color).hex,
          maskUrl: shieldMaskUrlFor(p.pattern),
        }))}
      />
    ) : shape === 'block' ? (
      <BannerBlockSprite width={width} height={h} baseHex={base.hex}>
        {bannerLayers}
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
        {bannerLayers}
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
 * Vanilla shield with iron rim, wood backing, banner cloth and grip
 * stub — rendered to match the in-game item icon, not the raw entity
 * texture atlas.
 *
 * `shield_base_nopattern.png` (64×32) only contains the WOOD front
 * face in its top-left 12×22 block — the iron rim around the in-game
 * shield is geometry on the side faces of the 3D model, never painted
 * onto the front-face crop. Our previous version naively cropped that
 * block and shipped it as the whole shield, which is why the result
 * looked like a wooden plank with a banner stuck on it.
 *
 * This version frames a 14×24 outer container, insets the wood front
 * by 1px on each side, lays the banner cloth across the
 * 10×20 cloth UV window inside the wood (x=1..10, y=2..21), and adds
 * a small grip stub poking out on the right. Iron is drawn as a CSS
 * gradient with a slight diagonal highlight so the rim reads as
 * polished metal at any scale.
 */
function ShieldSprite({
  width,
  baseHex,
  patterns,
}: {
  width: number;
  baseHex: string;
  patterns: Array<{ color: string; maskUrl: string | null }>;
}) {
  // Outer shield silhouette = 14 native px wide × 24 native px tall:
  // a 12×22 wood front face + 1 px of iron rim on every side. We use
  // the user-supplied width as the outer width and derive everything
  // else from it so the proportions stay locked.
  const scale = width / 14;
  const outerW = width;
  const outerH = 24 * scale;

  // The vanilla shield atlas (`shield_base_nopattern.png`,
  // `shield/<pattern>.png`) is 64×64 px. The shield model JSON places
  // the FRONT-FACE UV at (3.5, 0.25)..(6.5, 5.75) in 16-unit space,
  // which in pixels is (14, 1)..(26, 23). So when we drop a 12×22
  // wood front into our DOM, the atlas behind it needs to be scaled
  // up so that one atlas pixel = one wood pixel (so the front-face
  // crop renders 1:1), and shifted left/up by 14 / 1 atlas pixels so
  // the top-left of the crop lines up with the top-left of the wood
  // div.
  const woodW = 12 * scale;
  const woodH = 22 * scale;
  const woodLeft = 1 * scale;
  const woodTop = 1 * scale;
  const atlasW = 64 * scale;
  const atlasH = 64 * scale;
  const atlasOffX = -14 * scale;
  const atlasOffY = -1 * scale;

  const ironLight = '#c8c8c8';
  const ironMid = '#8e8e8e';
  const ironDark = '#5b5b5b';
  const ironShadow = '#2a2a2a';

  return (
    <div
      style={{
        position: 'relative',
        width: outerW,
        height: outerH,
        imageRendering: 'pixelated',
        filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.45))',
      }}
    >
      {/* Grip stub — drawn first, peeks out behind the right edge. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: `${-2 * scale}px`,
          top: `${8 * scale}px`,
          width: `${3 * scale}px`,
          height: `${8 * scale}px`,
          background: `linear-gradient(90deg, ${ironMid} 0%, ${ironDark} 60%, ${ironShadow} 100%)`,
          boxShadow: `inset 1px 0 0 ${ironLight}, inset -1px 0 0 ${ironShadow}`,
        }}
      />

      {/* Iron rim — outer rectangle filled with a polished-metal gradient. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${ironLight} 0%, ${ironMid} 30%, ${ironMid} 70%, ${ironDark} 100%)`,
          boxShadow: `inset 0 0 0 ${Math.max(1, scale * 0.4)}px ${ironShadow}`,
        }}
      />

      {/* Front face zone — 12×22 native px. Holds the vanilla wood
          backing, the base-coloured cloth (also pulled from the vanilla
          shield/base atlas), and the pattern layers (each using the
          matching vanilla shield/<pattern> atlas as its mask).

          Every layer shares the same atlas-sized background-/mask-size
          and the same (-14, -1) atlas-pixel offset, so the wood, the
          cloth, and every pattern composite pixel-for-pixel exactly the
          way the MC client paints them. */}
      <div
        style={{
          position: 'absolute',
          left: woodLeft,
          top: woodTop,
          width: woodW,
          height: woodH,
          imageRendering: 'pixelated',
          overflow: 'hidden',
        }}
      >
        {/* Wood backing — shield_base_nopattern.png 12×22 front face. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/mc/shield_base_nopattern.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${atlasW}px ${atlasH}px`,
            backgroundPosition: `${atlasOffX}px ${atlasOffY}px`,
            imageRendering: 'pixelated',
          }}
        />
        {/* Cloth — vanilla shield/base.png as the alpha mask so the
            cloth lands exactly on the same pixels the MC client paints. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: baseHex,
            WebkitMaskImage: 'url(/mc/shield-patterns/base.png)',
            maskImage: 'url(/mc/shield-patterns/base.png)',
            WebkitMaskSize: `${atlasW}px ${atlasH}px`,
            maskSize: `${atlasW}px ${atlasH}px`,
            WebkitMaskPosition: `${atlasOffX}px ${atlasOffY}px`,
            maskPosition: `${atlasOffX}px ${atlasOffY}px`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />
        {/* Pattern layers — each rendered with the same atlas geometry
            so the projection lines up with everything else. */}
        {patterns.map((p, idx) => {
          if (!p.maskUrl) return null;
          return (
            <div
              key={idx}
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: p.color,
                WebkitMaskImage: `url(${p.maskUrl})`,
                maskImage: `url(${p.maskUrl})`,
                WebkitMaskSize: `${atlasW}px ${atlasH}px`,
                maskSize: `${atlasW}px ${atlasH}px`,
                WebkitMaskPosition: `${atlasOffX}px ${atlasOffY}px`,
                maskPosition: `${atlasOffX}px ${atlasOffY}px`,
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                imageRendering: 'pixelated',
              }}
            />
          );
        })}
      </div>
    </div>
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
