'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, UnauthorizedError } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton';

type ModLatest = {
  version: string;
  filename: string;
  size: number;
  uploadedAt: string;
} | null;

/**
 * Client-mod distribution — "technical ledger" layout.
 *
 * A flat hairline grid (no floating cards) divides the surface into
 * numbered sections like a spec sheet: a big version readout, a
 * dotted-leader specification list, and a registration-marked publish
 * dropzone. Strictly B&W; structure comes from rules + type, not boxes.
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
      /* clipboard blocked — link is still visible in the spec */
    }
  }

  return (
    <div>
      {/* Masthead — coordinate eyebrow, title, live readout */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rule)] pb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[var(--text-faint)]">
            Client ∕ Mod
          </p>
          <h1 className="mt-2 font-sans text-4xl font-semibold tracking-tight text-white">
            Distribution
          </h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
            Status
          </p>
          <p className="mt-1.5 font-mono text-[13px] tracking-wide">
            {loading ? (
              <span className="text-[var(--text-faint)]">— checking —</span>
            ) : latest ? (
              <span className="text-white">
                <span className="text-[var(--ink-0)]">●</span> live · v{latest.version}
              </span>
            ) : (
              <span className="text-[var(--text-faint)]">○ none published</span>
            )}
          </p>
        </div>
      </header>

      {/* Hairline grid — cells separated by 1px rules, no cards */}
      <div className="overflow-hidden border border-[var(--rule)]">
        <div className="grid gap-px bg-[var(--rule)] md:grid-cols-2">
          {/* 01 — readout */}
          <div className="flex flex-col bg-[var(--bg)] p-7 md:p-9">
            <IndexLabel n="01" label="Current build" />
            {loading ? (
              <div className="mt-7 space-y-4">
                <Skeleton className="h-4 w-16" rounded="sm" />
                <Skeleton className="h-16 w-44" rounded="md" />
                <Skeleton className="mt-6 h-9 w-40" rounded="pill" />
              </div>
            ) : latest ? (
              <>
                <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                  Version
                </p>
                <p className="font-sans text-[clamp(3.5rem,8vw,5.5rem)] font-extrabold leading-[0.85] tracking-[-0.04em] text-white tabular">
                  {latest.version}
                </p>
                <div className="mt-4 h-[3px] w-14 rounded-full bg-[var(--accent)]" aria-hidden />
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-9">
                  <a href="/api/mod/download" className="btn-accent">
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
              <div className="flex flex-1 flex-col items-start justify-center py-10">
                <p className="font-sans text-2xl font-semibold tracking-tight text-[var(--text-soft)]">
                  No build yet
                </p>
                <p className="mt-2 max-w-xs text-sm text-[var(--text-faint)]">
                  Players can&apos;t auto-download until a jar is published in
                  section 03.
                </p>
              </div>
            )}
          </div>

          {/* 02 — specification */}
          <div className="bg-[var(--bg)] p-7 md:p-9">
            <IndexLabel n="02" label="Specification" />
            <div className="mt-7 space-y-3.5">
              {loading ? (
                <>
                  <Skeleton className="h-4 w-full" rounded="sm" />
                  <Skeleton className="h-4 w-full" rounded="sm" />
                  <Skeleton className="h-4 w-full" rounded="sm" />
                  <Skeleton className="h-4 w-full" rounded="sm" />
                </>
              ) : latest ? (
                <>
                  <SpecRow k="File" v={latest.filename} />
                  <SpecRow k="Size" v={`${(latest.size / 1024).toFixed(1)} KB`} />
                  <SpecRow k="Published" v={new Date(latest.uploadedAt).toLocaleString()} />
                  <SpecRow k="Download" v="/api/mod/download" />
                  <SpecRow k="Manifest" v="/api/mod/version" />
                </>
              ) : (
                <>
                  <SpecRow k="File" v="—" />
                  <SpecRow k="Size" v="—" />
                  <SpecRow k="Published" v="—" />
                  <SpecRow k="Download" v="/api/mod/download" />
                  <SpecRow k="Manifest" v="/api/mod/version" />
                </>
              )}
            </div>
          </div>

          {/* 03 — publish (full width) */}
          <div className="bg-[var(--bg)] p-7 md:col-span-2 md:p-9">
            <IndexLabel n="03" label="Publish new version" />
            <form
              onSubmit={upload}
              className="mt-7 grid items-start gap-6 md:grid-cols-[1.5fr_1fr]"
            >
              <input
                ref={fileInput}
                type="file"
                accept=".jar"
                className="hidden"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-3 border border-[var(--rule)] bg-[var(--surface-1)] px-4 py-4">
                  <span
                    className="material-symbols-outlined text-[var(--text-soft)]"
                    style={{ fontSize: 22 }}
                  >
                    deployed_code
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] text-white">{file.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)] tabular">
                      {(file.size / 1024).toFixed(1)} KB · ready
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
                  className={`relative flex flex-col items-center justify-center gap-2 px-6 py-9 text-center transition-colors ${
                    dragOver ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <CornerTicks active={dragOver} />
                  <span
                    className="material-symbols-outlined text-[var(--text-mute)]"
                    style={{ fontSize: 28 }}
                  >
                    upload
                  </span>
                  <span className="font-sans text-sm font-medium text-[var(--text-soft)]">
                    Drop a <span className="font-mono">.jar</span> here, or click to browse
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Fabric client mod
                  </span>
                </button>
              )}

              <div className="flex flex-col gap-4">
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
                    Auto-read from the filename
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy || !file || !version.trim()}
                    className="btn-primary disabled:opacity-40"
                  >
                    {busy ? 'Publishing…' : 'Publish build'}
                  </button>
                </div>
                {msg && (
                  <p
                    className={`font-sans text-[13px] ${
                      msg.kind === 'ok' ? 'text-[var(--text-soft)]' : 'text-white'
                    }`}
                  >
                    {msg.kind === 'ok' ? '✓ ' : '! '}
                    {msg.text}
                  </p>
                )}
              </div>
            </form>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Stored on the volume as clan-capes-fabric-&lt;version&gt;.jar · advertised to
              clients within one poll.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "01 —— Label" coordinate-style section marker. */
function IndexLabel({ n, label }: { n: string; label: string }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-mute)]">
      <span className="text-[var(--accent)]">{n}</span>
      <span className="h-px w-7 bg-[var(--rule-strong)]" />
      <span>{label}</span>
    </p>
  );
}

/** Mono key with a dotted leader running to a right-aligned value. */
function SpecRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-3 font-mono text-[12px]">
      <span className="shrink-0 uppercase tracking-[0.2em] text-[var(--text-faint)]">{k}</span>
      <span className="mb-1 flex-1 self-end border-b border-dotted border-[var(--rule-strong)]" />
      <span className="max-w-[62%] break-all text-right text-[var(--text-soft)]">{v}</span>
    </div>
  );
}

/** Registration / crosshair marks at the four corners of a panel. */
function CornerTicks({ active }: { active?: boolean }) {
  const tone = active ? 'border-[var(--accent)]' : 'border-[var(--accent-line)]';
  const base = `pointer-events-none absolute h-2.5 w-2.5 ${tone}`;
  return (
    <>
      <span className={`${base} left-0 top-0 border-l border-t`} aria-hidden />
      <span className={`${base} right-0 top-0 border-r border-t`} aria-hidden />
      <span className={`${base} bottom-0 left-0 border-b border-l`} aria-hidden />
      <span className={`${base} bottom-0 right-0 border-b border-r`} aria-hidden />
    </>
  );
}
