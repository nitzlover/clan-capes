'use client';

/**
 * Animated top-3 podium for the clan leaderboard.
 *
 * Three rectangular slabs sized 60% / 100% / 80% — the gold middle
 * tier is the headline. Slabs rise from 0 to their final height via
 * Framer Motion's height transition, staggered slightly so the eye
 * lands on first place last. Tag + name + K/D land on top of each
 * slab.
 *
 * Renders nothing when the leaderboard has fewer than three rows —
 * a half-empty podium reads as broken.
 */

import { motion } from 'framer-motion';

export type PodiumRow = {
  clanId: number;
  tag: string;
  name: string;
  colorHex: string;
  kd: number;
  kills: number;
};

const TIERS = [
  // Order to render: 2nd place (left), 1st (centre), 3rd (right).
  { place: 2, heightPct: 60, label: 'silver' },
  { place: 1, heightPct: 100, label: 'gold' },
  { place: 3, heightPct: 45, label: 'bronze' },
] as const;

export function LeaderboardPodium({ rows }: { rows: PodiumRow[] }) {
  if (rows.length < 3) return null;
  const byPlace = [rows[0], rows[1], rows[2]];

  return (
    <section className="brutal-card mb-6 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="label-mono">Podium</p>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          top 3 · season
        </span>
      </div>
      <div className="grid grid-cols-3 items-end gap-3 px-2">
        {TIERS.map((tier, idx) => {
          const row = byPlace[tier.place - 1];
          return (
            <PodiumSlab
              key={tier.place}
              row={row}
              place={tier.place}
              heightPct={tier.heightPct}
              delayMs={idx * 90}
            />
          );
        })}
      </div>
    </section>
  );
}

function PodiumSlab({
  row,
  place,
  heightPct,
  delayMs,
}: {
  row: PodiumRow;
  place: 1 | 2 | 3;
  heightPct: number;
  delayMs: number;
}) {
  // Highlight tier — gold gets the lime signal accent, the other two
  // stay white-on-white so the medal hierarchy reads at a glance.
  const accent =
    place === 1
      ? 'border-[var(--signal)] text-[var(--signal)]'
      : 'border-[var(--rule-strong)] text-white';
  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="text-center">
        <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${accent}`}>
          #{place}
        </p>
        <p className="mt-1 truncate text-sm text-white" title={`[${row.tag}] ${row.name}`}>
          [{row.tag}]
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
          {row.kd.toFixed(2)} K/D · {row.kills} K
        </p>
      </div>
      <motion.div
        aria-hidden
        initial={{ height: 0 }}
        animate={{ height: `${heightPct}%` }}
        transition={{
          delay: delayMs / 1000,
          duration: 0.55,
          ease: [0.2, 0.7, 0.2, 1],
        }}
        className={`relative w-full border-2 border-[var(--rule-strong)] ${
          place === 1 ? 'border-[var(--signal)]' : ''
        }`}
        style={{
          // Slab background derives from the clan's snapped colour so
          // the podium reads as the clan's livery, not just an
          // abstract trophy. The vertical gradient adds a slab edge
          // without an extra DOM node.
          background:
            `linear-gradient(180deg, ${row.colorHex} 0%, color-mix(in srgb, ${row.colorHex} 70%, black) 100%)`,
          minHeight: 32,
        }}
      >
        <span
          className="absolute inset-x-0 bottom-1 text-center font-mono text-[18px] font-bold text-black/85 mix-blend-screen"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}
        >
          {place}
        </span>
      </motion.div>
    </div>
  );
}
