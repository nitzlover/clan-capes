'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type ClanRow, UnauthorizedError } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';

type AuditEntry = { timestamp: string; raw: string };

/**
 * Overview — the top of the brutalist shell.
 *
 * Cards summarise how many clans are registered, how many have capes
 * applied, and the size of the audit trail. Below the cards a 5-line
 * audit preview hints at recent activity; clicking through goes to the
 * full audit route. No editing happens here — this is a one-glance
 * status surface.
 */
export default function DashboardOverviewPage() {
  const [clans, setClans] = useState<ClanRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await api<{ clans: ClanRow[] }>('/panel/clans');
        if (!cancelled) setClans(c.clans);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
      }
      try {
        const a = await api<{ entries: AuditEntry[] }>('/panel/audit');
        if (!cancelled) setAudit(a.entries);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withCape = clans.filter((c) => c.capeUrl).length;

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">
            Live counters across clans, capes, and the operator trail.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="meta-tag">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              shield_lock
            </span>
            Plugin
          </span>
          <PluginStatus />
        </div>
      </div>

      {loading ? (
        <p className="eyebrow">Loading…</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <MetricCard
              label="Clans"
              value={clans.length}
              icon="groups"
              hint="PowerClans roster"
            />
            <MetricCard
              label="With cape"
              value={withCape}
              icon="image"
              hint={`${clans.length - withCape} pending`}
            />
            <MetricCard
              label="Audit lines"
              value={audit.length}
              icon="receipt_long"
              hint="Operator log"
            />
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <RecentAuditCard entries={audit.slice(0, 6)} />
            <QuickLinksCard />
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: number | string;
  icon: string;
  hint?: string;
}) {
  return (
    <div className="brutal-card flex items-start gap-5 p-6">
      <div className="brutal-tile flex aspect-square h-12 w-12 shrink-0 items-center justify-center">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="label-mono">{label}</p>
        <p className="mt-2 font-sans text-5xl font-extrabold tabular leading-none text-white">
          {typeof value === 'number' ? String(value).padStart(2, '0') : value}
        </p>
        {hint && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function RecentAuditCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="brutal-card flex flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="label-mono">Recent activity</span>
        <Link
          href="/dashboard/audit"
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline"
        >
          full trail →
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="py-2 text-sm text-[var(--text-faint)]">No entries yet.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((a, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr] gap-4 border-t border-[var(--rule)] py-2 first:border-t-0 font-mono text-[11px]"
            >
              <span className="text-[var(--text-faint)] tabular">{a.timestamp}</span>
              <span className="truncate text-[var(--text-soft)]">{a.raw}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickLinksCard() {
  const links: Array<{ href: string; label: string; icon: string; hint: string }> = [
    { href: '/dashboard/capes', label: 'Upload cape', icon: 'upload', hint: 'PNG → clan' },
    { href: '/dashboard/banners', label: 'Edit banner', icon: 'shield', hint: 'Per-clan crest' },
    { href: '/dashboard/audit', label: 'View audit', icon: 'receipt_long', hint: 'Full trail' },
  ];
  return (
    <div className="brutal-card flex flex-col p-6">
      <span className="label-mono mb-4 block">Jump to</span>
      <div className="flex flex-col gap-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-center justify-between border border-[var(--rule)] px-4 py-3 transition-colors hover:border-white hover:bg-white/[0.04]"
          >
            <span className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[var(--text-soft)] group-hover:text-white">
                {l.icon}
              </span>
              <span className="font-sans text-sm font-bold uppercase tracking-wider text-white">
                {l.label}
              </span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)] group-hover:text-white">
              {l.hint} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
