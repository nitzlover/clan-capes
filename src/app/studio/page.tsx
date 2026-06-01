'use client';

/**
 * /studio — Minecraft character studio (mcrender-style), authoring mode.
 *
 * Thin route wrapper: the whole studio lives in the shared <StudioShell>
 * component (see ./StudioShell). This route renders it in mode='create' (pose
 * authoring: the poses panel / new pose / AI studio / library). The /p/[id]
 * route renders the same shell in mode='render' (scene/camera/other + download).
 *
 * StudioShell is a plain module (not a page) so both routes can import it —
 * Next forbids a page.tsx from having arbitrary named exports.
 */

import { StudioShell } from './StudioShell';

export default function StudioPage() {
  return <StudioShell mode="create" />;
}
