'use client';

/**
 * DioramaLogin — the operator-login shell built around a staged MinecraftScene.
 *
 * 2026-06-10 full redesign (carte blanche from the user): the old two-column
 * split (scene left / form column right) is gone. The scene is now FULL-BLEED
 * behind everything and the sign-in form floats over it as a centered glass
 * card; the brand mark and the plugin pill float in the corners. Identity is
 * the panel's dark + gold (#F2C14E) — gold CTA, gold focus, gold beacon scene.
 *
 * A page supplies `members` to resolve skins for (may be empty — the live
 * gate scene is character-free) and a `buildScene` that turns those skins
 * into a SceneSpec. The same component backs the live `/login` and every
 * `/login-preview/*`, so they can never drift apart.
 */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getToken } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';
import { MinecraftScene, type SceneSpec } from './v9/MinecraftScene';

export function DioramaLogin({
  members,
  buildScene,
  backgroundImage,
  fallbackSkin = '/skins/steve.png',
  caption,
  loadingLabel = 'building the scene…',
  redirectIfAuthed = false,
}: {
  /** Clan nicknames to resolve skins for (via the /api/skin Mojang proxy). */
  members: string[];
  /** Turns the resolved skins into the scene to stage. */
  buildScene?: (skins: string[]) => SceneSpec;
  /**
   * Pre-rendered backdrop (shader-quality art) instead of the live three.js
   * scene. When set, no skins are fetched and the 3D engine never loads —
   * the image is the world (slow Ken-Burns drift for life). This is what the
   * live /login uses; the three.js scenes remain for /login-preview/*.
   */
  backgroundImage?: string;
  fallbackSkin?: string;
  /** Optional bottom-centre caption over the scene. Omit for none. */
  caption?: string;
  /** Placeholder shown while skins resolve. */
  loadingLabel?: string;
  /** Live login only: bounce an already-signed-in operator to the dashboard. */
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

  // Resolve each member's skin from their nickname (per-member Steve fallback
  // so the scene never breaks on a miss). Empty member list resolves
  // immediately — the gate scene has no characters.
  const memberKey = members.join(',');
  useEffect(() => {
    if (backgroundImage) return; // image backdrop — no skins to resolve
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
    () => (skins && buildScene ? buildScene(skins) : null),
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
    <main className="v9-root relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      {/* ── full-bleed backdrop: pre-rendered art OR the live 3D scene ── */}
      {backgroundImage ? (
        <div
          aria-hidden
          className="v9-bg absolute inset-0"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      ) : (
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
      )}
      {/* vignette — pulls the eye to the centre, hides the canvas edges */}
      <div className="v9-vignette pointer-events-none absolute inset-0" />

      {/* ── floating chrome ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-6 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-xl leading-none text-[var(--accent)] drop-shadow-[0_2px_12px_rgba(242,193,78,0.5)]">
            ❖
          </span>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold lowercase leading-none tracking-tight">
              crestoria
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-white/40">
              Operator panel
            </span>
          </div>
        </div>
        <div className="pointer-events-auto">
          <PluginStatus />
        </div>
      </header>

      {/* ── the glass gate card — centred on mobile; on wide screens it sits
            right-of-centre so the artwork's lodge (left) stays visible ── */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4 lg:justify-end lg:pr-[9vw]">
        <form onSubmit={onSubmit} className="v9-card w-full max-w-[400px]" noValidate>
          <div className="flex items-center gap-3">
            <span aria-hidden className="block h-[2px] w-6 bg-[var(--accent)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/55">
              Operator gate
            </span>
          </div>
          <h1 className="v9-title mt-4">
            Sign in<span className="text-[var(--accent)]">.</span>
          </h1>

          <div className="mt-7 space-y-4">
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

          <button type="submit" disabled={loading} className="v9-cta mt-7 w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div aria-live="polite" className="mt-3 min-h-[1.25rem] font-mono text-[10px] uppercase tracking-[0.24em]">
            {error && (
              <span className="inline-flex items-center gap-2 text-white">
                <span className="block h-1.5 w-1.5 bg-[var(--accent)]" />
                {error}
              </span>
            )}
          </div>
        </form>
      </div>

      {caption && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
          {caption}
        </div>
      )}

      <style jsx global>{`
        .v9-root, .v9-root input, .v9-root button { font-family: var(--font-sans, var(--font-geist-sans, system-ui, -apple-system, 'Segoe UI', sans-serif)); }
        .v9-card {
          padding: 2.25rem 2rem 1.5rem;
          background: rgba(8, 8, 10, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top-color: rgba(242, 193, 78, 0.35);
          border-radius: 1rem;
          box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.85), 0 0 60px -24px var(--accent-glow, rgba(242,193,78,0.22));
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .v9-title { font-weight: 800; letter-spacing: -0.04em; line-height: 0.95; font-size: clamp(2rem, 5vw, 2.75rem); text-transform: uppercase; color: #fff; }
        .v9-label { display: block; font-family: var(--font-mono, var(--font-geist-mono, ui-monospace, 'JetBrains Mono', 'SFMono-Regular', monospace)); font-size: 0.6875rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .v9-input { width: 100%; height: 48px; padding: 0 1rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.14); border-radius: 0.625rem; color: #fff; font-size: 0.9375rem; outline: none; transition: border-color .15s ease, background .15s ease, box-shadow .15s ease; caret-color: var(--accent, #f2c14e); }
        .v9-input:hover { border-color: rgba(255,255,255,0.32); }
        .v9-input:focus { border-color: var(--accent, #f2c14e); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px var(--accent-soft, rgba(242,193,78,0.13)); }
        .v9-input::placeholder { color: rgba(255,255,255,0.3); }
        .v9-eye { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-family: var(--font-mono, var(--font-geist-mono, ui-monospace, monospace)); font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; padding: 6px 8px; color: rgba(255,255,255,0.5); transition: color .12s ease, background .12s ease; }
        .v9-eye:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .v9-cta { height: 52px; background: var(--accent, #f2c14e); color: var(--accent-ink, #241c00); font-weight: 700; font-size: 0.8125rem; letter-spacing: 0.2em; text-transform: uppercase; border: 1px solid var(--accent, #f2c14e); border-radius: 0.625rem; box-shadow: 0 10px 30px -10px var(--accent-glow, rgba(242,193,78,0.35)); transition: background .15s ease, box-shadow .15s ease; }
        .v9-cta:hover:not(:disabled) { background: var(--accent-bright, #ffd36b); border-color: var(--accent-bright, #ffd36b); }
        .v9-cta:disabled { opacity: 0.4; cursor: not-allowed; }
        .v9-cta:active { transform: translateY(1px); }
        .v9-scene canvas { image-rendering: auto; }
        /* near-native Minecraft color — nights are dark, not desaturated
           (the muted grade made the world read grey/alien) */
        .v9-scene { filter: saturate(1) contrast(1.03) brightness(1.05); }
        /* pre-rendered backdrop — slow Ken-Burns drift so the still image
           breathes; the overscale also hides the animation's edges */
        .v9-bg {
          background-size: cover;
          background-position: 38% 60%;
          animation: v9-kenburns 50s ease-in-out infinite alternate;
          will-change: transform;
        }
        @keyframes v9-kenburns {
          from { transform: scale(1.03) translateX(0); }
          to { transform: scale(1.1) translateX(-1.5%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .v9-bg { animation: none; }
        }
        .v9-vignette { background: radial-gradient(120% 95% at 50% 42%, transparent 30%, rgba(0,0,0,0.34) 70%, rgba(0,0,0,0.72) 100%); }
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
