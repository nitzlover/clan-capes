'use client';

/**
 * Preview 1 — "The Grove".
 *
 * A moonlit forest clearing: the clan standing together among the trees, no
 * fire, the creeper peering from behind a far trunk. A non-campfire situation
 * staged on the same diorama engine.
 */

import { DioramaLogin } from '../DioramaLogin';
import { groveScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewGrove() {
  return (
    <DioramaLogin
      members={MEMBERS}
      buildScene={groveScene}
      fallbackSkin={FALLBACK_SKIN}
      loadingLabel="walking the grove…"
    />
  );
}
