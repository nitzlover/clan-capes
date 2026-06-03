'use client';

import {
  BANNER_COLORS,
  previewMaskCode,
  previewShapeId,
  type BannerSpec,
  colorForOrdinal,
} from '@/lib/banners';

/**
 * Flat 20×40 alpha mask for a pattern layer, resolved through
 * {@link previewMaskCode} (handles both modern keys and legacy project
 * codes). Returns null for the rare key with no flat mask — the layer is
 * then skipped. NOTE: must be the /banner/patterns set (20×40), NOT
 * /mc/shield-patterns (64×64 shield-entity textures, which render as a
 * tiny shield in the corner when used as a flat CSS mask).
 */
function maskUrlFor(key: string): string | null {
  const code = previewMaskCode(key);
  return code ? `/banner/patterns/${code}.png` : null;
}

type Props = {
  spec: BannerSpec | null | undefined;
  /** Banner width on screen. Native banner cloth is 1:2, shield ≈ 14:24. */
  width?: number;
  label?: string;
  /** Outer frame visible? Set false when embedding inside another card. */
  framed?: boolean;
  /**
   * Render style.
   *   "banner" — flat cloth, editor side-panel preview.
   *   "shield" — shield-aspect cloth (the in-game shield front-face).
   *   "block"  — banner block: cloth + wooden pole hanging below.
   */
  shape?: 'banner' | 'shield' | 'block';
};

/**
 * Banner / shield preview painted in Minecraft's own pixel-art language.
 *
 * Unified renderer (post-2026-06-03): every shape composites the base
 * cloth colour with one CSS-masked layer per pattern, each mask being the
 * modern-key shield texture. The previous build had a separate shield path
 * driven by a scraped minecraft.tools sprite atlas indexed by an opaque
 * `shape_id`; that atlas disagreed with the in-game pattern on several
 * codes, which is why the editor preview lied. Driving every layer from
 * the same `/mc/shield-patterns/<modern_key>.png` the plugin resolves
 * makes the preview WYSIWYG with the server.
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

  // Native banner aspect = 1:2. Shield ≈ 14:24. Block adds a pole below.
  const h =
    shape === 'shield' ? Math.round(width * (24 / 14)) :
    shape === 'block' ? Math.round(width * 2.4) :
    width * 2;

  const layers = safe.patterns.map((p, idx) => {
    const url = maskUrlFor(p.pattern);
    if (!url) return null;
    const c = colorForOrdinal(p.color);
    return (
      <div
        key={idx}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: c.hex,
          WebkitMaskImage: `url(${url})`,
          maskImage: `url(${url})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          imageRendering: 'pixelated',
        }}
      />
    );
  });

  const cloth = (
    <div
      style={{
        position: 'relative',
        width,
        height: shape === 'block' ? Math.round(width * 2) : h,
        background: base.hex,
        boxShadow: framed && shape !== 'block' ? '0 6px 18px rgba(0,0,0,0.45)' : undefined,
        imageRendering: 'pixelated',
      }}
    >
      {layers}
    </div>
  );

  // Shield mode renders from the minecraft.tools sprite atlas (84×154 per
  // cell), which pixel-matches the in-game shield. The flat /banner/patterns
  // masks above are only for the flat banner + block shapes.
  const shieldLayers = safe.patterns
    .map((p) => ({ colorOrdinal: p.color, shapeId: previewShapeId(p.pattern) }))
    .filter((l): l is { colorOrdinal: number; shapeId: number } => l.shapeId !== null);

  const inner =
    shape === 'shield' ? (
      <ShieldSprite width={width} baseHex={base.hex} layers={shieldLayers} />
    ) : shape === 'block' ? (
      <BannerBlockSprite width={width} height={h} baseHex={base.hex}>
        {layers}
      </BannerBlockSprite>
    ) : (
      cloth
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
 * Shield preview via the minecraft.tools pre-baked sprite atlas
 * (`/public/mc/shieldx7.png`, 42 cols × 16 rows, 84×154 per cell). Each
 * pattern layer slices the atlas to its (shape_id, dye-ordinal) cell; the
 * base colour fills behind (cells carry alpha) and the shadow PNG bakes the
 * iron rim + grip on top. Position math = minecraft.tools':
 *   background-position: -(shape_id × cellW)px  -(dyeOrdinal × cellH)px
 * so a given NBT renders identically to that site and the game.
 */
function ShieldSprite({
  width,
  baseHex,
  layers,
}: {
  width: number;
  baseHex: string;
  layers: Array<{ colorOrdinal: number; shapeId: number }>;
}) {
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
    </div>
  );
}

/**
 * Vanilla banner block sprite — cloth + wooden pole hanging below.
 * Used as the small clan-row thumbnail and the editor's secondary preview.
 * The cloth keeps its native 1:2 aspect; the pole sits below.
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
