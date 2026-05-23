import { MINECRAFT_API_TOKEN, MINECRAFT_API_URL } from './env';

const BASE = () => MINECRAFT_API_URL;
const TOKEN = () => MINECRAFT_API_TOKEN;

/**
 * Default per-request timeout when talking to the Paper plugin REST.
 * Plugin may be unreachable for many reasons in production (Apex firewall,
 * server restart, port not exposed). Without a hard cap, route handlers on
 * Railway just hang on `fetch()` forever and the dashboard stays on
 * "Loading…" because there's no default fetch timeout in Node.
 */
const PLUGIN_TIMEOUT_MS = 5000;

async function fetchPlugin(
  path: string,
  init: RequestInit = {},
  timeoutMs = PLUGIN_TIMEOUT_MS
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE()}${path}`, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function pluginHealth(): Promise<{ ok: boolean; latencyMs?: number }> {
  const started = Date.now();
  try {
    const res = await fetchPlugin('/api/health', {}, 2500);
    return { ok: res.ok, latencyMs: Date.now() - started };
  } catch {
    return { ok: false };
  }
}

export async function fetchClan(tag: string) {
  const res = await fetchPlugin(`/api/clan/${encodeURIComponent(tag)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Minecraft API error ${res.status}`);
  return res.json();
}

export type PlayerCapeDto = {
  uuid: string;
  clanTag?: string | null;
  capeUrl?: string | null;
  updatedAt?: number;
  updatedBy?: string | null;
};

export async function fetchPlayerCape(uuid: string): Promise<PlayerCapeDto | null> {
  const res = await fetchPlugin(`/api/player/${encodeURIComponent(uuid)}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Minecraft API error ${res.status}`);
  return res.json() as Promise<PlayerCapeDto>;
}

export async function setClanCape(tag: string, capeUrl: string, actor: string) {
  const res = await fetchPlugin(`/api/clan/${encodeURIComponent(tag)}/cape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ClanCapes-Token': TOKEN(),
    },
    body: JSON.stringify({ capeUrl, actor }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Failed ${res.status}`);
  }
  return res.json();
}

export async function deleteClanCape(tag: string) {
  const res = await fetchPlugin(`/api/clan/${encodeURIComponent(tag)}/cape`, {
    method: 'DELETE',
    headers: { 'X-ClanCapes-Token': TOKEN() },
  });
  if (!res.ok) throw new Error(`Failed ${res.status}`);
  return res.json();
}

export type PowerClanRow = {
  id: string;
  tag: string;
  leader: string;
  level: number;
};

// ----- Clan banner (shield NBT) -----------------------------------------------

export type BannerPatternSpec = {
  color: number;
  pattern: string;
};

export type ClanBannerDto = {
  clan: string;
  baseColor: number;
  patterns: BannerPatternSpec[];
  updatedAt: number;
  updatedBy: string;
};

export async function fetchClanBanner(tag: string): Promise<ClanBannerDto | null> {
  const res = await fetchPlugin(`/api/clan/${encodeURIComponent(tag)}/banner`, {
    headers: { 'X-ClanCapes-Token': TOKEN() },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Banner API error ${res.status}`);
  }
  return res.json() as Promise<ClanBannerDto>;
}

export async function setClanBanner(
  tag: string,
  baseColor: number,
  patterns: BannerPatternSpec[],
  actor: string
): Promise<ClanBannerDto> {
  const res = await fetchPlugin(`/api/clan/${encodeURIComponent(tag)}/banner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ClanCapes-Token': TOKEN(),
    },
    body: JSON.stringify({ baseColor, patterns, actor }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Banner save failed ${res.status}`);
  }
  return res.json() as Promise<ClanBannerDto>;
}

export async function deleteClanBanner(tag: string) {
  const res = await fetchPlugin(`/api/clan/${encodeURIComponent(tag)}/banner`, {
    method: 'DELETE',
    headers: { 'X-ClanCapes-Token': TOKEN() },
  });
  if (!res.ok) throw new Error(`Banner delete failed ${res.status}`);
  return res.json();
}

export async function fetchPowerClans(): Promise<PowerClanRow[]> {
  const res = await fetchPlugin('/api/powerclans/clans', {
    headers: { 'X-ClanCapes-Token': TOKEN() },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `PowerClans API error ${res.status}`);
  }
  const data = (await res.json()) as { clans: PowerClanRow[] };
  return data.clans ?? [];
}
