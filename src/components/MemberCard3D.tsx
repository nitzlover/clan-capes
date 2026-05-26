'use client';

/**
 * Rotating 3D Minecraft player figure for a clan member row.
 *
 * Skin source: the server runs in offline mode, so player UUIDs are
 * v3 hashes that Mojang doesn't recognise and crafatar / textures.
 * minecraft.net returns 404. Until SkinsRestorer's resolved-skin
 * cache gets surfaced through the panel API, we pick one of the
 * nine vanilla default skins (Steve / Alex / Ari / Efe / Kai /
 * Makena / Noor / Sunny / Zuri) deterministically from the UUID so
 * each member gets a stable, distinct silhouette in the row.
 *
 * The figure stands in a static "heroic stance" pose via skinview3d's
 * FunctionAnimation — arms slightly out, legs shoulder-wide, head
 * straight. That replaces skinview3d's default IdleAnimation so the
 * figure stops walking in place.
 *
 * Mount cost: ~1 WebGL context per card. Browsers cap that at
 * 8–16 — we let the caller pass a `lazy` flag that defers viewer
 * construction until the card scrolls into view, so a clan with
 * 30 members doesn't burn a context per row up front. Cards that
 * scroll off don't dispose; the WebGL backend is cheap once warm.
 */

import { useEffect, useRef, useState } from 'react';
import type { SkinViewer as SkinViewerType } from 'skinview3d';

const DEFAULT_SKINS = [
  'steve',
  'alex',
  'ari',
  'efe',
  'kai',
  'makena',
  'noor',
  'sunny',
  'zuri',
];

/**
 * Stable per-UUID skin pick. Hashes the UUID hex into an index 0-8
 * so the same player always gets the same default skin across page
 * reloads, but two members of the same clan don't all show as Steve.
 */
function defaultSkinFor(uuid: string): string {
  let h = 0;
  for (const ch of uuid.toLowerCase().replace(/-/g, '')) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `/mc/skins/${DEFAULT_SKINS[h % DEFAULT_SKINS.length]}.png`;
}

type Props = {
  playerUuid: string;
  playerName: string;
  role?: 'leader' | 'deputy' | 'member';
  /** Optional sub-line beneath the name (K/D, online state, etc). */
  subtitle?: string;
  width?: number;
  height?: number;
  /** Defer viewer construction until first IntersectionObserver entry. */
  lazy?: boolean;
};

/**
 * Static heroic stance — arms out slightly from the body, legs
 * shoulder-width, head straight. Set per-frame via a
 * FunctionAnimation because skinview3d's default IdleAnimation
 * resets every joint each tick — leaving the bones alone outside
 * an animation makes the viewer skip the figure entirely.
 */
function applyHeroicPose(
  player: import('skinview3d').PlayerObject,
) {
  const skin = player.skin;
  // Arms slightly out + a touch forward (battle-ready, not stiff).
  skin.leftArm.rotation.z = 0.16;
  skin.rightArm.rotation.z = -0.16;
  skin.leftArm.rotation.x = -0.08;
  skin.rightArm.rotation.x = -0.08;
  // Legs in a shoulder-wide stance.
  skin.leftLeg.rotation.z = 0.06;
  skin.rightLeg.rotation.z = -0.06;
  // Subtle head + body lean to avoid the "Steve at attention" look.
  skin.head.rotation.y = -0.02;
}

export function MemberCard3D({
  playerUuid,
  playerName,
  role = 'member',
  subtitle,
  width = 140,
  height = 200,
  lazy = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldMount, setShouldMount] = useState(!lazy);

  // Lazy mount — only spin up the WebGL context when the card
  // actually enters the viewport. Keeps a 30-member clan from
  // tripping the browser's context cap on first paint.
  useEffect(() => {
    if (!lazy || shouldMount) return;
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShouldMount(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, shouldMount]);

  useEffect(() => {
    if (!shouldMount) return;
    if (!canvasRef.current) return;
    let cancelled = false;
    let local: SkinViewerType | null = null;
    let raf = 0;

    const skinUrl = defaultSkinFor(playerUuid);

    (async () => {
      const mod = await import('skinview3d');
      if (cancelled || !canvasRef.current) return;
      local = new mod.SkinViewer({
        canvas: canvasRef.current,
        width,
        height,
        skin: skinUrl,
        // Match the surrounding card chrome — pure black so the
        // canvas blends with the panel background, no inner stroke
        // visible.
        background: 0x0a0a0a,
      });

      // Disable user-driven zoom + pan — only orbit. The defaults
      // would let a stray scroll inside the row dolly the camera
      // around, which is jarring inside a dense list.
      local.controls.enableZoom = false;
      local.controls.enableRotate = true;
      local.controls.enablePan = false;

      // Hold the pose every frame; pair with a tiny sway via
      // playerObject.rotation.y so the figure has life without
      // walking in place.
      local.animation = new mod.FunctionAnimation((player) => {
        applyHeroicPose(player);
      });

      const start = performance.now();
      const tick = () => {
        if (!local) return;
        const t = (performance.now() - start) / 1000;
        // Gentle sway — ~30° peak-to-peak — and a faint vertical
        // breathing motion, both slow enough to read as alive
        // rather than spinning.
        local.playerObject.rotation.y = Math.sin(t * 0.4) * 0.25;
        local.playerObject.position.y = Math.sin(t * 1.1) * 0.05;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      local?.dispose();
    };
  }, [shouldMount, playerUuid, width, height]);

  const roleLabel = role.toUpperCase();
  const roleColor =
    role === 'leader'
      ? 'text-white'
      : role === 'deputy'
        ? 'text-[var(--text-soft)]'
        : 'text-[var(--text-mute)]';

  return (
    <div
      ref={containerRef}
      className="flex shrink-0 flex-col items-center"
      style={{ width }}
    >
      <div
        className="border-2 border-[var(--rule-strong)] bg-[#0a0a0a]"
        style={{ width, height }}
      >
        {shouldMount ? (
          <canvas
            ref={canvasRef}
            style={{ width, height, display: 'block', cursor: 'grab' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              …
            </span>
          </div>
        )}
      </div>
      <span
        className="mt-2 max-w-full truncate font-sans text-xs font-bold uppercase tracking-wider text-white"
        title={playerName}
      >
        {playerName}
      </span>
      <span
        className={`font-mono text-[9px] uppercase tracking-[0.22em] ${roleColor}`}
      >
        {roleLabel}
      </span>
      {subtitle && (
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {subtitle}
        </span>
      )}
    </div>
  );
}
