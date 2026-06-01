'use client';

/**
 * /login-preview/v9 — the campfire situation (now the live /login).
 *
 * Kept as a reference preview of the shipped login. Scene data + shell live in
 * ../scenes + ../DioramaLogin.
 */

import { DioramaLogin } from '../DioramaLogin';
import { campfireScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function LoginV9() {
  return (
    <DioramaLogin
      members={MEMBERS}
      buildScene={campfireScene}
      fallbackSkin={FALLBACK_SKIN}
      loadingLabel="lighting the fire…"
    />
  );
}
