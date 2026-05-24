/**
 * Client-side API helper. All requests are now SAME-ORIGIN under `/api/*`
 * because the panel UI and the REST endpoints live in one Next.js process.
 * There is no NEXT_PUBLIC_API_URL anymore — everything is relative.
 */

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('clancapes_token');
}

/**
 * Thrown when any panel request returns 401. Carried as a typed error so
 * callers can branch on `instanceof UnauthorizedError` instead of regex-
 * matching the message string.
 *
 * The constructor also clears the stale token and dispatches a global
 * `clancapes:unauthorized` event so listeners (the dashboard shell)
 * can route the user to /login *once*, no matter how many components
 * trip the 401 in parallel. Without this every component that fetches
 * /panel/clans would silently fail and hammer the server every render —
 * the bug visible in the network panel.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clancapes_token');
      window.dispatchEvent(new CustomEvent('clancapes:unauthorized'));
    }
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const data = (await res.json()) as { token: string };
  localStorage.setItem('clancapes_token', data.token);
  return data.token;
}

export type ClanRow = {
  tag: string;
  capeUrl: string;
  updatedAt: number;
  updatedBy: string;
};

export type ClanOption = {
  id: string;
  tag: string;
  leader: string;
  level: number;
  hasCape: boolean;
};

export async function fetchClanOptions() {
  return api<{ clans: ClanOption[] }>('/panel/clans/options');
}

export type ClanBannerDto = {
  clan: string;
  baseColor: number;
  patterns: Array<{ color: number; pattern: string }>;
  updatedAt: number;
  updatedBy: string;
};

export async function fetchClanBanner(tag: string): Promise<ClanBannerDto | null> {
  const token = getToken();
  const res = await fetch(`/api/panel/clans/${encodeURIComponent(tag)}/banner`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }
  return res.json() as Promise<ClanBannerDto>;
}

export async function saveClanBanner(
  tag: string,
  baseColor: number,
  patterns: Array<{ color: number; pattern: string }>
): Promise<ClanBannerDto> {
  return api<ClanBannerDto>(`/panel/clans/${encodeURIComponent(tag)}/banner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseColor, patterns }),
  });
}

export async function deleteClanBanner(tag: string) {
  return api<{ ok: boolean }>(`/panel/clans/${encodeURIComponent(tag)}/banner`, {
    method: 'DELETE',
  });
}
