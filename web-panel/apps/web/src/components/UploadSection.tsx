'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CapePreview } from '@/components/CapePreview';
import { fetchClanOptions, type ClanOption } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base';

const TEMPLATE_URL = `${getApiBaseUrl()}/static/templates/template_64x32.png`;

type Props = {
  tag: string;
  onTagChange: (tag: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  pngPreview: string | null;
  onPngUpload: (e: FormEvent) => void;
  message: string;
  /** Increment to reload PowerClans list (e.g. after upload). */
  optionsRefresh?: number;
};

export function UploadSection({
  tag,
  onTagChange,
  file,
  onFileChange,
  pngPreview,
  onPngUpload,
  message,
  optionsRefresh = 0,
}: Props) {
  const [clanOptions, setClanOptions] = useState<ClanOption[]>([]);
  const [optionsStatus, setOptionsStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [optionsError, setOptionsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOptionsStatus('loading');
      setOptionsError('');
      try {
        const res = await fetchClanOptions();
        if (cancelled) return;
        setClanOptions(res.clans);
        setOptionsStatus('ok');
      } catch (e) {
        if (cancelled) return;
        setOptionsStatus('error');
        setOptionsError(e instanceof Error ? e.message : 'Failed to load clans');
        setClanOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optionsRefresh]);

  function formatOptionLabel(c: ClanOption) {
    const cape = c.hasCape ? ' · cape set' : '';
    return `${c.tag} — ${c.id}${cape}`;
  }

  return (
    <section className="mb-10 rounded-2xl border border-white/10 bg-panel p-6">
      <h2 className="mb-4 font-semibold">Upload clan cape (PNG)</h2>

      <div className="mb-6 rounded-xl border border-white/10 bg-surface/50 p-4 text-sm">
        <h3 className="mb-2 font-medium text-white/90">For clans (before upload)</h3>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>
            Use a ready-made <strong className="text-white/80">64×32</strong> PNG (or 128×64) in the
            Minecraft cape UV layout.
          </li>
          <li>
            Download the blank template:{' '}
            <a
              href={TEMPLATE_URL}
              className="text-accent hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              template_64x32.png
            </a>
          </li>
          <li>
            Create or export elsewhere (e.g. SkinMC, MinecraftCapes) and send the PNG to the server
            admin.
          </li>
        </ul>
      </div>

      <label className="mb-4 block text-sm">
        Clan (from PowerClans)
        {optionsStatus === 'loading' && (
          <span className="ml-2 text-xs text-muted">Loading…</span>
        )}
        {optionsStatus === 'error' && (
          <p className="mt-1 text-xs text-red-400">{optionsError}</p>
        )}
        <select
          value={tag}
          onChange={(e) => onTagChange(e.target.value)}
          disabled={optionsStatus !== 'ok' || clanOptions.length === 0}
          className="mt-1 w-full max-w-md rounded-lg border border-white/10 bg-surface px-3 py-2 disabled:opacity-50"
        >
          <option value="">Select clan tag…</option>
          {clanOptions.map((c) => (
            <option key={c.id} value={c.tag}>
              {formatOptionLabel(c)}
            </option>
          ))}
        </select>
        {optionsStatus === 'ok' && clanOptions.length === 0 && (
          <p className="mt-1 text-xs text-amber-300">No clans in PowerClans data.yml on the server.</p>
        )}
      </label>

      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={onPngUpload} className="space-y-4">
          <p className="text-xs text-muted">PNG only — 64×32 or 128×64</p>
          <input
            type="file"
            accept="image/png"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-muted"
            required
          />
          <button
            type="submit"
            disabled={!file || !tag.trim() || optionsStatus !== 'ok'}
            className="rounded-lg bg-accent px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            Upload PNG
          </button>
        </form>
        <div>
          <CapePreview
            url={pngPreview}
            scale={6}
            width={64}
            height={32}
            fit="fill"
            label="Preview (64×32)"
          />
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-amber-300">{message}</p>}
    </section>
  );
}
