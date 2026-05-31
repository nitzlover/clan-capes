'use client';

import { useCallback, useEffect, useState } from 'react';
import { UploadSection } from '@/components/UploadSection';
import { PlayerCapeView3D } from '@/components/PlayerCapeView3D';
import { SelectServerPrompt } from '@/components/ServerPicker';
import { api, type ClanRow, getToken, UnauthorizedError } from '@/lib/api';
import { useSelectedServer, serverQueryString } from '@/lib/selected-server';

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
  const { value: serverId } = useSelectedServer();
  const [clans, setClans] = useState<ClanRow[]>([]);
  const [tag, setTag] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [optionsRefresh, setOptionsRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (serverId === null || serverId === 'all') {
      setClans([]);
      setLoading(false);
      return;
    }
    try {
      const c = await api<{ clans: ClanRow[] }>(
        `/panel/clans${serverQueryString(serverId)}`,
      );
      setClans(c.clans);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setClans([]);
    }
    setLoading(false);
  }, [serverId]);

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
    if (serverId === null || serverId === 'all') {
      setMessage('Pick a single server before uploading a cape.');
      return;
    }
    setMessage('');
    const fd = new FormData();
    fd.append('cape', file);
    const token = getToken();
    const res = await fetch(
      `/api/panel/clans/${tag.toUpperCase()}/cape${serverQueryString(serverId)}`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      },
    );
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
    if (serverId === null || serverId === 'all') {
      setMessage('Pick a single server to remove a cape.');
      return;
    }
    if (!confirm(`Remove cape for ${clanTag}?`)) return;
    await api(`/panel/clans/${clanTag}/cape${serverQueryString(serverId)}`, {
      method: 'DELETE',
    });
    load();
  }

  // No-selection / aggregate empty-state — show the prompt instead of
  // the upload form so the operator can't accidentally target the
  // wrong server (audit H3).
  if (serverId === null || serverId === 'all') {
    return (
      <div>
        <div className="page-band">
          <div>
            <h1 className="page-title">Capes</h1>
            <p className="page-subtitle">
              Upload a 64×32 (or 128×64) PNG and pin it to a clan tag.
            </p>
          </div>
        </div>
        <SelectServerPrompt>
          <p className="text-sm text-[var(--text-faint)]">
            Cape uploads are server-scoped — the clan tag namespace is
            per-server, so this page needs you to pick one.
          </p>
        </SelectServerPrompt>
      </div>
    );
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

      <UploadSection
        tag={tag}
        onTagChange={setTag}
        file={file}
        onFileChange={setFile}
        pngPreview={preview}
        onPngUpload={uploadPng}
        message={message}
        optionsRefresh={optionsRefresh}
        serverId={typeof serverId === 'number' ? serverId : null}
      />

      <section className="mt-14">
        <div className="mb-5 flex items-end justify-between border-b-2 border-[var(--rule-strong)] pb-3">
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
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clans.map((c) => (
              <li
                key={c.tag}
                className="brutal-card flex items-start gap-5 p-5"
              >
                <PlayerCapeView3D
                  capeUrl={c.capeUrl}
                  width={110}
                  height={160}
                  view="back"
                  zoom={0.7}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-sans text-lg font-extrabold uppercase tracking-wider text-white">
                    {c.tag}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    {c.capeUrl ? c.capeUrl.split('/').pop() : 'no cape'}
                  </div>
                  <button
                    onClick={() => removeCape(c.tag)}
                    className="mt-4 border border-[var(--rule-strong)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)] transition-colors hover:border-white hover:bg-white hover:text-black"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
