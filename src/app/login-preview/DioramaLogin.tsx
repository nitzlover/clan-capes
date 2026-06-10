'use client';

/**
 * DioramaLogin — the shared operator-login shell built around a staged
 * MinecraftScene. The hero is a *scene* (campfire / grove / quarry …); this
 * component owns the chrome that's identical across all of them: the top rail,
 * the scene mount + vignette, the sign-in form, and the B&W styling.
 *
 * A page supplies the clan `members` to resolve skins for and a `buildScene`
 * that turns those skins into a SceneSpec. The same component backs the live
 * `/login` and every `/login-preview/*`, so they can never drift apart.
 */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getToken } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';
import { MinecraftScene, type SceneSpec } from './v9/MinecraftScene';

export function DioramaLogin({
  members,
  buildScene,
  fallbackSkin = '/skins/steve.png',
  caption,
  loadingLabel = 'building the scene…',
  redirectIfAuthed = false,
}: {
  /** Clan nicknames to resolve skins for (via the /api/skin Mojang proxy). */
  members: string[];
  /** Turns the resolved skins into the scene to stage. */
  buildScene: (skins: string[]) => SceneSpec;
  fallbackSkin?: string;
  /** Optional bottom-centre caption over the scene. Omit for none. */
  caption?: string;
  /** Placeholder shown while skins resolve. */
  loadingLabel?: string;
  /** Live login only: bounce an already-signed-in operator to the dashboard.
   *  Previews leave this off so they always render the scene. */
  redirectIfAuthed?: boolean;
}) {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [skins, setSkins] = useState<string[] | null>(null);

  // Live login only: already signed in → straight to the dashboard.
  useEffect(() => {
    if (redirectIfAuthed && getToken()) router.replace('/dashboard');
  }, [router, redirectIfAuthed]);

  // Resolve each member's skin from their nickname (per-member Steve fallback so
  // the scene never breaks on a miss).
  const memberKey = members.join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      const resolved = await Promise.all(
        members.map(async (nick) => {
          try {
            const r = await fetch(`/api/skin/${encodeURIComponent(nick)}`);
            const d = (await r.json()) as { ok?: boolean; dataUrl?: string };
            return d.ok && d.dataUrl ? d.dataUrl : fallbackSkin;
          } catch {
            return fallbackSkin;
          }
        }),
      );
      if (alive) setSkins(resolved);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey, fallbackSkin]);

  const scene = useMemo<SceneSpec | null>(
    () => (skins ? buildScene(skins) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skins],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await login(String(form.get('username')), String(form.get('password')));
      router.push('/dashboard');
    } catch {
      setError('Invalid username or password.');
      setLoading(false);
    }
  }

  return (
    <main className="v9-root relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white">
      <header className="relative z-10 flex h-[56px] flex-none items-center justify-between border-b border-white/10 px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-xl leading-none text-[var(--accent)]">❖</span>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold lowercase leading-none tracking-tight">
              crestoria
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">
              Operator panel
            </span>
          </div>
        </div>
        <PluginStatus />
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_minmax(360px,420px)]">
        {/* Scene */}
        <section className="relative min-h-0 overflow-hidden">
          <div className="v9-scene absolute inset-0">
            {scene ? (
              <MinecraftScene scene={scene} className="h-full w-full" />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/25">
                  {loadingLabel}
                </span>
              </div>
            )}
          </div>
          {/* vignette — frames the diorama + lifts the centre off the dark edges */}
          <div className="v9-vignette pointer-events-none absolute inset-0" />
          {caption && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
              {caption}
            </div>
          )}
        </section>

        {/* Form */}
        <section className="relative flex min-h-0 items-center justify-center border-t border-white/10 px-6 py-8 lg:border-l lg:border-t-0 lg:px-10">
          <form onSubmit={onSubmit} className="w-full max-w-[340px]" noValidate>
            <div className="flex items-center gap-3">
              <span aria-hidden className="block h-[2px] w-6 bg-[var(--accent)]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/50">
                Operator gate
              </span>
            </div>
            <h1 className="v9-title mt-3">
              Sign in<span className="text-[var(--accent)]">.</span>
            </h1>

            <div className="mt-8 space-y-4">
              <Field id="username" label="Username" name="username" autoComplete="username" autoFocus placeholder="admin" />
              <div>
                <label htmlFor="password" className="v9-label">Password</label>
                <div className="relative mt-2">
                  <input
                    id="password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="v9-input pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="v9-eye"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? 'hide' : 'show'}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="v9-cta mt-6 w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div aria-live="polite" className="mt-3 min-h-[1.25rem] font-mono text-[10px] uppercase tracking-[0.24em]">
              {error && (
                <span className="inline-flex items-center gap-2 text-white">
                  <span className="block h-1.5 w-1.5 bg-white" />
                  {error}
                </span>
              )}
            </div>
          </form>
        </section>
      </div>

      <style jsx global>{`
        .v9-root, .v9-root input, .v9-root button, .v9-root textarea { font-family: var(--font-sans, var(--font-geist-sans, system-ui, -apple-system, 'Segoe UI', sans-serif)); }
        .v9-title { font-family: var(--font-sans, var(--font-geist-sans, system-ui, -apple-system, 'Segoe UI', sans-serif)); font-weight: 800; letter-spacing: -0.04em; line-height: 0.95; font-size: clamp(2rem, 5vw, 3rem); text-transform: uppercase; color: #fff; }
        .v9-label { display: block; font-family: var(--font-mono, var(--font-geist-mono, ui-monospace, 'JetBrains Mono', 'SFMono-Regular', monospace)); font-size: 0.6875rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .v9-input { width: 100%; height: 48px; padding: 0 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.16); color: #fff; font-family: var(--font-sans, var(--font-geist-sans, system-ui, -apple-system, 'Segoe UI', sans-serif)); font-size: 0.9375rem; outline: none; transition: border-color .15s ease, background .15s ease; caret-color: #fff; }
        .v9-input:hover { border-color: rgba(255,255,255,0.35); }
        .v9-input:focus { border-color: var(--accent, #f2c14e); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px var(--accent-soft, rgba(242,193,78,0.13)); }
        .v9-input::placeholder { color: rgba(255,255,255,0.32); }
        .v9-eye { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-family: var(--font-mono, var(--font-geist-mono, ui-monospace, 'JetBrains Mono', 'SFMono-Regular', monospace)); font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; padding: 6px 8px; color: rgba(255,255,255,0.5); transition: color .12s ease, background .12s ease; }
        .v9-eye:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .v9-cta { height: 52px; background: var(--accent, #f2c14e); color: var(--accent-ink, #241c00); font-family: var(--font-sans, var(--font-geist-sans, system-ui, -apple-system, 'Segoe UI', sans-serif)); font-weight: 700; font-size: 0.8125rem; letter-spacing: 0.2em; text-transform: uppercase; border: 1px solid var(--accent, #f2c14e); box-shadow: 0 8px 26px -10px var(--accent-glow, rgba(242,193,78,0.22)); transition: background .15s ease, box-shadow .15s ease; }
        .v9-cta:hover:not(:disabled) { background: var(--accent-bright, #ffd36b); border-color: var(--accent-bright, #ffd36b); box-shadow: 0 10px 30px -10px var(--accent-glow, rgba(242,193,78,0.3)); }
        .v9-cta:disabled { opacity: 0.4; cursor: not-allowed; }
        .v9-cta:active { transform: translateY(1px); }
        .v9-scene canvas { image-rendering: auto; }
        /* Was grayscale(1) under the old strict-B&W rule. The panel identity
           is dark + gold now — a muted-color grade lets the campfire glow
           warm (on-brand gold light) while staying cinematic, not toy-like. */
        .v9-scene { filter: saturate(0.55) contrast(1.1) brightness(1.12); }
        .v9-vignette { background: radial-gradient(116% 92% at 50% 44%, transparent 38%, rgba(0,0,0,0.28) 72%, rgba(0,0,0,0.62) 100%); mix-blend-mode: multiply; }
      `}</style>
    </main>
  );
}

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="v9-label">{label}</label>
      <input id={id} required {...props} className="v9-input mt-2" />
    </div>
  );
}
