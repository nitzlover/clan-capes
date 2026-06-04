'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Heavy three.js diorama engine (the live-login MinecraftScene) — load
// client-side only, off the initial bundle.
const DownloadDiorama = dynamic(() => import('@/components/DownloadDiorama'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

/**
 * Public client-mod download page — Minecraft-flavoured.
 *
 * `/api/mod/download` stays a raw jar stream (the Fabric auto-updater and the
 * in-game nag fetch it directly); this is the human-facing page. It auto-starts
 * the download on load and always offers a manual button as the fallback
 * (browsers block programmatic downloads without a gesture).
 *
 * The hero is a LIVE diorama on the right — the same staged scene engine that
 * backs /login — showing two clan members duelling in a stone ring while the
 * download card sits on the left. Minecraftia bitmap version + a beveled MC
 * block button on the dark + gold base.
 */

type ModVersion = {
  latest: string;
  downloadUrl: string;
  size?: number;
  uploadedAt?: string;
};

export default function DownloadPage() {
  const [info, setInfo] = useState<ModVersion | null>(null);
  const [autoTried, setAutoTried] = useState(false);
  const anchor = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mod/version')
      .then((r) => r.json())
      .then((d: ModVersion) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      anchor.current?.click();
      setAutoTried(true);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  const hasBuild = Boolean(info?.latest && info.latest !== 'none');
  const sizeKb = info?.size ? `${(info.size / 1024).toFixed(0)} KB` : null;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[var(--bg)]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        {/* ── LEFT · the download card ── */}
        <section className="relative z-10 flex items-center px-6 py-14 sm:px-10 lg:px-16">
          {/* Soft gold glow behind the text */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 top-1/2 h-[560px] w-[560px] -translate-y-1/2 rounded-full"
            style={{ background: 'var(--accent-glow)', filter: 'blur(150px)', opacity: 0.4 }}
          />

          <div className="relative w-full max-w-md">
            <div className="mb-6 inline-flex items-center gap-2">
              <span className="text-2xl text-[var(--accent)]">❖</span>
              <span className="font-sans text-xl font-semibold lowercase tracking-tight text-white">
                crestoria
              </span>
            </div>

            <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[var(--text-faint)]">
              Client mod
            </p>

            {hasBuild ? (
              <>
                <h1 className="font-mc mt-3 text-[clamp(2.75rem,7vw,4rem)] leading-none text-white">
                  v{info!.latest}
                </h1>
                <div className="mt-5 h-[4px] w-16 bg-[var(--accent)]" aria-hidden />

                {/* Feature line */}
                <p className="mt-6 text-sm leading-relaxed text-[var(--text-mute)]">
                  Renders your <span className="text-white">clan cape</span> and{' '}
                  <span className="text-white">clan armor trims</span> natively — every
                  player sees them, modded or not.
                </p>

                <p className="mt-5 text-[13px] text-[var(--text-faint)]">
                  {autoTried
                    ? "Download should've started. Didn't happen?"
                    : 'Starting your download…'}
                </p>

                <div className="mt-4 flex flex-col items-start gap-3">
                  <a ref={anchor} href="/api/mod/download" download className="btn-mc">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      download
                    </span>
                    Download the mod
                  </a>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Fabric</Badge>
                    <Badge>MC 26.1.x</Badge>
                    {sizeKb && <Badge>{`.jar · ${sizeKb}`}</Badge>}
                  </div>
                </div>

                {/* Install */}
                <div className="mt-10 border-t border-[var(--rule)] pt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-mute)]">
                    Install
                  </p>
                  <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
                    <li>
                      <span className="font-mc mr-2 text-[var(--accent)]">1</span>
                      Install <span className="text-white">Fabric Loader</span> for
                      Minecraft 26.1.x.
                    </li>
                    <li>
                      <span className="font-mc mr-2 text-[var(--accent)]">2</span>
                      Drop the <span className="font-mono text-white">.jar</span> into your{' '}
                      <span className="font-mono text-white">mods</span> folder.
                    </li>
                    <li>
                      <span className="font-mc mr-2 text-[var(--accent)]">3</span>
                      Launch — capes &amp; trims render automatically, and the mod
                      self-updates.
                    </li>
                  </ol>
                </div>
              </>
            ) : (
              <p className="mt-8 text-sm text-[var(--text-mute)]">
                No build is published yet. Check back soon.
              </p>
            )}
          </div>
        </section>

        {/* ── RIGHT · the live duel diorama ── */}
        <section className="relative min-h-[44vh] overflow-hidden border-t border-[var(--rule)] lg:min-h-0 lg:border-l lg:border-t-0">
          <DownloadDiorama className="absolute inset-0" />

          {/* Fade the diorama's left edge into the content column so it reads as
              one canvas, not a hard split. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-[var(--bg)] via-[var(--bg)]/55 to-transparent"
          />
          {/* Top + bottom edge fades for a framed, cut-in look. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--bg)] to-transparent"
          />

          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
            crestoria · live render
          </div>
        </section>
      </div>
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-[var(--rule-strong)] bg-[var(--surface-1)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
      {children}
    </span>
  );
}
