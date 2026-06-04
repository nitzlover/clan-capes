'use client';

import { useEffect, useMemo, useState } from 'react';
import { MinecraftScene } from '@/app/login-preview/v9/MinecraftScene';
import { duelScene, MEMBERS, FALLBACK_SKIN } from '@/app/login-preview/scenes';

/**
 * The /download hero diorama — the SAME staged MinecraftScene engine that
 * backs the live /login, running the "Duel" situation: two clan members
 * squared off mid-fight in a stone ring (twoSwords vs battleReady), a creeper
 * watching from the side. Replaces the old single rotating model (which read
 * as cringe) with a living scene — "something is happening" on the right while
 * the download sits on the left.
 *
 * Skins resolve from the clan roster through the public /api/skin proxy with a
 * per-member Steve fallback, exactly like the login. Heavy (three.js + the
 * gltf rig) — always mount via next/dynamic({ ssr:false }).
 */
export default function DownloadDiorama({ className }: { className?: string }) {
  const [skins, setSkins] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const resolved = await Promise.all(
        MEMBERS.map(async (nick) => {
          try {
            const r = await fetch(`/api/skin/${encodeURIComponent(nick)}`);
            const d = (await r.json()) as { ok?: boolean; dataUrl?: string };
            return d.ok && d.dataUrl ? d.dataUrl : FALLBACK_SKIN;
          } catch {
            return FALLBACK_SKIN;
          }
        }),
      );
      if (alive) setSkins(resolved);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const scene = useMemo(() => (skins ? duelScene(skins) : null), [skins]);

  if (!scene) {
    return (
      <div className={className}>
        <div className="grid h-full w-full place-items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
            staging the fight…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <MinecraftScene scene={scene} className="h-full w-full" />
    </div>
  );
}
