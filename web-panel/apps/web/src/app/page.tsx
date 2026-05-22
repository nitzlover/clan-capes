'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await login(String(form.get('username')), String(form.get('password')));
      router.push('/dashboard');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-panel p-8 shadow-2xl"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clan Capes</h1>
          <p className="mt-1 text-sm text-muted">Admin panel — manage clan capes</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">
          Username
          <input
            name="username"
            required
            className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2"
            autoComplete="username"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2"
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent py-2.5 font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
