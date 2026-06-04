'use client';
import { DioramaLogin } from '../DioramaLogin';
import { perchScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewPerch() {
  return <DioramaLogin members={MEMBERS} buildScene={perchScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="taking the high ground…" />;
}
