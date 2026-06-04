'use client';
import { DioramaLogin } from '../DioramaLogin';
import { marchScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewMarch() {
  return <DioramaLogin members={MEMBERS} buildScene={marchScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="breaking camp…" />;
}
