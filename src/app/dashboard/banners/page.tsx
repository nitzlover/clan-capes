'use client';

import { BannerSection } from '@/components/BannerSection';

/**
 * Banners route.
 *
 * Hosts the per-clan shield editor. BannerSection lists every clan and
 * lets each one be expanded in-place to its full pattern editor, NBT
 * import/export, and image→banner converter. This page is just the
 * brutalist shell around it — title band on top, the section below.
 */
export default function BannersPage() {
  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Banners</h1>
          <p className="page-subtitle">
            Paint a vanilla-style shield crest per clan. Up to six pattern layers.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            shield
          </span>
          6 layers / clan
        </span>
      </div>

      <section className="brutal-card p-8">
        <BannerSection />
      </section>
    </div>
  );
}
