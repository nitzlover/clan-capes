'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, UnauthorizedError } from '@/lib/api';
import { Stagger, StaggerItem } from '@/components/motion';
import { Skeleton } from '@/components/Skeleton';

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
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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

  /** Accept a picked/dropped file and auto-fill the version from its name. */
  function chooseFile(f: File | null) {
    setMsg(null);
    setFile(f);
    if (f) {
      const m = f.name.match(/(\d+\.\d+\.\d+(?:[.-][A-Za-z0-9]+)*)/);
      if (m && !version) setVersion(m[1]);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !version.trim()) {
      setMsg({ kind: 'err', text: 'Pick a .jar and enter its version.' });
      return;
    }
    setBusy(true);
    setMsg(null);
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
    };
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: 'err', text: data.error ?? 'Upload failed.' });
      return;
    }
    setMsg({
      kind: 'ok',
      text: `Published ${data.filename} — players are nagged to update on join.`,
    });
    setFile(null);
    setVersion('');
    load();
  }

  async function copyDownload() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/mod/download`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op, the link is still visible below */
    }
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Client mod</h1>
          <p className="page-subtitle">
            Publish the Fabric jar. Players get an in-game nag with the download
            link the next time they join on an older version.
          </p>
        </div>
        <span className={`status-pill ${latest ? 'ok' : 'bad'}`}>
          <span className="status-dot" aria-hidden />
          {latest ? `v${latest.version} live` : 'none published'}
        </span>
      </div>

      <Stagger className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* ── Current build ─────────────────────────────────────────── */}
        <StaggerItem>
          <section className="brutal-card flex h-full flex-col p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <span className="label-mono">Current build</span>
              {latest && (
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                  {(latest.size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-5">
                <Skeleton className="h-12 w-32" rounded="md" />
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <Skeleton className="h-9" rounded="sm" />
                  <Skeleton className="h-9" rounded="sm" />
                  <Skeleton className="h-9" rounded="sm" />
                </div>
                <Skeleton className="h-9 w-40" rounded="pill" />
              </div>
            ) : latest ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="font-sans text-5xl font-extrabold leading-none tracking-tight text-white tabular">
                    v{latest.version}
                  </span>
                </div>

                <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
                  <Fact label="File" value={latest.filename} mono break />
                  <Fact label="Size" value={`${(latest.size / 1024).toFixed(1)} KB`} mono />
                  <Fact
                    label="Published"
                    value={new Date(latest.uploadedAt).toLocaleString()}
                  />
                </dl>

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
                  <a href="/api/mod/download" className="btn-primary">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      download
                    </span>
                    Download jar
                  </a>
                  <button type="button" onClick={copyDownload} className="btn-ghost">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {copied ? 'check' : 'link'}
                    </span>
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <span
                  className="material-symbols-outlined mb-3 text-[var(--text-faint)]"
                  style={{ fontSize: 40 }}
                >
                  deployed_code
                </span>
                <p className="font-sans text-sm font-medium text-[var(--text-soft)]">
                  No build published yet
                </p>
                <p className="mt-1 max-w-xs text-xs text-[var(--text-faint)]">
                  Players can&apos;t auto-download until you publish a jar on the
                  right.
                </p>
              </div>
            )}
          </section>
        </StaggerItem>

        {/* ── Publish new version ───────────────────────────────────── */}
        <StaggerItem>
          <section className="brutal-card flex h-full flex-col p-6 md:p-8">
            <span className="label-mono mb-6 block">Publish new version</span>

            <form onSubmit={upload} className="flex flex-1 flex-col gap-5">
              {/* Dropzone */}
              <input
                ref={fileInput}
                type="file"
                accept=".jar"
                className="hidden"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--surface-1)] px-4 py-3">
                  <span
                    className="material-symbols-outlined text-[var(--text-soft)]"
                    style={{ fontSize: 22 }}
                  >
                    deployed_code
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] text-white">
                      {file.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)] tabular">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseFile(null)}
                    aria-label="Remove file"
                    className="text-[var(--text-mute)] transition-colors hover:text-white"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      close
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) chooseFile(f);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed px-6 py-10 text-center transition-colors ${
                    dragOver
                      ? 'border-white bg-[var(--surface-2)]'
                      : 'border-[var(--rule-strong)] hover:border-[rgba(255,255,255,0.3)] hover:bg-[var(--surface-1)]'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[var(--text-mute)]"
                    style={{ fontSize: 30 }}
                  >
                    upload
                  </span>
                  <span className="font-sans text-sm font-medium text-[var(--text-soft)]">
                    Drop a <span className="font-mono">.jar</span> here, or click to
                    browse
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Fabric client mod
                  </span>
                </button>
              )}

              {/* Version */}
              <label className="field">
                <span className="label-soft">Version</span>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. 1.0.5"
                  spellCheck={false}
                  className="input font-mono"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Auto-filled from the filename. Saved as
                  {' '}clan-capes-fabric-&lt;version&gt;.jar
                </span>
              </label>

              <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={busy || !file || !version.trim()}
                  className="btn-primary disabled:opacity-40"
                >
                  {busy ? 'Publishing…' : 'Publish'}
                </button>
                {msg && (
                  <span
                    className={`font-sans text-[13px] ${
                      msg.kind === 'ok' ? 'text-[var(--text-soft)]' : 'text-white'
                    }`}
                  >
                    {msg.kind === 'ok' ? '✓ ' : '! '}
                    {msg.text}
                  </span>
                )}
              </div>
            </form>
          </section>
        </StaggerItem>
      </Stagger>

      {/* Endpoints — muted footnote, not a primary action. */}
      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
        Endpoints · <span className="text-[var(--text-mute)]">/api/mod/version</span>{' '}
        advertises · <span className="text-[var(--text-mute)]">/api/mod/download</span>{' '}
        serves
      </p>
    </div>
  );
}

/** One label/value pair in the current-build facts grid. */
function Fact({
  label,
  value,
  mono,
  break: brk,
}: {
  label: string;
  value: string;
  mono?: boolean;
  break?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-mono">{label}</dt>
      <dd
        className={`mt-1.5 text-[var(--text-soft)] ${mono ? 'font-mono text-[12px]' : 'text-sm'} ${
          brk ? 'break-all' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
