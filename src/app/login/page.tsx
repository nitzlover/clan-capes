'use client';

/**
 * Login — the live operator gate.
 *
 * Full-bleed character-free "Gate" diorama: a gold beacon beam piercing the
 * night sky off-centre, moonlit treeline, ground mist — with the sign-in form
 * floating over it as a centered glass card. Scene data + shell live in
 * ../login-preview so the live login and the previews can never drift apart.
 */

import { DioramaLogin } from '../login-preview/DioramaLogin';
import { gateScene } from '../login-preview/scenes';

export default function LoginPage() {
  return (
    <DioramaLogin
      members={[]}
      buildScene={gateScene}
      loadingLabel="raising the beacon…"
      redirectIfAuthed
    />
  );
}
