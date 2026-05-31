'use client';

/**
 * V9 — login: staged Minecraft diorama.
 *
 * The hero is no longer a single posable avatar — it's a *scene* built by the
 * MinecraftScene engine. First scene: two characters seated around a campfire.
 * Static (characters never move; only a subtle fire flicker), pure B&W, fits
 * the viewport, form on the right.
 *
 * Scenes are data (SceneSpec) — new ideas drop in by editing SCENE below.
 */

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';
import { MinecraftScene, type SceneSpec, type NodeXform } from './MinecraftScene';

const SKIN = '/avagen/skin-admin.png';
const STEVE = '/skins/steve.png';
const CAPE = '/login-assets/cape.png'; // optional — loads only if present

// Exact seated node transform (verified 1:1 in /studio against the studio's own
// node state — thighs forward, shins down, arms at sides, torso upright). Sits a
// figure on the plank bench far more truthfully than the hand-tuned delta pose.
const SEATED: NodeXform = {
  Body: { rotation: [Math.PI / 2, 0, 0] },
  Head: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  ArmLeftLower: { rotation: [0, 0, 0], translation: [0, 0.4, 0] },
  ArmLeftUpper: { scale: 1, rotation: [Math.PI, 0, -0.19198621771937624], translation: [0.6, 0.41, 0] },
  LegLeftLower: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  LegLeftUpper: { scale: 1, rotation: [-Math.PI, 0, -0.2792526803190927], translation: [0.23, 0.18, 0] },
  ArmRightLower: { rotation: [0, 0, 0], translation: [0, 0.4, 0] },
  ArmRightUpper: { scale: 1, rotation: [Math.PI, 0, 0.08726646259971647], translation: [-0.6, 0.3, 0] },
  LegRightLower: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  LegRightUpper: { scale: 1, rotation: [-Math.PI, 0, 0.20943951023931953], translation: [-0.2, 0.11, 0] },
};

export default function LoginV9() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // "Two around a campfire". Identity is stable so the scene builds once.
  const scene = useMemo<SceneSpec>(
    () => ({
      fire: true,
      groundY: -16,
      camera: { position: [0, 18, 122], target: [0, -2, 0], fov: 34 },
      background: { stars: true, moon: [48, 50, -140], fog: [155, 340] },
      props: [
        { type: 'campfire', position: [0, -2, 0] },
        // plank seats the two characters sit on (top surface at y = -10)
        { type: 'seat', position: [-26, -13, 4], width: 24 },
        { type: 'seat', position: [26, -13, 4], width: 24 },
        // background trees (varied height/depth → painterly skyline)
        { type: 'tree', position: [-82, -16, -58], trunk: 40, rotationY: 0.6 },
        { type: 'tree', position: [74, -16, -72], trunk: 48, rotationY: -0.4 },
        { type: 'tree', position: [22, -16, -98], trunk: 32, rotationY: 1.2 },
        { type: 'tree', position: [-42, -16, -94], trunk: 30, rotationY: -1.1 },
      ],
      characters: [
        {
          skin: SKIN,
          cape: CAPE,
          pose: { node: SEATED },
          position: [-26, -9.5, 2], // y = seat top (figure grounded to it)
          rotationY: Math.PI * 0.3, // angle toward the fire (3/4 view)
        },
        {
          skin: STEVE,
          pose: { node: SEATED },
          position: [26, -9.5, 2],
          rotationY: -Math.PI * 0.3,
        },
      ],
    }),
    [],
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
          <div className="grid h-9 w-9 place-items-center border border-white/22">
            <span className="text-[10px] font-bold tracking-[0.2em]">CC</span>
          </div>
          <div className="hidden flex-col sm:flex">
            <span className="text-[13px] font-semibold tracking-[0.02em]">Clan Capes</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">
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
            <MinecraftScene scene={scene} className="h-full w-full" />
          </div>
          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
            Crownless · around the fire
          </div>
        </section>

        {/* Form */}
        <section className="relative flex min-h-0 items-center justify-center border-t border-white/10 px-6 py-8 lg:border-l lg:border-t-0 lg:px-10">
          <form onSubmit={onSubmit} className="w-full max-w-[340px]" noValidate>
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/50">
              Operator gate
            </div>
            <h1 className="v9-title mt-3">Sign in.</h1>

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

      <footer className="relative z-10 flex h-[44px] flex-none items-center justify-between border-t border-white/10 px-6 font-mono text-[10px] uppercase tracking-[0.28em] text-white/45 sm:px-10">
        <span>Operator only · v1.0.0</span>
        <a href="/login-preview" className="transition-colors hover:text-white">← Variants</a>
      </footer>

      <style jsx global>{`
        .v9-title { font-family: var(--font-sans); font-weight: 800; letter-spacing: -0.04em; line-height: 0.95; font-size: clamp(2rem, 5vw, 3rem); text-transform: uppercase; color: #fff; }
        .v9-label { display: block; font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .v9-input { width: 100%; height: 48px; padding: 0 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.16); color: #fff; font-family: var(--font-sans); font-size: 0.9375rem; outline: none; transition: border-color .15s ease, background .15s ease; caret-color: #fff; }
        .v9-input:hover { border-color: rgba(255,255,255,0.35); }
        .v9-input:focus { border-color: #fff; background: rgba(255,255,255,0.06); }
        .v9-input::placeholder { color: rgba(255,255,255,0.32); }
        .v9-eye { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; padding: 6px 8px; color: rgba(255,255,255,0.5); transition: color .12s ease, background .12s ease; }
        .v9-eye:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .v9-cta { height: 52px; background: #fff; color: #000; font-family: var(--font-sans); font-weight: 700; font-size: 0.8125rem; letter-spacing: 0.2em; text-transform: uppercase; border: 1px solid #fff; }
        .v9-cta:disabled { opacity: 0.4; cursor: not-allowed; }
        .v9-cta:active { transform: translateY(1px); }
        /* B&W lock + pixel crispness on the whole scene canvas */
        .v9-scene canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
        .v9-scene { filter: grayscale(1) contrast(1.05); }
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
