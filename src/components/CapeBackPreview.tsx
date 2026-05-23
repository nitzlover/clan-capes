'use client';

/**
 * Cape "as worn" preview.
 *
 * The Minecraft cape texture is a 64×32 atlas (or 128×64 HD) but only a
 * small slice of it is actually visible on the player's back when worn:
 *   front face (what other players see): x=1, y=1, w=10, h=16
 * Everything else on the atlas is reverse/inside/edge geometry that the
 * server-admin almost never cares about while uploading. So instead of
 * showing the raw 64×32 PNG, we crop to that visible rectangle and render
 * it big, draped on a tiny stylised Steve back silhouette so the admin
 * can see at a glance what the cape will actually look like in-game.
 *
 * The component handles both 64×32 and 128×64 sources transparently:
 * we just pass `scale = textureWidth / 64` to the background sizing.
 */

type Props = {
  /** PNG URL or data: URL. Either this or `base64` is required. */
  url?: string | null;
  /** Raw base64 PNG without the `data:` prefix. */
  base64?: string | null;
  /** Native texture width — 64 for vanilla, 128 for HD. */
  textureWidth?: number;
  /** Native texture height — 32 for vanilla, 64 for HD. */
  textureHeight?: number;
  /** Pixel size of one cape texel on screen. Default 10 = 10× zoom. */
  zoom?: number;
  label?: string;
};

export function CapeBackPreview({
  url,
  base64,
  textureWidth = 64,
  textureHeight = 32,
  zoom = 10,
  label,
}: Props) {
  const src = base64 ? `data:image/png;base64,${base64}` : url;

  // Vanilla cape model — front (visible) face. Coordinates are given for the
  // 64×32 atlas; HD textures scale proportionally.
  const VISIBLE = { x: 1, y: 1, w: 10, h: 16 } as const;

  // The texture pixel sizing on screen.
  const texScaleX = textureWidth / 64;
  const texScaleY = textureHeight / 32;

  // Render the cape sprite via a background-image trick: we blow the whole
  // atlas up to (textureWidth · zoom) × (textureHeight · zoom) and shift it
  // so the visible window aligns with the cropped DOM box.
  const bgWidth = textureWidth * zoom;
  const bgHeight = textureHeight * zoom;
  const bgPosX = -VISIBLE.x * zoom * texScaleX;
  const bgPosY = -VISIBLE.y * zoom * texScaleY;
  const capePxW = VISIBLE.w * zoom;
  const capePxH = VISIBLE.h * zoom;

  // Mock Steve silhouette dimensions (sized so the cape sits behind the
  // body, not floating in space).
  const PIX = zoom; // 1 game pixel = `zoom` screen pixels
  const HEAD = { w: 8 * PIX, h: 8 * PIX };
  const BODY = { w: 8 * PIX, h: 12 * PIX };
  const ARM = { w: 4 * PIX, h: 12 * PIX };
  const LEG = { w: 4 * PIX, h: 12 * PIX };
  const figureW = (ARM.w + BODY.w + ARM.w);
  const figureH = (HEAD.h + BODY.h + LEG.h);

  if (!src) {
    return (
      <div className="inline-flex flex-col gap-2">
        {label && <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>}
        <div
          className="flex items-center justify-center rounded border border-dashed border-white/15 bg-black/30 text-xs text-white/40"
          style={{ width: figureW + capePxW, height: figureH }}
        >
          No preview
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col gap-2">
      {label && (
        <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      )}
      <div
        className="relative overflow-hidden rounded border border-white/10 bg-[#1e1e1e]"
        style={{ width: figureW + 4 * PIX, height: figureH + 2 * PIX, padding: PIX }}
      >
        {/* Stylised Steve back silhouette — flat blocks of cloth/skin colour.
            Sized in *zoom* pixels so it looks crisp at any zoom level. */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2" style={{ width: figureW, height: figureH }}>
          {/* Head (back of head — short hair tone) */}
          <div
            className="absolute"
            style={{
              left: ARM.w,
              top: 0,
              width: HEAD.w,
              height: HEAD.h,
              background: '#3a2a1a',
            }}
          />
          {/* Right arm */}
          <div
            className="absolute"
            style={{
              left: 0,
              top: HEAD.h,
              width: ARM.w,
              height: ARM.h,
              background: '#b48975',
            }}
          />
          {/* Body (back of teal shirt) */}
          <div
            className="absolute"
            style={{
              left: ARM.w,
              top: HEAD.h,
              width: BODY.w,
              height: BODY.h,
              background: '#2c8290',
            }}
          />
          {/* Left arm */}
          <div
            className="absolute"
            style={{
              left: ARM.w + BODY.w,
              top: HEAD.h,
              width: ARM.w,
              height: ARM.h,
              background: '#b48975',
            }}
          />
          {/* Right leg */}
          <div
            className="absolute"
            style={{
              left: ARM.w,
              top: HEAD.h + BODY.h,
              width: LEG.w,
              height: LEG.h,
              background: '#3a3aa8',
            }}
          />
          {/* Left leg */}
          <div
            className="absolute"
            style={{
              left: ARM.w + LEG.w,
              top: HEAD.h + BODY.h,
              width: LEG.w,
              height: LEG.h,
              background: '#3a3aa8',
            }}
          />
        </div>

        {/* Cape sprite drawn on top of Steve's back. The cape hangs from
            the top of the body (just under the neck) and is 10 px wide
            (1 px wider on each side than the 8 px body). */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: PIX + HEAD.h - PIX, // sit just above shoulders so it covers neck/upper back
            width: capePxW,
            height: capePxH,
            backgroundImage: `url("${src}")`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${bgWidth}px ${bgHeight}px`,
            backgroundPosition: `${bgPosX}px ${bgPosY}px`,
            imageRendering: 'pixelated',
            boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
          }}
        />
      </div>
    </div>
  );
}
