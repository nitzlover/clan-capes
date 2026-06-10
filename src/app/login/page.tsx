'use client';

/**
 * Login — the live operator gate.
 *
 * The backdrop is pre-rendered shader-quality art (a cozy clan lodge at dusk,
 * warm golden lanterns — /public/login-bg.webp) with a slow Ken-Burns drift;
 * the sign-in form floats over it as a glass card, right-of-centre on wide
 * screens. No three.js loads on this page at all — the previous live-engine
 * diorama couldn't reach this visual bar (user refs = BSL-shader builds).
 * The 3D scenes remain available on /login-preview/*.
 */

import { DioramaLogin } from '../login-preview/DioramaLogin';

export default function LoginPage() {
  return <DioramaLogin members={[]} backgroundImage="/login-bg.webp" redirectIfAuthed />;
}
