'use client';
import { DioramaLogin } from '../DioramaLogin';
import { councilScene, MEMBERS, FALLBACK_SKIN } from '../scenes';

export default function PreviewCouncil() {
  return <DioramaLogin members={MEMBERS} buildScene={councilScene} fallbackSkin={FALLBACK_SKIN} loadingLabel="gathering the council…" />;
}
