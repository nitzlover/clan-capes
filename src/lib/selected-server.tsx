'use client';

/**
 * Single source of truth for "which server is the admin currently
 * looking at?" — replaces the per-page `useState<number | null>`
 * pickers that 1.0.0..1.0.12 grew independently across every
 * dashboard subroute.
 *
 * <h2>Contract</h2>
 * The selected server is a {@link SelectedServer}: a numeric server
 * id, the string {@code 'all'} for aggregated views, or {@code null}
 * when nothing has been picked yet. Pages must handle all three
 * states explicitly — there is no implicit "default to newest server"
 * fallback any more. That fallback was the source of the
 * cape-upload-to-wrong-server bug audit H3 flagged.
 *
 * <h2>Persistence</h2>
 * Selection is held in two places in priority order:
 *   1. The URL `?server=<value>` query string (so a link to a clan
 *      page on test-5606 stays on test-5606 when shared in Discord).
 *   2. localStorage under {@link STORAGE_KEY} (so a page reload
 *      without the query string remembers what you were last
 *      looking at).
 *
 * <p>When the user picks a server in the {@link ServerPicker}, both
 * are updated. URL navigation is via {@code router.replace} so the
 * back button doesn't grow a history entry per picker change.
 */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SelectedServer = number | 'all' | null;

type SelectedServerCtx = {
  /** Numeric server id, the literal 'all', or null when unset. */
  value: SelectedServer;
  /** Update both the URL ?server= and localStorage. */
  set: (next: SelectedServer) => void;
};

const STORAGE_KEY = 'clancapes_selected_server';

const Ctx = createContext<SelectedServerCtx | null>(null);

/**
 * Provider wired once into the dashboard layout. Reads the initial
 * value from URL first, then localStorage; writes back to both on
 * every {@link SelectedServerCtx#set} call.
 */
export function SelectedServerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [value, setValue] = useState<SelectedServer>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('server');
    if (raw === 'all') return 'all';
    if (raw && /^\d+$/.test(raw)) return Number(raw);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'all') return 'all';
    if (stored && /^\d+$/.test(stored)) return Number(stored);
    return null;
  });

  // Reflect URL changes (back/forward navigation) into the context.
  useEffect(() => {
    const raw = search.get('server');
    if (raw === 'all') {
      if (value !== 'all') setValue('all');
      return;
    }
    if (raw && /^\d+$/.test(raw)) {
      const n = Number(raw);
      if (value !== n) setValue(n);
      return;
    }
    // URL has no ?server — keep whatever was in state (likely came
    // from localStorage on initial mount). Don't reset to null.
  }, [search, value]);

  const set = useCallback(
    (next: SelectedServer) => {
      setValue(next);
      // Persist + sync URL atomically.
      try {
        if (next === null) {
          window.localStorage.removeItem(STORAGE_KEY);
        } else {
          window.localStorage.setItem(STORAGE_KEY, String(next));
        }
      } catch {
        /* localStorage blocked (Safari private etc.) — ignore */
      }
      const params = new URLSearchParams(search.toString());
      if (next === null) {
        params.delete('server');
      } else {
        params.set('server', String(next));
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, router, search],
  );

  const ctx = useMemo<SelectedServerCtx>(() => ({ value, set }), [value, set]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** Hook every consumer reads from. Throws when used outside the provider. */
export function useSelectedServer(): SelectedServerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useSelectedServer must be inside <SelectedServerProvider>',
    );
  }
  return ctx;
}

/**
 * Render the current selection into a `?server=…` query fragment
 * (including the leading `?` when non-empty, otherwise empty string).
 * Pages that fetch should append this to any admin API path:
 *
 *   const qs = serverQueryString(value);
 *   const data = await api(`/panel/clans${qs}`);
 *
 * @param value selection from {@link useSelectedServer}
 * @param extra additional query params to merge (without leading `?`)
 */
export function serverQueryString(
  value: SelectedServer,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams();
  // Key MUST be `serverId` — every /api/panel resolver reads
  // searchParams.get('serverId'). `server` was a DEAD key: nothing read
  // it, so the request silently fell back to the newest server. That is
  // why cape upload/roster hit the wrong tenant ("clan not found on this
  // server" even though the picker — which uses ?serverId — showed it).
  if (value === 'all') params.set('serverId', 'all');
  else if (typeof value === 'number') params.set('serverId', String(value));
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue;
    params.set(k, String(v));
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}
