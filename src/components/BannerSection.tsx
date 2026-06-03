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
import { SelectServerPrompt } from '@/components/ServerPicker';
import { EMPTY_SPEC, type BannerSpec } from '@/lib/banners';
import { useSelectedServer } from '@/lib/selected-server';
import { SkeletonRows } from '@/components/Skeleton';

/**
 * Lists every PowerClans clan and lets the admin set a shield banner for
 * each. The editor opens inline below the clan row so we can show the live
 * preview right next to the controls.
 *
 * One network round trip per clan to fetch its current banner (parallelised
 * with Promise.all), then incremental updates as the admin saves.
 */
export function BannerSection() {
  const { value: serverId } = useSelectedServer();
  const scopeId = typeof serverId === 'number' ? serverId : null;
  const [clans, setClans] = useState<ClanOption[]>([]);
  const [banners, setBanners] = useState<Record<string, ClanBannerDto | null>>({});
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (scopeId === null) {
      setLoadState('ok');
      setClans([]);
      setBanners({});
      return;
    }
    setLoadState('loading');
    setLoadError('');
    try {
      const { clans } = await fetchClanOptions(scopeId);
      setClans(clans);
      const tags = clans.map((c) => c.tag);
      const entries = await Promise.all(
        tags.map(async (t) => [t, await fetchClanBanner(t, scopeId).catch(() => null)] as const)
      );
      setBanners(Object.fromEntries(entries));
      setLoadState('ok');
    } catch (e) {
      setLoadState('error');
      setLoadError(e instanceof Error ? e.message : 'Failed to load clans');
      setClans([]);
      setBanners({});
    }
  }, [scopeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function save(tag: string, spec: BannerSpec) {
    if (scopeId === null) return;
    setBusyTag(tag);
    setEditorError(null);
    try {
      const dto = await saveClanBanner(tag, spec.baseColor, spec.patterns, scopeId);
      setBanners((b) => ({ ...b, [tag]: dto }));
      setOpenTag(null);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusyTag(null);
    }
  }

  async function remove(tag: string) {
    if (scopeId === null) return;
    if (!confirm(`Remove banner for ${tag}?`)) return;
    setBusyTag(tag);
    setEditorError(null);
    try {
      await deleteClanBanner(tag, scopeId);
      setBanners((b) => ({ ...b, [tag]: null }));
      setOpenTag(null);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyTag(null);
    }
  }

  if (scopeId === null) {
    return (
      <SelectServerPrompt>
        <p className="text-sm text-[var(--text-faint)]">
          Banner specs are per-server. Pick one above to load the editor.
        </p>
      </SelectServerPrompt>
    );
  }

  return (
    <div>
      {loadState === 'loading' && (
        <div className="py-2">
          <SkeletonRows rows={5} />
        </div>
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

      <ul className="flex flex-col gap-3">
        {clans.map((c) => {
          const banner = banners[c.tag] ?? null;
          const spec: BannerSpec = banner
            ? { baseColor: banner.baseColor, patterns: banner.patterns }
            : EMPTY_SPEC;
          const isOpen = openTag === c.tag;
          return (
            <li
              key={c.tag}
              className="border-2 border-[var(--rule)] transition-colors"
            >
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-5 px-5 py-4 hover:bg-white/[0.02]">
                <BannerPreview spec={spec} width={50} framed={false} shape="shield" />
                <div className="min-w-0">
                  <div className="font-sans text-base font-extrabold uppercase tracking-wider text-white">
                    {c.tag}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
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
                  className={`shrink-0 border-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${
                    isOpen
                      ? 'border-white bg-white text-black'
                      : 'border-[var(--rule-strong)] text-[var(--text-soft)] hover:border-white hover:bg-white hover:text-black'
                  }`}
                >
                  {isOpen ? 'Close' : banner ? 'Edit' : 'Set'}
                </button>
              </div>
              {isOpen && (
                <div className="overflow-x-auto border-t-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-5 py-6">
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
