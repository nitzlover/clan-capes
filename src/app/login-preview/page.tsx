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
    href: '/login-preview/1',
    num: '01',
    name: 'The Grove',
    note: 'Situation · forest clearing',
    desc: 'A moonlit forest clearing — the clan standing together among the trees, the creeper peering from behind a far trunk. No fire. Same diorama engine, new staging.',
  },
  {
    href: '/login-preview/2',
    num: '02',
    name: 'The Quarry',
    note: 'Situation · stone pit',
    desc: 'A stone pit at night: a tall cobblestone wall, stepped ledges, ore glowing in the rock, stone underfoot. The clan stands working it. No fire.',
  },
];

export default function PreviewIndex() {
  return (
    <main className="min-h-[100dvh] bg-black px-6 py-16 text-white sm:px-12">
      <header className="mx-auto max-w-5xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/50">
          Login situations
        </div>
        <h1 className="mt-5 font-sans text-5xl font-extrabold uppercase tracking-[-0.05em] sm:text-7xl">
          Two situations.
        </h1>
        <p className="mt-5 max-w-[60ch] text-[0.95rem] leading-relaxed text-white/60">
          The campfire diorama now ships as the live{' '}
          <Link href="/login" className="text-white underline-offset-4 hover:underline">
            /login
          </Link>
          . Two new non-fire situations staged on the same engine — pick one to
          rotate in.
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
