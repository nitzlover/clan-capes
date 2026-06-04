'use client';

/**
 * Preview 3 — "The Beacon".
 *
 * The unique situation: a pillar of beacon light punches straight up into the
 * starry night while the clan gathers at the foot of a stepped stone base, the
 * beacon block glowing at its apex. No fire — the focal is a vertical shaft of
 * light. Staged on the same diorama engine.
 */

import { DioramaLogin } from '../DioramaLogin';
import { beaconScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewBeacon() {
  return (
    <DioramaLogin
      members={MEMBERS}
      buildScene={beaconScene}
      fallbackSkin={FALLBACK_SKIN}
      loadingLabel="raising the beacon…"
    />
  );
}
