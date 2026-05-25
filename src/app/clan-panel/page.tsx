'use client';

/**
 * Leader-panel entrypoint.
 *
 * Two paths land here:
 *   1. Player clicks the link the plugin printed after `/clan panel`
 *      (auto-fills the ?t=… query param and exchanges immediately).
 *   2. Player visits manually and pastes the token plaintext.
 *
 * On a successful exchange the panel sets the HttpOnly cookie and we
 * redirect to /clan-panel/<TAG>. On any error the form re-renders with
 * the reason so the player knows whether to re-run /clan panel or just
 * try again.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type ExchangeResponse = {
  ok: boolean;
  clan: string;
  role: 'leader' | 'deputy';
  playerUuid: string;
  playerName: string;
};

/**
 * Wrap the inner client component in a Suspense boundary — Next.js 15
 * fails the production build (`useSearchParams() should be wrapped in
 * a suspense boundary`) without it because the hook bails out of
 * static prerender. The fallback only shows during the React tree
 * hydration window so users effectively never see it.
 */
export default function ClanPanelEntry() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
          <p className="text-sm text-[var(--text-mute)]">Loading…</p>
        </main>
      }
    >
      <ClanPanelEntryInner />
    </Suspense>
  );
}

function ClanPanelEntryInner() {
  const router = useRouter();
  const search = useSearchParams();
  const presetToken = search?.get('t') ?? '';

  const [token, setToken] = useState(presetToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const exchange = useCallback(
    async (raw: string) => {
      if (busy) return;
      const value = raw.trim();
      if (!value) {
        setError('Token required');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const res = await fetch('/api/leader/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: value }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ExchangeResponse;
        router.replace(`/clan-panel/${encodeURIComponent(data.clan)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Exchange failed');
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );

  // Auto-attempt on first load when ?t=… arrived from the plugin.
  useEffect(() => {
    if (presetToken) {
      void exchange(presetToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="page-title">Clan panel</h1>
      <p className="page-subtitle mt-2 mb-6">
        Paste the token your in-game <code className="font-mono">/clan panel</code> output
        printed. Each token works once and expires in ~10 minutes.
      </p>

      <form
        className="brutal-card flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void exchange(token);
        }}
      >
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Token
          </span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="lpt_…"
            className="brutal-input mt-1 w-full font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="brutal-btn disabled:opacity-40"
        >
          {busy ? 'Exchanging…' : 'Sign in'}
        </button>
        {error && (
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
            ! {error}
          </p>
        )}
      </form>
    </main>
  );
}
