'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PluginStatus } from '@/components/PluginStatus';
import { getToken } from '@/lib/api';

/**
 * Dashboard shell.
 *
 * Sidebar on the left (collapses to a horizontal top bar under md), main
 * content on the right. Auth-gated at the layout level so every subroute
 * inherits the same redirect + global 401 listener.
 *
 * Routes wired here:
 *   /dashboard          — overview
 *   /dashboard/capes    — PNG upload + clan roster
 *   /dashboard/banners  — per-clan shield banner editor
 *   /dashboard/audit    — operator trail
 *
 * Visual idiom: B&W brutalist. 2px white-ish borders, 6px offset white
 * shadows, hard right-angle corners, uppercase tracked type. Active nav
 * row is an inverted slab (white bg, black ink) pushed up-left like a
 * physical sticker — same trick the source mockups use to mark the
 * current page.
 */

const NAV: Array<{
  href: string;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: 'dashboard',
    hint: 'Status + counters',
  },
  {
    href: '/dashboard/servers',
    label: 'Servers',
    icon: 'dns',
    hint: 'One-time-pass setup',
  },
  {
    href: '/dashboard/clans',
    label: 'Clans',
    icon: 'groups',
    hint: 'DB roster + members',
  },
  {
    href: '/dashboard/capes',
    label: 'Capes',
    icon: 'image',
    hint: 'PNG upload + roster',
  },
  {
    href: '/dashboard/banners',
    label: 'Banners',
    icon: 'shield',
    hint: 'Per-clan crest',
  },
  {
    href: '/dashboard/events',
    label: 'Events',
    icon: 'schedule',
    hint: 'Airdrop · KotH config',
  },
  {
    href: '/dashboard/audit',
    label: 'Audit',
    icon: 'receipt_long',
    hint: 'Operator trail',
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Auth check + single global 401 listener — every API helper in /lib
  // throws UnauthorizedError on 401, which fires this event and bounces
  // the user back to /login from one place.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/');
      setAuthed(false);
      return;
    }
    setAuthed(true);
    function onUnauthorized() {
      router.replace('/');
    }
    window.addEventListener('clancapes:unauthorized', onUnauthorized);
    return () => window.removeEventListener('clancapes:unauthorized', onUnauthorized);
  }, [router]);

  function logout() {
    localStorage.removeItem('clancapes_token');
    router.replace('/');
  }

  if (authed !== true) {
    return (
      <main className="min-h-[100dvh] bg-[var(--bg)] px-6 py-12 text-[var(--text-mute)]">
        <p className="eyebrow">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <Sidebar pathname={pathname} onLogout={logout} />
      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-10 md:px-10 md:py-12">
        {children}
      </main>
    </div>
  );
}

function Sidebar({
  pathname,
  onLogout,
}: {
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <aside
      className="
        flex shrink-0 flex-col bg-[var(--bg)]
        border-b-2 md:border-b-0 md:border-r-2 border-[var(--rule-strong)]
        md:sticky md:top-0 md:h-[100dvh]
        md:w-[260px]
      "
    >
      {/* Brand block. */}
      <div className="flex items-center gap-3 border-b-2 border-[var(--rule-strong)] px-5 py-5">
        <div className="brutal-tile flex aspect-square h-11 w-11 items-center justify-center">
          <span className="material-symbols-outlined filled">terminal</span>
        </div>
        <div className="min-w-0">
          <p className="font-sans text-base font-extrabold uppercase leading-none tracking-tight text-white">
            Clan / Capes
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Admin · v1
          </p>
        </div>
      </div>

      {/* Nav. Scrolls if it ever overflows; on desktop it almost never will
          but mobile horizontal scroll keeps long labels visible. */}
      <nav className="flex flex-1 flex-col gap-2 overflow-x-auto p-4 md:overflow-y-auto md:flex-col">
        <div className="flex flex-row gap-2 md:flex-col">
          {NAV.map((item) => {
            const active =
              item.href === '/dashboard'
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? 'is-active' : ''}`}
                title={item.hint}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Plugin status + sign out — pinned to bottom on desktop, inline on
          mobile so the header bar doesn't grow huge. */}
      <div className="hidden flex-col gap-3 border-t-2 border-[var(--rule-strong)] p-4 md:flex">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Plugin
          </span>
          <PluginStatus />
        </div>
        <button onClick={onLogout} className="btn-ghost w-full justify-center">
          Sign out
        </button>
      </div>
    </aside>
  );
}
