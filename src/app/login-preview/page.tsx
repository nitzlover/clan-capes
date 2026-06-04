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
  {
    href: '/login-preview/3',
    num: '03',
    name: 'The Beacon',
    note: 'Situation · pillar of light',
    desc: 'The unique one — a beacon beam punches straight up into the starry night while the clan gathers at the foot of a stepped stone base, the beacon block glowing at its apex. A vertical shaft of light, not fire.',
  },
  { href: '/login-preview/4', num: '04', name: 'Council Fire', note: 'Situation · the fire, posed', desc: 'The campfire alive — two seated leaning into the flames, the creeper standing in thought behind its tree. Real mcrender poses, not a stiff stand.' },
  { href: '/login-preview/5', num: '05', name: 'The Throne', note: 'Situation · enthroned', desc: 'A lord enthroned on a cobblestone seat under banner poles, a guard saluting, the creeper kneeling before the dais.' },
  { href: '/login-preview/6', num: '06', name: 'The Duel', note: 'Situation · two squared off', desc: 'Two clanmates mid-fight in a stone ring lit by glowing braziers, swords drawn, a third watching from the edge.' },
  { href: '/login-preview/7', num: '07', name: 'Stargazers', note: 'Situation · under the sky', desc: 'Two lying back on the grass, one sitting and pointing up at a dense moonlit sky. Quiet, off-duty.' },
  { href: '/login-preview/8', num: '08', name: 'The Forge', note: 'Situation · the smith', desc: 'A smith mid-swing at the anvil, the forge glowing in the rock, a clanmate watching the work.' },
  { href: '/login-preview/9', num: '09', name: 'The Long March', note: 'Situation · the column', desc: 'A column crossing a moonlit ridge — walking, marching, running — capes to the wind.' },
  { href: '/login-preview/10', num: '10', name: 'Spider Perch', note: 'Situation · the high ground', desc: 'A scout crouched atop a stone pillar scanning the dark, a partner staring up, a creeper sneaking the base.' },
  { href: '/login-preview/11', num: '11', name: 'The Fallen', note: 'Situation · the vigil', desc: 'A vigil over a fallen clanmate among gravestones, a lantern glowing, the creeper hanging its head.' },
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
