'use client';

import { useEffect, useRef } from 'react';
import type { SkinViewer as SkinViewerType } from 'skinview3d';

type Props = {
  /** Cape URL (http(s) or data:). When null/undefined, only the skin is shown. */
  capeUrl?: string | null;
  /** Custom skin URL. Defaults to a vanilla Steve template. */
  skinUrl?: string;
  /** Canvas CSS width. Height = width × ratio (3:4 portrait by default). */
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
};

const DEFAULT_SKIN = '/skins/steve.png';

/**
 * 3D Minecraft player viewer powered by skinview3d.
 *
 * Mounts a WebGL canvas the moment the component is on screen, loads a
 * Steve skin (or whatever the caller passes) and overlays the cape. The
 * camera starts behind the player so the cape texture is the focal
 * point — admins are previewing a CAPE, not a face.
 *
 * skinview3d ships its own Three.js, OrbitControls, idle-walk animation
 * and ambient lighting — we don't reimplement any of that. We just wire
 * up the canvas, react to prop changes, and tear down cleanly on
 * unmount so toggling capes in the editor doesn't leak GL contexts.
 *
 * Dynamic import is critical: skinview3d depends on `window` for canvas
 * sizing and WebGL feature detection. Importing it at the module top
 * level would crash Next.js's RSC build. Defer until the effect runs in
 * the browser.
 */
export function PlayerCapeView3D({
  capeUrl,
  skinUrl = DEFAULT_SKIN,
  width = 200,
  height = 280,
  rotate = false,
  label,
  view = 'back',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewerType | null>(null);
  const rotationRef = useRef<number | null>(null);

  // Construct the viewer once and tear it down on unmount.
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    let viewer: SkinViewerType | null = null;

    (async () => {
      const skinview = await import('skinview3d');
      if (cancelled || !canvasRef.current) return;
      viewer = new skinview.SkinViewer({
        canvas: canvasRef.current,
        width,
        height,
        skin: skinUrl,
        background: 0x050505,
      });
      viewerRef.current = viewer;

      // Camera placement — face the back of the player so the cape leads.
      // skinview3d's PlayerObject is positioned at origin facing +Z; the
      // default camera sits at (0, 0, 70) on +Z. Rotating the *player*
      // by π puts its back to camera, which is what we want for cape
      // previews. Side and front views just leave the rotation alone or
      // shift it 90°.
      const yaw = view === 'back' ? Math.PI : view === 'side' ? Math.PI / 2 : 0;
      viewer.playerObject.rotation.y = yaw;

      // Disable orbit controls — the autorotate gives all the motion we
      // need and the canvas otherwise traps scroll on mobile.
      viewer.controls.enableZoom = false;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = false;

      if (rotate) {
        // Idle rotation — slow yaw drift around the player.
        const step = () => {
          if (!viewer) return;
          viewer.playerObject.rotation.y += 0.004;
          rotationRef.current = requestAnimationFrame(step);
        };
        rotationRef.current = requestAnimationFrame(step);
      }
    })();

    return () => {
      cancelled = true;
      if (rotationRef.current !== null) cancelAnimationFrame(rotationRef.current);
      rotationRef.current = null;
      if (viewer) {
        viewer.dispose();
      }
      viewerRef.current = null;
    };
    // Width / height changes recreate the viewer (rare in our use).
  }, [skinUrl, width, height, rotate, view]);

  // Cape changes — push to the existing viewer without recreating it.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (capeUrl) {
      viewer.loadCape(capeUrl).catch(() => {
        // Bad URL / non-PNG — leave cape unset so the body still renders.
      });
    } else {
      viewer.resetCape();
    }
  }, [capeUrl]);

  return (
    <div className="inline-flex flex-col gap-2">
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {label}
        </p>
      )}
      <div
        className="border border-[var(--rule)] bg-[var(--bg-sink)]"
        style={{ width, height }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
