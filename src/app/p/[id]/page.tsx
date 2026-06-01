'use client';

/**
 * /p/[id] — the pose RENDER page (mcrender's `/p/<slug>`).
 *
 * Same 3D engine + canvas + toolbar as /studio, but the right panel is the
 * render-customisation surface (scene / camera / other + effects + download)
 * instead of the pose library. The character authored in /studio is carried
 * here via sessionStorage and restored once the engine boots.
 *
 * Shares the StudioShell component with /studio (mode='render'). The route is
 * gitignored alongside /studio — it imports the gitignored shell, so it must
 * stay out of the prod build too.
 */

import { StudioShell } from '@/app/studio/StudioShell';

export default function PoseRenderPage() {
  return <StudioShell mode="render" />;
}
