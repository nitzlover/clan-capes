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
    <div>
      {loadState === 'loading' && (
        <p className="py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-mute)]">
          Loading clans…
        </p>
      )}
      {loadState === 'error' && (
        <p className="py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white">
          ! {loadError}
        </p>
      )}
      {clans.length === 0 && loadState === 'ok' && (
        <p className="py-6 text-sm text-[var(--text-mute)]">
          No clans in PowerClans data.yml.
        </p>
      )}

      <ul>
        {clans.map((c) => {
          const banner = banners[c.tag] ?? null;
          const spec: BannerSpec = banner
            ? { baseColor: banner.baseColor, patterns: banner.patterns }
            : EMPTY_SPEC;
          const isOpen = openTag === c.tag;
          return (
            <li
              key={c.tag}
              className="border-t border-[var(--rule)] first:border-t-0"
            >
              <div className="grid grid-cols-[64px_1fr_auto] items-center gap-6 py-5 transition-colors hover:bg-white/[0.02]">
                <BannerPreview spec={spec} width={50} framed={false} shape="shield" />
                <div className="min-w-0">
                  <div className="font-mono text-base font-semibold tracking-wider text-white">
                    {c.tag}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                    {banner
                      ? `${banner.patterns.length} layer${banner.patterns.length === 1 ? '' : 's'} · ${new Date(banner.updatedAt).toLocaleString()}`
                      : 'no banner — vanilla shield'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditorError(null);
                    setOpenTag(isOpen ? null : c.tag);
                  }}
                  className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline"
                >
                  {isOpen ? 'close' : banner ? 'edit' : 'set'}
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-[var(--rule)] py-6">
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
    </div>
  );
}
