'use client';

import {
  BANNER_COLORS,
  PATTERN_PREVIEW_FALLBACK,
  SHIELD_ATLAS_SHAPE_ID,
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
        baseOrdinal={safe.baseColor}
        layers={safe.patterns
          .map((p) => ({
            colorOrdinal: p.color,
            shapeId: SHIELD_ATLAS_SHAPE_ID[p.pattern] ?? null,
          }))
          .filter((l): l is { colorOrdinal: number; shapeId: number } => l.shapeId !== null)}
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
 * Shield preview rendered via minecraft.tools' pre-baked sprite atlas.
 *
 * Approach mirrors what minecraft.tools/en/shield.php ships:
 *   - One 3528×2464 PNG (`/public/mc/shieldx7.png`) holding every
 *     (pattern × dye-colour) combination at 84×154 per cell, laid out
 *     42 columns (shape_id) × 16 rows (colour, inverted so row 0 =
 *     WHITE / DyeColor 15 and row 15 = BLACK / DyeColor 0).
 *   - One 84×154 shadow PNG (`/public/mc/shield-shadow-x7.png`) that
 *     bakes the iron rim, the grip stub and the cloth window's alpha.
 *
 * For each layer we render a nested div with:
 *   background-image: shieldx7.png
 *   background-position: -(shape_id × cellW)px  -(dyeOrdinal × cellH)px
 *
 * The `.shield-big` outer container also takes the BASE colour as
 * `background-color`. That colour bleeds through the cloth area of
 * every layer because pattern cells include alpha — so a shield with
 * a black base and a red rhombus pattern renders exactly the way
 * Minecraft would paint it: black cloth where no pattern is set, red
 * pixels where the rhombus mask is opaque, iron rim baked into the
 * shadow on top.
 *
 * Position math is identical to minecraft.tools' `get_position()`:
 * after inverting their UI colour id back to DyeColor ordinal the X
 * becomes shapeId × cellW and the Y becomes dyeOrdinal × cellH.
 */
function ShieldSprite({
  width,
  baseHex,
  baseOrdinal,
  layers,
}: {
  width: number;
  baseHex: string;
  baseOrdinal: number;
  layers: Array<{ colorOrdinal: number; shapeId: number }>;
}) {
  // The native atlas is 84 × 154 per cell — that's minecraft.tools' "big"
  // size. We scale everything proportionally to whatever width the parent
  // asked for so the same atlas drives the editor preview, the clan
  // thumbnail and any other call site without resampling.
  const NATIVE_CELL_W = 84;
  const NATIVE_CELL_H = 154;
  const ATLAS_COLS = 42;
  const ATLAS_ROWS = 16;

  const scale = width / NATIVE_CELL_W;
  const cellW = NATIVE_CELL_W * scale;
  const cellH = NATIVE_CELL_H * scale;
  const atlasW = ATLAS_COLS * cellW;
  const atlasH = ATLAS_ROWS * cellH;

  const posFor = (shapeId: number, dyeOrdinal: number) =>
    `${-shapeId * cellW}px ${-dyeOrdinal * cellH}px`;

  return (
    <div
      style={{
        position: 'relative',
        width: cellW,
        height: cellH,
        backgroundColor: baseHex,
        imageRendering: 'pixelated',
        filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.45))',
      }}
    >
      {/* Each pattern layer — nested div with the atlas sliced to the
          right (shape, colour) cell. base colour shows through wherever
          the cell's pattern is transparent. */}
      {layers.map((l, idx) => (
        <div
          key={idx}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/mc/shieldx7.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${atlasW}px ${atlasH}px`,
            backgroundPosition: posFor(l.shapeId, l.colorOrdinal),
            imageRendering: 'pixelated',
          }}
        />
      ))}
      {/* Shadow — bakes the iron rim, the grip-stub silhouette and the
          inner cloth-edge shading the way the in-game item icon shows
          them. Drawn last so it sits on top of every pattern layer. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/mc/shield-shadow-x7.png)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${cellW}px ${cellH}px`,
          backgroundPosition: '0 0',
          imageRendering: 'pixelated',
        }}
      />
      {/* baseOrdinal is captured purely for hierarchy / debugging — the
          base colour itself is already painted via the container's
          background-color above. */}
      <span hidden>{baseOrdinal}</span>
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
