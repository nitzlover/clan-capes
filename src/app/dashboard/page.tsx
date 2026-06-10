'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, UnauthorizedError } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';
import { SelectServerPrompt } from '@/components/ServerPicker';
import { useSelectedServer } from '@/lib/selected-server';
import { Stagger, StaggerItem, CountUp } from '@/components/motion';
import { SkeletonMetricGrid, SkeletonCard } from '@/components/Skeleton';

// 1.0.10: real audit shape from /api/panel/audit. The 1.0.0..1.0.9
// dashboard typed this as { timestamp, raw } and rendered `r.raw`,
// which has always been undefined on the DB-backed route — every row
// rendered as an empty third column on every overview page load. Now
// matches the structured payload the audit page already consumes.
type AuditEntry = {
  id?: number;
  timestamp: string;
  actor?: string | null;
  action?: string | null;
  target?: string | null;
};

/** Counts shape returned by /api/panel/overview. */
type Overview = {
  servers: number;
  clans: number;
  members: number;
  killsMtd: number;
  capesAssigned: number;
};

/**
 * Overview — the top of the brutalist shell.
 *
 * Five-card KPI grid sourced from /api/panel/overview (single
 * round-trip): server count, active clan count, member count,
 * kills-this-month, capes assigned. Below the grid: a 6-line audit
 * preview + quick-links jump panel. Clicking through goes to the
 * full audit route. No editing happens here — this is a one-glance
 * status surface.
 *
 * Per the Wave 4 backlog item, cards are simple <div>s — no
 * sparkline lib, no recharts. The "live" feeling comes from the
 * counts themselves moving when the operator refreshes, not from
 * animated charts.
 */
export default function DashboardOverviewPage() {
  const { value: serverId } = useSelectedServer();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (serverId === null) {
      setOverview(null);
      setAudit([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Build the scope query once per fetch. 'all' aggregates across
    // every registered server, numeric pins to one. The panel routes
    // were already serverId-aware, the picker just feeds them.
    const scope =
      serverId === 'all' ? '?serverId=all' : `?serverId=${serverId}`;
    setLoading(true);
    (async () => {
      try {
        const o = await api<Overview>(`/panel/overview${scope}`);
        if (!cancelled) setOverview(o);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
      }
      try {
        const sep = scope ? '&' : '?';
        const a = await api<{ entries: AuditEntry[] }>(
          `/panel/audit${scope}${sep}limit=6`,
        );
        if (!cancelled) setAudit(a.entries);
      } catch (e) {
        if (e instanceof UnauthorizedError) return;
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">
            Live counters across servers, clans, members, kills, and capes.
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

      {serverId === null ? (
        <SelectServerPrompt>
          <p className="text-sm text-[var(--text-faint)]">
            Pick a server in the top bar (or &ldquo;All servers&rdquo; for an
            aggregated view) to load counters.
          </p>
        </SelectServerPrompt>
      ) : loading ? (
        <>
          <SkeletonMetricGrid count={5} />
          <div className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      ) : !overview ? (
        <p className="eyebrow">Overview unavailable.</p>
      ) : (
        <>
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StaggerItem>
              <MetricCard label="Servers" value={overview.servers} icon="dns" hint="Registered" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard label="Clans" value={overview.clans} icon="groups" hint="Active" />
            </StaggerItem>
            <StaggerItem>
              <MetricCard
                label="Members"
                value={overview.members}
                icon="person"
                hint="Across all clans"
              />
            </StaggerItem>
            <StaggerItem>
              <MetricCard
                label="Kills MTD"
                value={overview.killsMtd}
                icon="bolt"
                hint="Month to date"
              />
            </StaggerItem>
            <StaggerItem>
              <MetricCard
                label="Capes"
                value={overview.capesAssigned}
                icon="image"
                hint={`${overview.clans - overview.capesAssigned} pending`}
              />
            </StaggerItem>
          </Stagger>

          <Stagger className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <StaggerItem>
              <RecentAuditCard entries={audit.slice(0, 6)} />
            </StaggerItem>
            <StaggerItem>
              <QuickLinksCard />
            </StaggerItem>
          </Stagger>
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
          {typeof value === 'number' ? <CountUp value={value} pad={2} /> : value}
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
              <span className="truncate text-[var(--text-soft)]">
                <span className="text-white">{a.action ?? 'EVENT'}</span>
                {a.actor ? ` · ${a.actor}` : ''}
                {a.target ? ` · ${a.target}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickLinksCard() {
  const links: Array<{ href: string; label: string; icon: string; hint: string }> = [
    { href: '/dashboard/clans', label: 'Clan cosmetics', icon: 'checkroom', hint: 'Capes · trims · banners' },
    { href: '/dashboard/leaderboard', label: 'Leaderboard', icon: 'leaderboard', hint: 'K/D rankings' },
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
