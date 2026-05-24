'use client';

import { useEffect, useRef, useState } from 'react';
import type { SkinViewer as SkinViewerType } from 'skinview3d';

type BackEquipment = 'cape' | 'elytra';
type StanceMode = 'stand' | 'fly';

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
  /** Show the Cape/Elytra + Stand/Fly overlay toggles. */
  showControls?: boolean;
};

const DEFAULT_SKIN = '/skins/steve.png';

/**
 * 3D Minecraft player viewer powered by skinview3d, modelled on the
 * skinmc.net cape-page viewer: same back-by-default framing, same
 * Cape/Elytra + Stand/Fly toggles overlaid in the top-right.
 *
 * The two toggles drive skinview3d directly:
 *   - back equipment toggle calls `loadCape(url, { backEquipment })`
 *     so the same cape texture either drapes as a cape or fans out as
 *     elytra wings.
 *   - stance toggle swaps `viewer.animation` between `IdleAnimation`
 *     (stand) and `FlyingAnimation` (fly) — flying tilts the body
 *     horizontal and spreads the elytra, which is the natural pairing.
 *
 * Both controls only appear when `showControls` is on; small thumbnails
 * keep the canvas clean.
 */
export function PlayerCapeView3D({
  capeUrl,
  skinUrl = DEFAULT_SKIN,
  width = 200,
  height = 280,
  rotate = false,
  label,
  view = 'back',
  showControls = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewerType | null>(null);
  const rotationRef = useRef<number | null>(null);
  const skinviewModRef = useRef<typeof import('skinview3d') | null>(null);

  const [backEquipment, setBackEquipment] = useState<BackEquipment>('cape');
  const [stance, setStance] = useState<StanceMode>('stand');

  // Construct the viewer once and tear it down on unmount.
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    let viewer: SkinViewerType | null = null;

    (async () => {
      const skinview = await import('skinview3d');
      if (cancelled || !canvasRef.current) return;
      skinviewModRef.current = skinview;
      viewer = new skinview.SkinViewer({
        canvas: canvasRef.current,
        width,
        height,
        skin: skinUrl,
        background: 0x050505,
      });
      viewerRef.current = viewer;

      const yaw = view === 'back' ? Math.PI : view === 'side' ? Math.PI / 2 : 0;
      viewer.playerObject.rotation.y = yaw;

      viewer.controls.enableZoom = false;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = false;

      // Initial stance.
      viewer.animation = new skinview.IdleAnimation();

      if (rotate) {
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
      skinviewModRef.current = null;
    };
  }, [skinUrl, width, height, rotate, view]);

  // Cape changes — push to the existing viewer without recreating it.
  // Re-applies when backEquipment changes so the same cape texture can
  // be displayed as either cape or elytra on demand.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (capeUrl) {
      viewer.loadCape(capeUrl, { backEquipment }).catch(() => {
        // Bad URL / non-PNG — leave cape unset so the body still renders.
      });
    } else {
      viewer.resetCape();
    }
  }, [capeUrl, backEquipment]);

  // Stance — IdleAnimation for stand, FlyingAnimation for fly.
  useEffect(() => {
    const viewer = viewerRef.current;
    const skinview = skinviewModRef.current;
    if (!viewer || !skinview) return;
    viewer.animation = stance === 'fly'
      ? new skinview.FlyingAnimation()
      : new skinview.IdleAnimation();
  }, [stance]);

  return (
    <div className="inline-flex flex-col gap-2">
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {label}
        </p>
      )}
      <div
        className="relative border border-[var(--rule)] bg-[var(--bg-sink)]"
        style={{ width, height }}
      >
        <canvas ref={canvasRef} />

        {showControls && (
          <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-2">
            <ToggleGroup
              value={backEquipment}
              onChange={(v) => setBackEquipment(v as BackEquipment)}
              options={[
                { value: 'cape', label: 'Cape' },
                { value: 'elytra', label: 'Elytra' },
              ]}
            />
            <ToggleGroup
              value={stance}
              onChange={(v) => setStance(v as StanceMode)}
              options={[
                { value: 'stand', label: 'Stand' },
                { value: 'fly', label: 'Fly' },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Two-segment pill toggle, monochrome, sized to sit on top of the WebGL
 * canvas without competing with the player. Pointer-events: auto is
 * re-enabled here even though the container disables them — the rest of
 * the overlay shouldn't catch mouse drags from OrbitControls.
 */
function ToggleGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="pointer-events-auto inline-flex border border-[var(--rule-strong)] bg-black/65 backdrop-blur-sm">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
              active
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
