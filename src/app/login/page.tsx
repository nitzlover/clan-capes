'use client';

/**
 * Login — the live operator gate.
 *
 * The hero is the staged Minecraft diorama (formerly previewed at
 * /login-preview/v9): the clan seated around a campfire, pure B&W, form on the
 * right. Scene data + the shell live in ../login-preview so the live login and
 * the previews can never drift apart.
 */

import { DioramaLogin } from '../login-preview/DioramaLogin';
import { campfireScene, MEMBERS, FALLBACK_SKIN } from '../login-preview/scenes';

export default function LoginPage() {
  return (
    <DioramaLogin
      members={MEMBERS}
      buildScene={campfireScene}
      fallbackSkin={FALLBACK_SKIN}
      loadingLabel="lighting the fire…"
      redirectIfAuthed
    />
  );
}
