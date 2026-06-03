'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, getToken, UnauthorizedError } from '@/lib/api';

type ModLatest = {
  version: string;
  filename: string;
  size: number;
  uploadedAt: string;
} | null;

/**
 * Client-mod distribution. Upload a Fabric jar + its version; it lands on
 * the Railway Volume and becomes what /api/mod/version advertises and
 * /api/mod/download serves. The mod nags players to update on join.
 */
export default function ModPage() {
  const [latest, setLatest] = useState<ModLatest>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api<{ latest: ModLatest }>('/panel/mod');
      setLatest(r.latest);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !version) {
      setMsg('Pick a .jar and enter its version.');
      return;
    }
    setBusy(true);
    setMsg('');
    const fd = new FormData();
    fd.append('jar', file);
    fd.append('version', version.trim());
    const token = getToken();
    const res = await fetch('/api/panel/mod', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      filename?: string;
      size?: number;
    };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Upload failed');
      return;
    }
    setMsg(`Uploaded ${data.filename} — players are nagged to update on join.`);
    setFile(null);
    setVersion('');
    load();
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Client mod</h1>
          <p className="page-subtitle">
            Upload the Fabric jar. Players get an in-game update nag with the
            download link when their version is older.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            extension
          </span>
          {latest ? `v${latest.version} live` : 'none uploaded'}
        </span>
      </div>

      <section className="brutal-card p-6">
        <p className="label-mono mb-4">Current</p>
        {loading ? (
          <p className="text-sm text-[var(--text-mute)]">Loading…</p>
        ) : latest ? (
          <ul className="font-mono text-[12px] leading-relaxed text-[var(--text-soft)]">
            <li>version: <span className="text-white">{latest.version}</span></li>
            <li>file: {latest.filename}</li>
            <li>size: {(latest.size / 1024).toFixed(1)} KB</li>
            <li>uploaded: {new Date(latest.uploadedAt).toLocaleString()}</li>
            <li className="mt-2">
              <a
                href="/api/mod/download"
                className="text-[var(--accent,#7cc)] underline"
              >
                /api/mod/download
              </a>{' '}
              ·{' '}
              <a href="/api/mod/version" className="underline">
                /api/mod/version
              </a>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-faint)]">
            No jar uploaded yet — players can&apos;t auto-download until you upload one.
          </p>
        )}
      </section>

      <section className="brutal-card mt-6 p-6">
        <p className="label-mono mb-4">Upload new jar</p>
        <form onSubmit={upload} className="flex flex-col gap-4">
          <input
            type="file"
            accept=".jar"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-[var(--text-soft)] file:mr-3 file:border file:border-[var(--rule-strong)] file:bg-transparent file:px-3 file:py-1.5 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.18em] file:text-white"
          />
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="version e.g. 1.0.4"
            className="w-48 border border-[var(--rule-strong)] bg-transparent px-3 py-2 font-mono text-sm text-white placeholder:text-[var(--text-faint)]"
          />
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={busy}
              className="border-2 border-[var(--rule-strong)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white transition-colors hover:border-white hover:bg-white hover:text-black disabled:opacity-40"
            >
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            {msg && (
              <span className="font-mono text-[11px] text-[var(--text-soft)]">{msg}</span>
            )}
          </div>
        </form>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
          File saved as clan-capes-fabric-&lt;version&gt;.jar on the volume.
        </p>
      </section>
    </div>
  );
}
