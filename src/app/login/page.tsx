'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getToken } from '@/lib/api';
import { PluginStatus } from '@/components/PluginStatus';

/**
 * Phase 1 login — classic credentials only.
 *
 * No 3D, no scenes, no nickname lookup. Single purpose: authenticate the
 * server admin via JWT against the API, then route to /dashboard.
 *
 * The fancy nickname/skin/cape Hero Select flow lands in Phase 2 once the
 * basic stack is deployed and the plugin endpoints are verified end-to-end.
 */
export default function LoginPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Already logged in? Skip the form.
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
    <main className="relative min-h-screen w-full overflow-hidden bg-[#050505]">
      {/* Subtle grain over deep black */}
      <div className="grain" aria-hidden />

      {/* Top bar: logo left, plugin status right */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-8">
        <div className="select-none">
          <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/95">
            Clan Capes
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            admin panel
          </div>
        </div>
        <PluginStatus />
      </header>

      {/* Centered classic login card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-sm"
        >
          <h1 className="mb-1 font-mono text-[11px] uppercase tracking-[0.28em] text-white/60">
            Sign in
          </h1>
          <p className="mb-6 text-sm text-white/40">Admin credentials</p>

          <label htmlFor="username" className="label-mono mb-1.5 block">
            Username
          </label>
          <div className="input-group mb-4">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="icon"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
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

          <label htmlFor="password" className="label-mono mb-1.5 block">
            Password
          </label>
          <div className="input-group mb-6">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="icon"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="password"
              name="password"
              type={showPass ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/50 hover:text-white"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a17.6 17.6 0 0 1 4.06-5.06m3.16-2A11 11 0 0 1 12 4c7 0 11 8 11 8a17.6 17.6 0 0 1-3.06 4.06" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {error && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-red-300/90">
              {error}
            </p>
          )}
        </form>
      </div>

      {/* Bottom-left footer: version + paper tag */}
      <footer className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between px-6 py-5 sm:px-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
          v1.0 · paper 1.21.4
        </div>
      </footer>
    </main>
  );
}
