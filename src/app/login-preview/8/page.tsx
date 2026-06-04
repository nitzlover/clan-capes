'use client';
import { DioramaLogin } from '../DioramaLogin';
import { forgeScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewForge() {
  return <DioramaLogin members={MEMBERS} buildScene={forgeScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="stoking the forge…" />;
}
