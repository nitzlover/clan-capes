'use client';
import { DioramaLogin } from '../DioramaLogin';
import { throneScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewThrone() {
  return <DioramaLogin members={MEMBERS} buildScene={throneScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="taking the throne…" />;
}
