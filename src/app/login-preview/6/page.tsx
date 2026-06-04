'use client';
import { DioramaLogin } from '../DioramaLogin';
import { duelScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewDuel() {
  return <DioramaLogin members={MEMBERS} buildScene={duelScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="drawing steel…" />;
}
