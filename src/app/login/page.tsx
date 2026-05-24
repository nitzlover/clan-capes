'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getToken } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';

/**
 * Login — monochrome modern.
 *
 * Split editorial: oversized typographic statement on the left, lean
 * sign-in form on the right. No glassmorphism, no rounded card shell —
 * the form sits on the bare page, separated only by a vertical rule.
 *
 * The display headline is the brand. It carries the page even before the
 * user reads the eyebrow or the form labels, which is exactly what
 * Monochrome Modern wants: form and contrast do the work color usually
 * would.
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
        {/* Left field — typographic mass + editorial motifs. */}
        <section className="relative flex flex-col justify-end overflow-hidden px-6 py-12 sm:px-10 lg:px-14 lg:py-16 border-b lg:border-b-0 lg:border-r border-[var(--rule)]">
          {/* Decorative shield silhouette + index numerals. These are
              non-content visual mass — they keep the hero from collapsing
              into pure type without violating the monochrome brief. */}
          <ShieldMotif />

          <p className="eyebrow reveal-eyebrow">Authentication</p>
          <h1 className="display-xl reveal mt-6" style={{ animationDelay: '60ms' }}>
            Clan
            <br />
            Capes
            <br />
            <span className="text-[var(--text-faint)]">Admin.</span>
          </h1>

          {/* Bottom rail of meta numbers — section/issue/release flavour. */}
          <div className="reveal mt-12 flex items-end justify-between gap-6 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]" style={{ animationDelay: '180ms' }}>
            <span>Vol. 01 · Operator surface</span>
            <span>—— Sign in →</span>
          </div>
        </section>

        {/* Right field — bare login form. */}
        <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <form onSubmit={onSubmit} className="w-full max-w-sm" noValidate>
            <p className="eyebrow">Sign in</p>
            <h2 className="display mt-4">Enter.</h2>

            <div className="mt-10 space-y-5">
              <div>
                <label htmlFor="username" className="label-mono mb-2 block">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  required
                  autoComplete="username"
                  autoFocus
                  placeholder="admin"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="password" className="label-mono mb-2 block">
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
                    className="input pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-mute)] hover:text-white"
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
              className="btn-primary mt-8 w-full"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div
              aria-live="polite"
              className="mt-4 min-h-[1.25rem] font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-mute)]"
            >
              {error && <span className="text-white">! {error}</span>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

/**
 * Editorial mark anchored to the top-right of the hero. Pure rules and
 * tabular numerals — no fake/stylised MC items, just typographic chrome
 * so the empty space carries visual weight without pretending to be a
 * Minecraft asset.
 */
function ShieldMotif() {
  return (
    <div className="pointer-events-none absolute right-8 top-8 hidden flex-col items-end gap-3 opacity-50 lg:flex">
      <div className="h-px w-40 bg-[var(--rule-strong)]" />
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-mute)]">
        Vol. 01
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
        Operator surface
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
        Capes · Banners · Audit
      </div>
      <div className="mt-2 h-12 w-px bg-[var(--rule)]" />
      <div className="font-mono text-5xl font-bold tracking-tighter text-[var(--ink-50)] tabular leading-none">
        /01
      </div>
    </div>
  );
}
