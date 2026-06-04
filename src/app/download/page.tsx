'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Public client-mod download page — the link to share with players.
 *
 * `/api/mod/download` itself stays a raw jar stream (the Fabric mod's
 * auto-updater and the in-game nag fetch it directly), so this is a
 * separate human-facing page. It auto-triggers the download on load, and
 * — because browsers block programmatic downloads without a user gesture —
 * always offers a manual button as the fallback. Dark + gold, Crestoria
 * branded. No auth (players aren't logged in).
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

  // Try to auto-start the download shortly after mount. If the browser
  // blocks it (no user gesture), the manual button below still works.
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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--bg)] px-6 py-16">
      {/* Soft gold glow behind the card — the one bit of accent atmosphere. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'var(--accent-glow)', filter: 'blur(120px)', opacity: 0.5 }}
      />

      <div className="relative w-full max-w-md text-center">
        {/* Wordmark */}
        <div className="mb-10 inline-flex items-center gap-2">
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
            <h1 className="mt-3 font-sans text-[clamp(3rem,11vw,5rem)] font-extrabold leading-[0.85] tracking-[-0.04em] text-white tabular">
              v{info!.latest}
            </h1>
            <div
              className="mx-auto mt-5 h-[3px] w-14 rounded-full bg-[var(--accent)]"
              aria-hidden
            />

            <p className="mx-auto mt-8 max-w-xs text-sm leading-relaxed text-[var(--text-mute)]">
              {autoTried ? (
                <>Your download should have started. Didn&apos;t happen?</>
              ) : (
                <>Starting your download…</>
              )}
            </p>

            <div className="mt-5 flex flex-col items-center gap-3">
              <a
                ref={anchor}
                href="/api/mod/download"
                download
                className="btn-accent px-6 py-2.5 text-[15px]"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  download
                </span>
                Download the mod
              </a>
              {sizeKb && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)] tabular">
                  .jar · {sizeKb}
                </span>
              )}
            </div>

            {/* Install hint */}
            <div className="mt-12 border-t border-[var(--rule)] pt-7 text-left">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-mute)]">
                Install
              </p>
              <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
                <li>
                  <span className="mr-2 text-[var(--accent)]">1</span>
                  Install <span className="text-white">Fabric Loader</span> for Minecraft
                  {' '}26.1.x.
                </li>
                <li>
                  <span className="mr-2 text-[var(--accent)]">2</span>
                  Drop the <span className="font-mono text-white">.jar</span> into your{' '}
                  <span className="font-mono text-white">mods</span> folder.
                </li>
                <li>
                  <span className="mr-2 text-[var(--accent)]">3</span>
                  Launch the game — clan capes &amp; trims render automatically.
                </li>
              </ol>
            </div>
          </>
        ) : (
          <p className="mt-10 text-sm text-[var(--text-mute)]">
            No build is published yet. Check back soon.
          </p>
        )}
      </div>
    </main>
  );
}
