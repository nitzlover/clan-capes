'use client';
import { DioramaLogin } from '../DioramaLogin';
import { stargazeScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewStargaze() {
  return <DioramaLogin members={MEMBERS} buildScene={stargazeScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="counting the stars…" />;
}
