'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CapePreview } from '@/components/CapePreview';
import { UploadSection } from '@/components/UploadSection';
import { api, type ClanRow, getToken } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base';

type AuditEntry = { timestamp: string; raw: string };

export default function DashboardPage() {
  const router = useRouter();
  const [clans, setClans] = useState<ClanRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [tag, setTag] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [optionsRefresh, setOptionsRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace('/');
      return;
    }
    try {
      const [clanRes, auditRes] = await Promise.all([
        api<{ clans: ClanRow[] }>('/panel/clans'),
        api<{ entries: AuditEntry[] }>('/panel/audit'),
      ]);
      setClans(clanRes.clans);
      setAudit(auditRes.entries);
    } catch {
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

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
    const res = await fetch(
      `${getApiBaseUrl()}/panel/clans/${tag.toUpperCase()}/cape`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      }
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
    if (!confirm(`Remove cape for ${clanTag}?`)) return;
    await api(`/panel/clans/${clanTag}/cape`, { method: 'DELETE' });
    load();
  }

  function logout() {
    localStorage.removeItem('clancapes_token');
    router.replace('/');
  }

  if (loading) {
    return <main className="p-8 text-muted">Loading…</main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clan Capes Dashboard</h1>
          <p className="text-sm text-muted">Upload ready-made 64×32 PNG cape textures per clan</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
          Logout
        </button>
      </header>

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

      <section className="mb-10">
        <h2 className="mb-4 font-semibold">Clans ({clans.length})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clans.map((c) => (
            <article key={c.tag} className="rounded-xl border border-white/10 bg-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-accent">{c.tag}</span>
                <button
                  onClick={() => removeCape(c.tag)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Delete
                </button>
              </div>
              <CapePreview url={c.capeUrl} scale={3} />
              <p className="mt-2 truncate text-xs text-muted">{c.capeUrl}</p>
            </article>
          ))}
          {clans.length === 0 && <p className="text-muted">No capes yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-semibold">Audit log</h2>
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-panel p-4 font-mono text-xs text-muted">
          {audit.map((a, i) => (
            <li key={i}>
              <span className="text-white/50">{a.timestamp}</span> {a.raw}
            </li>
          ))}
          {audit.length === 0 && <li>No entries</li>}
        </ul>
      </section>
    </main>
  );
}
