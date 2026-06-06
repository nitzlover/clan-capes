'use client';

import { useEffect, useRef, useState } from 'react';
import type { SkinViewer as SkinViewerType } from 'skinview3d';

type BackEquipment = 'cape' | 'elytra';
type StanceMode = 'stand' | 'walk' | 'run' | 'fly';

type Props = {
  /** Cape URL (http(s) or data:). When null/undefined, only the skin is shown. */
  capeUrl?: string | null;
  /** Custom skin URL. Defaults to a vanilla Steve template. */
  skinUrl?: string;
  /** Canvas CSS width. */
  width?: number;
  /** Canvas CSS height. */
  height?: number;
  /**
   * Auto-rotate the player. Default OFF — admins reported the spinning
   * was distracting, and OrbitControls already let them drag-rotate
   * manually if they want to inspect the cape from another angle.
   */
  rotate?: boolean;
  /** Show a small mono label above the canvas. */
  label?: string;
  /** Initial pan view — back shows the cape, side shows the player profile. */
  view?: 'back' | 'side' | 'front';
  /**
   * Controlled cape vs elytra back equipment. Defaults to 'cape'. Lifted
   * out of this component on purpose so call sites can render their own
   * pill toggles wherever the surrounding layout needs them (e.g. the
   * Cape Studio pane corner, not on top of the canvas).
   */
  backEquipment?: BackEquipment;
  /**
   * Controlled stance — `stand` plays IdleAnimation, `fly` plays
   * FlyingAnimation. Same lifted-state rationale as backEquipment.
   */
  stance?: StanceMode;
  /**
   * Camera zoom — lower values pull the camera back so a smaller
   * player fits the canvas. Defaults to skinview3d's own 0.9 in
   * stand stance; fly stance always overrides to a wider frame
   * because a horizontal player won't fit the standing crop no
   * matter what zoom the caller asked for.
   */
  zoom?: number;
  /**
   * Allow manual drag-rotate. Default true. Set false to LOCK the
   * framing to the initial `view` — e.g. roster / inspect previews that
   * must always show the cape from the back and can't be knocked to the
   * front by a stray drag.
   */
  interactive?: boolean;
};

const DEFAULT_SKIN = '/skins/steve.png';

/**
 * 3D Minecraft player viewer powered by skinview3d.
 *
 * The component is intentionally minimal:
 *   - Canvas only. No internal border, no inner background colour, no
 *     toggle overlays. The parent owns the surrounding chrome and
 *     positions any pill controls wherever its layout calls for them.
 *   - Back equipment (cape ↔ elytra) and stance (stand ↔ fly) are
 *     controlled props. Call sites that want pill toggles render them
 *     in their own JSX and pass the new value down — same idiom as
 *     other controlled inputs.
 *
 * The viewer is stored in React state, not a ref, on purpose. The
 * SkinViewer constructor is awaited (dynamic `import('skinview3d')`),
 * so on the first render `viewerRef.current` would be null and the
 * cape-loading effect that depends on `[capeUrl, backEquipment]` would
 * fire with no viewer to talk to — and then never re-fire when the
 * async constructor finally settled, because none of its deps had
 * actually changed. Putting the viewer in state forces the cape effect
 * to re-run the instant the constructor finishes. That bug is why
 * capes uploaded with the page never made it onto the model on the
 * roster cards.
 */
export function PlayerCapeView3D({
  capeUrl,
  skinUrl = DEFAULT_SKIN,
  width = 200,
  height = 280,
  rotate = false,
  label,
  view = 'back',
  backEquipment = 'cape',
  stance = 'stand',
  zoom,
  interactive = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef<number | null>(null);
  const [viewer, setViewer] = useState<SkinViewerType | null>(null);
  const [skinviewMod, setSkinviewMod] = useState<
    typeof import('skinview3d') | null
  >(null);

  // Construct the viewer once per (size, skin, view, rotate) combo. The
  // async import means the viewer arrives after the first render, so we
  // commit it to state — the cape effect below re-runs as soon as it
  // does.
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    let local: SkinViewerType | null = null;

    (async () => {
      const mod = await import('skinview3d');
      if (cancelled || !canvasRef.current) return;
      local = new mod.SkinViewer({
        canvas: canvasRef.current,
        width,
        height,
        skin: skinUrl,
        // Pure black so the canvas blends seamlessly into the
        // surrounding right-pane background instead of showing as a
        // 1px-tone-different rectangle inside it.
        background: 0x000000,
      });

      // skinview3d 3.4.2 here renders yaw 0 as the BACK (cape toward the
      // camera) and yaw π as the FRONT/face — verified from a locked
      // view="back" preview that showed the face. Cape previews default to
      // "back" so the cape is what you see.
      const yaw =
        view === 'front' ? Math.PI : view === 'side' ? Math.PI / 2 : 0;
      local.playerObject.rotation.y = yaw;

      local.controls.enableZoom = false;
      local.controls.enableRotate = interactive;
      local.controls.enablePan = false;

      // Default stance — the stance effect below will override if a
      // non-default prop value is passed.
      local.animation = new mod.IdleAnimation();

      setSkinviewMod(mod);
      setViewer(local);

      if (rotate) {
        const step = () => {
          if (!local) return;
          local.playerObject.rotation.y += 0.004;
          rotationRef.current = requestAnimationFrame(step);
        };
        rotationRef.current = requestAnimationFrame(step);
      }
    })();

    return () => {
      cancelled = true;
      if (rotationRef.current !== null) cancelAnimationFrame(rotationRef.current);
      rotationRef.current = null;
      local?.dispose();
      setViewer(null);
      setSkinviewMod(null);
    };
  }, [skinUrl, width, height, rotate, view, interactive]);

  // Cape texture — re-runs when the viewer first becomes available
  // (because viewer is a state value) and on every subsequent change to
  // capeUrl or backEquipment. The `.catch` logs to the console so that
  // CORS / format failures don't just silently leave the player bare —
  // an admin debugging an empty cape can read the actual error from
  // dev tools.
  useEffect(() => {
    if (!viewer) return;
    if (capeUrl) {
      viewer.loadCape(capeUrl, { backEquipment }).catch((err) => {
        console.error('[skinview3d] loadCape failed:', err);
      });
    } else {
      viewer.resetCape();
    }
  }, [viewer, capeUrl, backEquipment]);

  // Stance — IdleAnimation for stand, FlyingAnimation for fly.
  useEffect(() => {
    if (!viewer || !skinviewMod) return;
    viewer.animation =
      stance === 'fly'
        ? new skinviewMod.FlyingAnimation()
        : stance === 'walk'
          ? new skinviewMod.WalkingAnimation()
          : stance === 'run'
            ? new skinviewMod.RunningAnimation()
            : new skinviewMod.IdleAnimation();
  }, [viewer, skinviewMod, stance]);

  // Zoom — pull the camera back in fly stance so the rotated-horizontal
  // player isn't clipped at the left and right edges of the canvas.
  // In stand stance honour the caller's `zoom` prop (or skinview3d's
  // 0.9 default) so compact previews like the roster cards can ask for
  // a smaller player without affecting the big Cape Studio pane.
  useEffect(() => {
    if (!viewer) return;
    viewer.zoom = stance === 'fly' ? 0.55 : (zoom ?? 0.9);
  }, [viewer, stance, zoom]);

  return (
    <div className="inline-flex flex-col gap-2">
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {label}
        </p>
      )}
      <div className="relative" style={{ width, height }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
