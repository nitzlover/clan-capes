'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CapePreview } from '@/components/CapePreview';
import { PlayerCapeView3D } from '@/components/PlayerCapeView3D';
import { fetchClanOptions, type ClanOption } from '@/lib/api';

const TEMPLATE_URL = '/templates/template_64x32.png';

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

/**
 * Cape upload — monochrome modern.
 *
 * Single split row: form controls on the left, preview stack on the right.
 * No card shell; the parent chapter already provides the rule + headline.
 * Drag-target the file input via a custom label so the visual hierarchy
 * is preserved (browsers ship hideous default file inputs).
 */
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

  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
      <form onSubmit={onPngUpload} className="space-y-6">
        <div>
          <label htmlFor="upload-clan" className="label-mono mb-2 block">
            Clan
          </label>
          <select
            id="upload-clan"
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            disabled={optionsStatus !== 'ok' || clanOptions.length === 0}
            className="input disabled:opacity-50"
          >
            <option value="">Select clan tag…</option>
            {clanOptions.map((c) => (
              <option key={c.id} value={c.tag}>
                {c.tag} — {c.id}
                {c.hasCape ? ' · cape set' : ''}
              </option>
            ))}
          </select>
          {optionsStatus === 'loading' && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              Loading clans…
            </p>
          )}
          {optionsStatus === 'error' && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white">
              ! {optionsError}
            </p>
          )}
          {optionsStatus === 'ok' && clanOptions.length === 0 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-mute)]">
              No clans in PowerClans data.yml.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="upload-file" className="label-mono mb-2 block">
            PNG file
          </label>
          <label
            htmlFor="upload-file"
            className="block cursor-pointer border border-[var(--rule)] px-4 py-3 text-sm text-[var(--text-mute)] transition-colors hover:border-[var(--rule-strong)] hover:text-white"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]">
              {file ? file.name : 'choose 64×32 (or 128×64) PNG…'}
            </span>
          </label>
          <input
            id="upload-file"
            type="file"
            accept="image/png"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="sr-only"
            required
          />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
            Template ·{' '}
            <a
              href={TEMPLATE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline"
            >
              template_64x32.png
            </a>
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || !tag.trim() || optionsStatus !== 'ok'}
          className="btn-primary"
        >
          Upload cape
        </button>

        {message && (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white">
            {message}
          </p>
        )}
      </form>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto]">
        <PlayerCapeView3D
          capeUrl={pngPreview}
          width={220}
          height={300}
          label="On player"
          view="back"
        />
        <CapePreview
          url={pngPreview}
          scale={4}
          width={64}
          height={32}
          fit="fill"
          label="Texture · 64×32"
        />
      </div>
    </div>
  );
}
