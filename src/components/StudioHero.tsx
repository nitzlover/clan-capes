'use client';

import { useEffect, useRef } from 'react';
import {
  bootViewer,
  FALLBACK_SKIN,
  PRESETS,
  type StudioApi,
  type ArmorSlots,
  type PoseState,
} from '@/app/studio/StudioShell';

/**
 * Static armored hero for the /download page, rendered with the FULL
 * studio engine (the mcrender gltf rig — armor, cape, pose, Minecraftia
 * nametag) rather than skinview3d, which can't do armor. No auto-rotate:
 * a fixed confident 3/4 stance with a floating PLACEHOLDER nametag, on a
 * background that matches the page so the character reads as a cut-out.
 * The visitor can still drag to rotate.
 *
 * Heavy (three.js + post-FX) — always mount via next/dynamic({ssr:false})
 * so it stays out of the initial bundle and only loads client-side.
 */

const HERO_ARMOR: ArmorSlots = {
  helmet: 'diamond',
  chestplate: 'diamond',
  leggings: 'diamond',
  boots: 'diamond',
};

// Confident 3/4 stance — slider deltas (degrees) layered on Standing.
const HERO_POSE: PoseState = {
  ...PRESETS.Standing,
  Head: { x: -3, y: 17, z: 0 },
  ArmRightUpper: { x: -11, y: 0, z: 7 },
  ArmRightLower: { x: -14, y: 0, z: 0 },
  ArmLeftUpper: { x: 7, y: 0, z: -7 },
  LegRightUpper: { x: -13, y: 0, z: 2 },
  LegLeftUpper: { x: 13, y: 0, z: -2 },
};

export default function StudioHero({ capeUrl }: { capeUrl?: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<StudioApi | null>(null);
  const capeRef = useRef(capeUrl);
  capeRef.current = capeUrl;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const api = await bootViewer(mount, () => disposed);
      if (disposed || !api) return;
      apiRef.current = api;
      cleanup = api.dispose;

      await api.setSkin(FALLBACK_SKIN);
      api.setSceneBg('#0a0a0a'); // matches --bg so the model reads as a cut-out
      api.setPose(HERO_POSE);
      api.setNametag(true, 'PLACEHOLDER');
      await api.setArmor(HERO_ARMOR);
      api.setCape(capeRef.current ?? '/capes/cobalt.png');
      api.setCamera('isometric');
    })();

    return () => {
      disposed = true;
      apiRef.current = null;
      cleanup?.();
    };
  }, []); // boot once

  // Live cape swap from the swatch picker.
  useEffect(() => {
    apiRef.current?.setCape(capeUrl ?? '/capes/cobalt.png');
  }, [capeUrl]);

  return <div ref={mountRef} className="h-full w-full" />;
}
