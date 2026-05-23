'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BannerSection } from '@/components/BannerSection';
import { CapeBackPreview } from '@/components/CapeBackPreview';
import { UploadSection } from '@/components/UploadSection';
import { PluginStatus } from '@/components/PluginStatus';
import { api, type ClanRow, getToken } from '@/lib/api';

type AuditEntry = { timestamp: string; raw: string };

/**
 * Dashboard — monochrome modern.
 *
 * No card grid, no nested panels. Each operational area is a "chapter":
 * a thin 1px top rule, a small mono eyebrow, a display headline, and the
 * controls below. Sections breathe vertically — spacing carries the
 * hierarchy that color and surface chrome would carry in a coloured
 * brand interface.
 *
 * The clan list is a typographic table-style rail (rows separated by
 * rules), not a wall of cards. Audit log is the same rail in monospace.
 */
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
      const clanRes = await api<{ clans: ClanRow[] }>('/panel/clans');
      setClans(clanRes.clans);
    } catch (e) {
      if (e instanceof Error && /unauthor|invalid token/i.test(e.message)) {
        router.replace('/');
        return;
      }
      setClans([]);
    }
    try {
      const auditRes = await api<{ entries: AuditEntry[] }>('/panel/audit');
      setAudit(auditRes.entries);
    } catch {
      setAudit([]);
    }
    setLoading(false);
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

  function logout() {
    localStorage.removeItem('clancapes_token');
    router.replace('/');
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--bg)] px-6 py-12 text-[var(--text-mute)]">
        <p className="eyebrow">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      {/* Top rail. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--rule)] bg-[var(--bg)]/95 px-6 py-4 backdrop-blur-sm sm:px-10">
        <div className="flex items-baseline gap-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-white">
            Clan / Capes
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Dashboard
          </span>
        </div>
        <div className="flex items-center gap-4">
          <PluginStatus />
          <button onClick={logout} className="btn-danger-link">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pb-24 sm:px-10">
        {/* Hero / overview chapter. */}
        <section className="py-16">
          <p className="eyebrow">Overview</p>
          <h1 className="display mt-5">
            Capes, banners, audit —
            <br />
            <span className="text-[var(--text-faint)]">one operator surface.</span>
          </h1>
          <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-6 sm:grid-cols-4 sm:max-w-3xl">
            <Metric label="Clans" value={clans.length} />
            <Metric label="With cape" value={clans.filter((c) => c.capeUrl).length} />
            <Metric label="Audit lines" value={audit.length} />
            <Metric
              label="Plugin"
              value={<span className="text-white">live</span>}
              suffix="status above"
            />
          </div>
        </section>

        {/* Cape upload chapter. */}
        <section className="chapter">
          <div className="chapter-head">
            <p className="eyebrow">01 — Cape</p>
            <h2 className="display">Upload PNG per clan.</h2>
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
          />
        </section>

        {/* Clan roster chapter. */}
        <section className="chapter mt-16">
          <div className="chapter-head">
            <p className="eyebrow">02 — Roster</p>
            <h2 className="display">
              Clans <span className="text-[var(--text-faint)] tabular">·{' '}
              {String(clans.length).padStart(2, '0')}
              </span>
            </h2>
          </div>

          {clans.length === 0 ? (
            <p className="py-8 text-sm text-[var(--text-mute)]">
              No clans with capes yet.
            </p>
          ) : (
            <ul className="mt-2">
              {clans.map((c) => (
                <li
                  key={c.tag}
                  className="grid grid-cols-[64px_1fr_auto] items-center gap-6 border-t border-[var(--rule)] py-5 first:border-t-0"
                >
                  <CapeBackPreview url={c.capeUrl} zoom={5} />
                  <div className="min-w-0">
                    <div className="font-mono text-base font-semibold tracking-wider text-white">
                      {c.tag}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {c.capeUrl || 'no cape'}
                    </div>
                  </div>
                  <button
                    onClick={() => removeCape(c.tag)}
                    className="btn-danger-link"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Banners chapter. */}
        <section className="chapter mt-16">
          <div className="chapter-head">
            <p className="eyebrow">03 — Shield banners</p>
            <h2 className="display">Per-clan crest.</h2>
          </div>
          <BannerSection />
        </section>

        {/* Audit chapter. */}
        <section className="chapter mt-16">
          <div className="chapter-head">
            <p className="eyebrow">04 — Audit</p>
            <h2 className="display">Operator trail.</h2>
          </div>
          <ul className="max-h-72 overflow-y-auto font-mono text-[11px] text-[var(--text-mute)]">
            {audit.map((a, i) => (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] gap-4 border-t border-[var(--rule)] py-2 first:border-t-0"
              >
                <span className="text-[var(--text-faint)] tabular">
                  {a.timestamp}
                </span>
                <span className="truncate text-[var(--text-soft)]">{a.raw}</span>
              </li>
            ))}
            {audit.length === 0 && (
              <li className="py-6 text-[var(--text-faint)]">No entries.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="mt-2 font-sans text-3xl font-bold tabular text-white">
        {value}
      </p>
      {suffix && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
          {suffix}
        </p>
      )}
    </div>
  );
}
