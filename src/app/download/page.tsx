'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Heavy three.js studio engine — load client-side only, off the initial bundle.
const StudioHero = dynamic(() => import('@/components/StudioHero'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

/**
 * Public client-mod download page — Minecraft-flavoured.
 *
 * `/api/mod/download` stays a raw jar stream (the Fabric auto-updater and
 * the in-game nag fetch it directly); this is the human-facing page. It
 * auto-starts the download on load and always offers a manual button as
 * the fallback (browsers block programmatic downloads without a gesture).
 *
 * The hero is a live skinview3d player rotating with a cape so visitors
 * see exactly what the mod renders, with a pixel cape-swatch picker.
 * Minecraftia bitmap face + a beveled MC block button on a dark+gold base.
 */

type ModVersion = {
  latest: string;
  downloadUrl: string;
  size?: number;
  uploadedAt?: string;
};

const CAPES = [
  { id: 'cobalt', label: 'Cobalt' },
  { id: 'cherry', label: 'Cherry' },
  { id: 'builder', label: 'Builder' },
  { id: 'classic', label: 'Classic' },
];

export default function DownloadPage() {
  const [info, setInfo] = useState<ModVersion | null>(null);
  const [autoTried, setAutoTried] = useState(false);
  const [cape, setCape] = useState('cobalt');
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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--bg)] px-6 py-14">
      {/* Soft gold glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'var(--accent-glow)', filter: 'blur(140px)', opacity: 0.45 }}
      />

      <div className="relative grid w-full max-w-4xl items-center gap-10 lg:grid-cols-[auto_1fr] lg:gap-14">
        {/* ── Hero: rotating player + cape ── */}
        <div className="flex flex-col items-center gap-4">
          <div className="mc-frame p-2">
            <div style={{ width: 260, height: 360 }}>
              <StudioHero capeUrl={`/capes/${cape}.png`} />
            </div>
            <CornerTicks />
          </div>

          {/* Cape swatch picker */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {CAPES.map((c) => {
              const active = cape === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCape(c.id)}
                  className={`font-mc px-2.5 py-1.5 text-[11px] uppercase tracking-wider transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'bg-[var(--surface-2)] text-[var(--text-mute)] hover:text-white'
                  }`}
                  style={{ imageRendering: 'pixelated' }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Drag to rotate · pick a cape
          </p>
        </div>

        {/* ── Info + download ── */}
        <div className="text-center lg:text-left">
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
              <div
                className="mx-auto mt-5 h-[4px] w-16 bg-[var(--accent)] lg:mx-0"
                aria-hidden
              />

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

              <div className="mt-4 flex flex-col items-center gap-3 lg:items-start">
                <a
                  ref={anchor}
                  href="/api/mod/download"
                  download
                  className="btn-mc"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    download
                  </span>
                  Download the mod
                </a>
                <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  <Badge>Fabric</Badge>
                  <Badge>MC 26.1.x</Badge>
                  {sizeKb && <Badge>{`.jar · ${sizeKb}`}</Badge>}
                </div>
              </div>

              {/* Install */}
              <div className="mt-10 border-t border-[var(--rule)] pt-6 text-left">
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

/** Gold registration marks at the four corners of the showcase frame. */
function CornerTicks() {
  const base = 'pointer-events-none absolute h-3 w-3 border-[var(--accent-line)]';
  return (
    <>
      <span className={`${base} left-0 top-0 border-l-2 border-t-2`} aria-hidden />
      <span className={`${base} right-0 top-0 border-r-2 border-t-2`} aria-hidden />
      <span className={`${base} bottom-0 left-0 border-b-2 border-l-2`} aria-hidden />
      <span className={`${base} bottom-0 right-0 border-b-2 border-r-2`} aria-hidden />
    </>
  );
}
