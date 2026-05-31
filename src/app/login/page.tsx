'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getToken } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';

/**
 * Login — monochrome modern.
 *
 * Split editorial: oversized typographic statement on the left, lean
 * sign-in form on the right, divided by a hairline. Colours, fonts and the
 * split layout are unchanged from the shipped build — this pass only
 * tightens the *presentation* of the information blocks, the form fields
 * and the button (recessed input wells, clearer focus, aligned meta rail).
 */
export default function LoginPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

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
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Top rail — brandmark left, plugin status right. */}
      <header className="relative z-10 flex items-center justify-between border-b border-[var(--rule)] px-6 py-5 sm:px-10">
        <div className="select-none">
          <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-white">
            Clan / Capes
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Admin panel
          </div>
        </div>
        <PluginStatus />
      </header>

      <div className="relative z-10 grid min-h-[calc(100dvh-72px)] grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
        {/* Left field — typographic mass + editorial meta. */}
        <section className="relative flex flex-col justify-end overflow-hidden border-b border-[var(--rule)] px-6 py-12 sm:px-10 lg:border-b-0 lg:border-r lg:px-14 lg:py-16">
          <MetaRail />

          <p className="eyebrow reveal-eyebrow">Authentication</p>
          <h1 className="display-xl reveal mt-6" style={{ animationDelay: '60ms' }}>
            Clan
            <br />
            Capes
            <br />
            <span className="text-[var(--text-faint)]">Admin.</span>
          </h1>

          {/* Bottom cue — single line, no longer duplicating the meta rail. */}
          <div
            className="reveal mt-12 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]"
            style={{ animationDelay: '180ms' }}
          >
            <span className="h-px w-8 bg-[var(--rule-strong)]" />
            <span>Operator sign-in</span>
          </div>
        </section>

        {/* Right field — bare login form. */}
        <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <form onSubmit={onSubmit} className="w-full max-w-sm" noValidate>
            <p className="eyebrow">Sign in</p>
            <h2 className="display mt-4">Enter.</h2>

            <div className="mt-10 space-y-6">
              <Field
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                autoFocus
                placeholder="admin"
              />

              <div>
                <label htmlFor="password" className="label-mono mb-2.5 block">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={FIELD_CLS + ' pr-16'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-mute)] transition-colors hover:text-white"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? 'hide' : 'show'}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary group mt-9 w-full justify-between active:translate-y-px"
            >
              <span>{loading ? 'Signing in…' : 'Sign in'}</span>
              {!loading && (
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              )}
            </button>

            <div
              aria-live="polite"
              className="mt-4 min-h-[1.25rem] font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-mute)]"
            >
              {error && (
                <span className="inline-flex items-center gap-2 text-white">
                  <span className="inline-block h-1.5 w-1.5 bg-[var(--danger)]" />
                  {error}
                </span>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

/**
 * Recessed field well. Same palette as the old `.input` (transparent over
 * near-black, white-on-focus border) but with a faint inner fill so the
 * field reads as an input, taller hit area, and a clearer focus border.
 */
const FIELD_CLS =
  'w-full border border-[var(--rule)] bg-white/[0.02] px-4 py-3 text-[0.9375rem] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none transition-colors hover:border-[var(--rule-strong)] focus:border-[var(--ink-50)]';

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label-mono mb-2.5 block">
        {label}
      </label>
      <input id={id} required {...props} className={FIELD_CLS} />
    </div>
  );
}

/**
 * Editorial meta rail — top-right of the hero. Tightened into one aligned
 * stack (rule + caption block + index numeral) instead of scattered lines.
 * Same monochrome tokens as before.
 */
function MetaRail() {
  return (
    <div className="pointer-events-none absolute right-8 top-8 hidden select-none flex-col items-end gap-3 opacity-60 lg:flex">
      <div className="h-px w-44 bg-[var(--rule-strong)]" />
      <div className="flex flex-col items-end gap-1.5 font-mono text-[10px] uppercase tracking-[0.28em]">
        <span className="text-[var(--text-mute)]">Vol. 01</span>
        <span className="text-[var(--text-faint)]">Operator surface</span>
        <span className="text-[var(--text-faint)]">Capes · Banners · Audit</span>
      </div>
      <div className="mt-1 h-10 w-px bg-[var(--rule)]" />
      <div className="font-mono text-5xl font-bold leading-none tracking-tighter text-[var(--ink-50)] tabular">
        /01
      </div>
    </div>
  );
}
