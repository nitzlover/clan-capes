'use client';

/**
 * Login redesign — preview index.
 *
 * Down to the one chosen direction (v9 "Posed hero", now evolving into staged
 * diorama scenes) plus the separate mcskins pose studio.
 */

import Link from 'next/link';

const LINKS = [
  {
    href: '/login-preview/v9',
    num: '09',
    name: 'Posed scene',
    note: 'Login · diorama',
    desc: 'The chosen login. A staged Minecraft scene — multiple characters + props (e.g. two around a campfire), static, pure B&W, fits the viewport. Built on a scene engine so new scene ideas drop in as data.',
  },
  {
    href: '/avagen',
    num: '—',
    name: 'Pose studio',
    note: 'mcskins bundle (vendored)',
    desc: 'The mcskins.top pose generator running 1:1 in-app: pose sliders, items in hand, copy/load pose strings. Design a pose here, then it gets baked into a scene character.',
  },
];

export default function PreviewIndex() {
  return (
    <main className="min-h-[100dvh] bg-black px-6 py-16 text-white sm:px-12">
      <header className="mx-auto max-w-5xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/50">
          Login redesign
        </div>
        <h1 className="mt-5 font-sans text-5xl font-extrabold uppercase tracking-[-0.05em] sm:text-7xl">
          Posed scene.
        </h1>
        <p className="mt-5 max-w-[60ch] text-[0.95rem] leading-relaxed text-white/60">
          One direction now: a staged, static Minecraft diorama as the operator
          login. The pose studio is kept separate for authoring characters.
        </p>
      </header>

      <ul className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-px bg-white/10 sm:grid-cols-2">
        {LINKS.map((v) => (
          <li key={v.href} className="bg-black">
            <Link
              href={v.href}
              className="group flex h-full flex-col gap-8 p-10 transition-colors hover:bg-white/[0.025]"
            >
              <span className="font-mono text-5xl font-bold tabular tracking-tighter text-white">
                /{v.num}
              </span>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/50">
                  {v.note}
                </div>
                <h2 className="mt-4 font-sans text-3xl font-bold tracking-[-0.03em]">
                  {v.name}
                </h2>
                <p className="mt-5 max-w-[44ch] text-[0.9375rem] leading-[1.55] text-white/70">
                  {v.desc}
                </p>
              </div>
              <div className="mt-auto inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-white">
                <span className="h-px w-6 bg-white/40 transition-all duration-300 group-hover:w-14 group-hover:bg-white" />
                <span>Open</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
