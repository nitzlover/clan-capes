'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchClanBanner,
  fetchClanOptions,
  saveClanBanner,
  deleteClanBanner,
  type ClanBannerDto,
  type ClanOption,
} from '@/lib/api';
import { BannerEditor } from '@/components/BannerEditor';
import { BannerPreview } from '@/components/BannerPreview';
import { EMPTY_SPEC, type BannerSpec } from '@/lib/banners';

/**
 * Lists every PowerClans clan and lets the admin set a shield banner for
 * each. The editor opens inline below the clan row so we can show the live
 * preview right next to the controls.
 *
 * One network round trip per clan to fetch its current banner (parallelised
 * with Promise.all), then incremental updates as the admin saves.
 */
export function BannerSection() {
  const [clans, setClans] = useState<ClanOption[]>([]);
  const [banners, setBanners] = useState<Record<string, ClanBannerDto | null>>({});
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const { clans } = await fetchClanOptions();
      setClans(clans);
      const tags = clans.map((c) => c.tag);
      const entries = await Promise.all(
        tags.map(async (t) => [t, await fetchClanBanner(t).catch(() => null)] as const)
      );
      setBanners(Object.fromEntries(entries));
      setLoadState('ok');
    } catch (e) {
      setLoadState('error');
      setLoadError(e instanceof Error ? e.message : 'Failed to load clans');
      setClans([]);
      setBanners({});
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function save(tag: string, spec: BannerSpec) {
    setBusyTag(tag);
    setEditorError(null);
    try {
      const dto = await saveClanBanner(tag, spec.baseColor, spec.patterns);
      setBanners((b) => ({ ...b, [tag]: dto }));
      setOpenTag(null);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusyTag(null);
    }
  }

  async function remove(tag: string) {
    if (!confirm(`Remove banner for ${tag}?`)) return;
    setBusyTag(tag);
    setEditorError(null);
    try {
      await deleteClanBanner(tag);
      setBanners((b) => ({ ...b, [tag]: null }));
      setOpenTag(null);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyTag(null);
    }
  }

  return (
    <section className="mb-10 rounded-2xl border border-white/10 bg-panel p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Clan shield banners</h2>
          <p className="text-xs text-muted">
            Apply a banner to every clan member&apos;s held shield. Updates live.
          </p>
        </div>
        {loadState === 'loading' && (
          <span className="text-xs text-muted">Loading…</span>
        )}
        {loadState === 'error' && (
          <span className="text-xs text-red-300">{loadError}</span>
        )}
      </header>

      {clans.length === 0 && loadState === 'ok' && (
        <p className="text-sm text-muted">No clans in PowerClans data.yml.</p>
      )}

      <ul className="space-y-3">
        {clans.map((c) => {
          const banner = banners[c.tag] ?? null;
          const spec: BannerSpec = banner
            ? { baseColor: banner.baseColor, patterns: banner.patterns }
            : EMPTY_SPEC;
          const isOpen = openTag === c.tag;
          return (
            <li
              key={c.tag}
              className="rounded-xl border border-white/10 bg-black/30 p-3"
            >
              <div className="flex flex-wrap items-center gap-4">
                <BannerPreview spec={spec} width={50} framed={false} shape="shield" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-base font-bold text-accent">{c.tag}</div>
                  <div className="text-xs text-muted">
                    {banner
                      ? `${banner.patterns.length} layer${banner.patterns.length === 1 ? '' : 's'} · saved ${new Date(banner.updatedAt).toLocaleString()}`
                      : 'No banner yet — defaults to vanilla shield.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditorError(null);
                    setOpenTag(isOpen ? null : c.tag);
                  }}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/80 hover:text-white"
                >
                  {isOpen ? 'close' : banner ? 'edit' : 'set'}
                </button>
              </div>
              {isOpen && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <BannerEditor
                    initial={spec}
                    onSave={(s) => save(c.tag, s)}
                    onRemove={banner ? () => remove(c.tag) : undefined}
                    busy={busyTag === c.tag}
                    error={editorError}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
