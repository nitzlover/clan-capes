'use client';

/**
 * Preview 2 — "The Quarry".
 *
 * A stone pit at night: tall cobblestone wall, stepped ledges, ore glowing in
 * the rock, stone ground. The clan stands working it. A non-campfire situation
 * staged on the same diorama engine.
 */

import { DioramaLogin } from '../DioramaLogin';
import { quarryScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewQuarry() {
  return (
    <DioramaLogin
      members={MEMBERS}
      buildScene={quarryScene}
      fallbackSkin={FALLBACK_SKIN}
      loadingLabel="cutting the stone…"
    />
  );
}
