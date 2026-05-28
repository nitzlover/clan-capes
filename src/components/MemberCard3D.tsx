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
 * Pose values from mcskins.top/avatar-maker, expressed in degrees
 * per bone as `[rotX, rotY, rotZ]`. skinview3d's PlayerObject takes
 * radians on each bone's `rotation`, so we convert on apply. Set
 * every frame via FunctionAnimation because skinview3d's default
 * IdleAnimation would overwrite the joints each tick.
 */
const POSE_DEG = {
  head: [0, 95, 0],
  body: [0, 0, 0],
  leftArm: [0, 0, 0],
  rightArm: [-68, -57, -36],
  leftLeg: [0, -4, 0],
  rightLeg: [0, 0, 0],
} as const;

const D2R = Math.PI / 180;

function applyPose(player: import('skinview3d').PlayerObject) {
  const skin = player.skin;
  const bones = [
    [skin.head, POSE_DEG.head],
    [skin.body, POSE_DEG.body],
    [skin.leftArm, POSE_DEG.leftArm],
    [skin.rightArm, POSE_DEG.rightArm],
    [skin.leftLeg, POSE_DEG.leftLeg],
    [skin.rightLeg, POSE_DEG.rightLeg],
  ] as const;
  for (const [bone, [x, y, z]] of bones) {
    bone.rotation.x = x * D2R;
    bone.rotation.y = y * D2R;
    bone.rotation.z = z * D2R;
  }
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

      // Hold the static pose every frame. No sway, no breathing —
      // per-card mount times were drifting out of phase and reading
      // as jittery noise across a long member list. A frozen
      // figurine is calmer and lets the eye scan the row.
      local.animation = new mod.FunctionAnimation((player) => {
        applyPose(player);
      });
    })();

    return () => {
      cancelled = true;
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
