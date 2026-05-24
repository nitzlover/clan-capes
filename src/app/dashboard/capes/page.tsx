'use client';

import { useCallback, useEffect, useState } from 'react';
import { UploadSection } from '@/components/UploadSection';
import { PlayerCapeView3D } from '@/components/PlayerCapeView3D';
import { api, type ClanRow, getToken, UnauthorizedError } from '@/lib/api';

/**
 * Capes route.
 *
 * Top half: PNG upload form (drag-target file input + clan dropdown,
 * texture preview + 3D player view on the right).
 * Bottom half: roster table — every clan currently registered, the cape
 * texture URL that's live for it, and a delete control. Same data and
 * actions as the old single-page dashboard had; just split out from the
 * other surfaces.
 */
export default function CapesPage() {
  const [clans, setClans] = useState<ClanRow[]>([]);
  const [tag, setTag] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [optionsRefresh, setOptionsRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const c = await api<{ clans: ClanRow[] }>('/panel/clans');
      setClans(c.clans);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setClans([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function uploadPng(e: React.FormEvent) {
    e.preventDefault();
    if (!tag || !file) return;
    setMessage('');
    const fd = new FormData();
    fd.append('cape', file);
    const token = getToken();
    const res = await fetch(`/api/panel/clans/${tag.toUpperCase()}/cape`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage((err as { error?: string }).error ?? 'Upload failed');
      return;
    }
    setMessage('PNG cape uploaded');
    setTag('');
    setFile(null);
    setOptionsRefresh((n) => n + 1);
    load();
  }

  async function removeCape(clanTag: string) {
    if (!confirm(`Remove cape for ${clanTag}?`)) return;
    await api(`/panel/clans/${clanTag}/cape`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Capes</h1>
          <p className="page-subtitle">
            Upload a 64×32 (or 128×64) PNG and pin it to a clan tag.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            groups
          </span>
          {clans.length} clans
        </span>
      </div>

      <section className="brutal-card p-8">
        <UploadSection
          tag={tag}
          onTagChange={setTag}
          file={file}
          onFileChange={setFile}
          pngPreview={preview}
          onPngUpload={uploadPng}
          message={message}
          optionsRefresh={optionsRefresh}
        />
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between border-b-2 border-[var(--rule-strong)] pb-3">
          <h2 className="font-sans text-2xl font-extrabold uppercase tracking-tight text-white">
            Roster
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {clans.filter((c) => c.capeUrl).length} of {clans.length} with cape
          </span>
        </div>
        {loading ? (
          <p className="py-6 text-sm text-[var(--text-mute)]">Loading…</p>
        ) : clans.length === 0 ? (
          <p className="py-6 text-sm text-[var(--text-mute)]">
            No clans with capes yet.
          </p>
        ) : (
          <ul>
            {clans.map((c) => (
              <li
                key={c.tag}
                className="grid grid-cols-[110px_1fr_auto] items-center gap-6 border-b border-[var(--rule)] py-5 transition-colors hover:bg-white/[0.02]"
              >
                <PlayerCapeView3D
                  capeUrl={c.capeUrl}
                  width={100}
                  height={150}
                  view="back"
                />
                <div className="min-w-0">
                  <div className="font-sans text-lg font-extrabold uppercase tracking-wider text-white">
                    {c.tag}
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    {c.capeUrl || 'no cape'}
                  </div>
                </div>
                <button onClick={() => removeCape(c.tag)} className="btn-danger-link">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
