'use client';
import { DioramaLogin } from '../DioramaLogin';
import { fallenScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewFallen() {
  return <DioramaLogin members={MEMBERS} buildScene={fallenScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="standing the vigil…" />;
}
